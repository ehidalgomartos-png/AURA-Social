'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const cookieParser=require('cookie-parser');
const jwt=require('jsonwebtoken');
const db=require('../src/db');
const service=require('../src/services/resuelve-v350');
const {router}=require('../src/routes/resuelve-v350');
const SECRET='local-test-only-resuelve-350';
const TOKENS=new Map();
function token(id){if(!TOKENS.has(id))TOKENS.set(id,jwt.sign({id,authVersion:0},SECRET));return TOKENS.get(id);}
function database(){
 const questions=new Map(),answers=new Map();let qi=1,ai=1;
 const audit=[];
 const users=new Map([[1,{id:1,username:'ana',is_admin:false}],[2,{id:2,username:'luis',is_admin:false}],[3,{id:3,username:'admin',is_admin:true}]]);
 async function query(sql,args=[]){
  audit.push({sql,args});
  if(/^(?:CREATE|ALTER)\b/i.test(sql.trim()))return {rows:[],rowCount:0};
  if(/FROM users\s+WHERE id=\$1/i.test(sql)){
   const u=users.get(Number(args[0]));
   return {rowCount:u?1:0,rows:u?[{...u,age_verified:true,show_sensitive:false,status:'active',auth_token_version:0,suspended_until:null,suspension_reason:''}]:[]};
  }
  if(sql.startsWith('INSERT INTO resuelve_questions(')){
   const row={id:qi++,author_id:Number(args[0]),title:args[1],body:args[2],category:args[3],
    status:'open',accepted_answer_id:null,library_approved_answer_id:null,library_opt_out:false,created_at:new Date().toISOString()};
   questions.set(row.id,row);return {rows:[{id:row.id}],rowCount:1};
  }
  if(sql.startsWith("SELECT q.id,q.title,q.category,q.solved_at,split_part(a.body") &&
     sql.includes('library_approved_answer_id IS NULL OR')){
   const rows=[...questions.values()].filter(q=>{
    const a=answers.get(q.accepted_answer_id);
    return q.status==='resolved'&&!q.library_opt_out&&
      q.library_approved_answer_id!==q.accepted_answer_id&&
      a?.status==='visible'&&a.body.split(' Anuncio recomendado:')[0].trim().length>=80&&q.body.trim().length>=50&&
      (!args[0]||q.id<Number(args[0]));
   }).sort((a,b)=>b.id-a.id).slice(0,12).map(q=>({...q,solution:answers.get(q.accepted_answer_id).body.split(' Anuncio recomendado:')[0],
     author_username:users.get(q.author_id).username,solved_at:new Date().toISOString()}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith("SELECT q.id,q.title,q.category,q.solved_at,split_part(a.body")){
   const rows=[...questions.values()].filter(q=>{
    const a=answers.get(q.accepted_answer_id);
    return q.status==='resolved'&&!q.library_opt_out&&q.accepted_answer_id===q.library_approved_answer_id &&
     a?.status==='visible'&&a.body.split(' Anuncio recomendado:')[0].trim().length>=80&&q.body.trim().length>=50 &&
     (!args[0]||q.id<Number(args[0]))&&(!args[1]||q.category===args[1])&&
     (!args[2]||(q.title+' '+a.body.split(' Anuncio recomendado:')[0]).toLowerCase().includes(String(args[2]).toLowerCase()));
   }).sort((a,b)=>b.id-a.id).slice(0,12).map(q=>({...q,solution:answers.get(q.accepted_answer_id).body.split(' Anuncio recomendado:')[0],
     author_username:users.get(q.author_id).username,solved_at:new Date().toISOString()}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('UPDATE resuelve_questions q SET library_approved_answer_id=')){
   const q=questions.get(Number(args[0])),a=answers.get(q?.accepted_answer_id);
   if(!q||q.status!=='resolved'||q.library_opt_out||q.body.trim().length<50||
    !a||a.status!=='visible'||a.body.split(' Anuncio recomendado:')[0].trim().length<80)return {rows:[],rowCount:0};
   q.library_approved_answer_id=q.accepted_answer_id;
   q.library_reviewed_by=Number(args[1]);
   return {rows:[{id:q.id,library_approved_answer_id:q.library_approved_answer_id}],rowCount:1};
  }
  if(sql.startsWith('UPDATE resuelve_questions SET library_approved_answer_id=NULL')){
   const q=questions.get(Number(args[0]));
   if(!q)return {rows:[],rowCount:0};
   q.library_approved_answer_id=null;
   return {rows:[{id:q.id,library_approved_answer_id:null}],rowCount:1};
  }
  if(sql.startsWith('UPDATE resuelve_questions SET library_opt_out=TRUE')){
   const q=questions.get(Number(args[0]));
   if(!q||q.author_id!==Number(args[1])||q.status==='hidden')return {rows:[],rowCount:0};
   q.library_opt_out=true;q.library_approved_answer_id=null;
   return {rows:[{id:q.id}],rowCount:1};
  }
  if(sql.startsWith('SELECT q.id, q.title')) {
   const rows=[...questions.values()].filter(q=>q.author_id===Number(args[0])&&q.status!=='hidden'&&
     (!args[1]||q.id<Number(args[1]))).sort((a,b)=>b.id-a.id).slice(0,24)
     .map(q=>({...q,author_username:users.get(q.author_id).username,
       answer_count:[...answers.values()].filter(a=>a.question_id===q.id&&a.status==='visible').length}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('SELECT q.id,q.title')){
   const rows=[...questions.values()].filter(q=>q.status!=='hidden'&&
    (args[0]==='all'||q.status===args[0])&&(!args[1]||q.id<Number(args[1]))&&
    (!args[2]||q.category===args[2])&&(!args[3]||(q.title+' '+q.body).toLowerCase().includes(String(args[3]).toLowerCase())))
    .sort((a,b)=>b.id-a.id).slice(0,24).map(q=>({...q,
     author_username:users.get(q.author_id)?.username||'desconocido',
     answer_count:[...answers.values()].filter(a=>a.question_id===q.id&&a.status==='visible').length}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('SELECT q.id,q.author_id')){
   const q=questions.get(Number(args[0]));
   const rows=q&&q.status!=='hidden'?[{...q,author_username:users.get(q.author_id).username}]:[];
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('SELECT a.id,a.question_id')){
   const q=questions.get(Number(args[0]));
   const rows=[...answers.values()].filter(a=>a.question_id===q?.id&&a.status==='visible')
    .sort((a,b)=>Number(b.id===q.accepted_answer_id)-Number(a.id===q.accepted_answer_id)||a.id-b.id)
    .map(a=>({...a,author_username:users.get(a.author_id).username}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('INSERT INTO resuelve_answers(')){
   const q=questions.get(Number(args[0]));
   if(!q||q.status!=='open'||q.author_id===Number(args[1]))return {rows:[],rowCount:0};
   const a={id:ai++,question_id:q.id,author_id:Number(args[1]),body:args[2],
    status:'visible',created_at:new Date().toISOString()};
   answers.set(a.id,a);return {rows:[{id:a.id}],rowCount:1};
  }
  if(sql.startsWith('INSERT INTO notifications('))return {rows:[],rowCount:1};
  if(sql.startsWith('UPDATE resuelve_questions q SET status=')){
   const q=questions.get(Number(args[0])),a=answers.get(Number(args[2]));
   if(!q||q.author_id!==Number(args[1])||q.status!=='open'||
    !a||a.question_id!==q.id||a.status!=='visible')return {rows:[],rowCount:0};
   q.status='resolved';q.accepted_answer_id=a.id;return {rows:[{id:q.id,accepted_answer_id:a.id}],rowCount:1};
  }
  if(sql.startsWith("UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL")&&sql.includes('WHERE id=$1 AND author_id=')){
   const q=questions.get(Number(args[0]));
   if(!q||q.author_id!==Number(args[1])||q.status!=='resolved')return {rows:[],rowCount:0};
   q.status='open';q.accepted_answer_id=null;q.library_approved_answer_id=null;return {rows:[{id:q.id}],rowCount:1};
  }
  if(sql.startsWith("UPDATE resuelve_questions SET status='hidden'")){
   const q=questions.get(Number(args[0]));if(!q)return {rows:[],rowCount:0};
   q.status='hidden';q.library_approved_answer_id=null;return {rows:[{id:q.id}],rowCount:1};
  }
  if(sql.startsWith("UPDATE resuelve_answers SET status='hidden'")){
   const a=answers.get(Number(args[0]));if(!a)return {rows:[],rowCount:0};
   a.status='hidden';return {rows:[{id:a.id,question_id:a.question_id}],rowCount:1};
  }
  if(sql.startsWith("UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL")){
   const q=[...questions.values()].find(q=>q.accepted_answer_id===Number(args[0]));
   if(!q)return {rows:[],rowCount:0};
   q.status='open';q.accepted_answer_id=null;return {rows:[{id:q.id}],rowCount:1};
  }
  throw Error('SQL no esperado en prueba: '+sql.slice(0,145));
 }
 return {query,audit,questions,answers};
}
async function withApp(callback){
 const previous=db.query,previousJwt=process.env.JWT_SECRET;
 const fake=database(),hostState={};
 process.env.JWT_SECRET=SECRET;
 db.query=fake.query;
 const app=express();
 app.use(express.json());app.use(cookieParser());app.use('/api/resuelve',router);
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 const host='http://127.0.0.1:'+server.address().port;
 async function fetchApi(url,{user=null,method='GET',body,origin='same',authorization='cookie'}={}){
  const headers={};
  if(origin==='same')headers.Origin=host;
  else if(origin==='foreign')headers.Origin='https://otro-sitio.example';
  if(user&&authorization==='cookie')headers.Cookie='aura_token='+token(user);
  if(user&&authorization==='bearer')headers.Authorization='Bearer '+token(user);
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(host+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 }
 try{return await callback(fetchApi,fake);}
 finally{await new Promise(resolve=>server.close(resolve));db.query=previous;
  if(previousJwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwt;}
}
test('validación de peticiones, respuestas y categorías sin datos inventados',()=>{
 assert.equal(service.CATEGORIES.length,4);
 assert.equal(service.validateQuestion({title:'Pequeño',body:'abc',category:'consejo'}),null);
 assert.equal(service.validateQuestion({title:'Cómo encontrar algo',body:'Estoy buscando algo que me sirva',category:'inventada'}),null);
 const data=service.validateQuestion({title:'¿Un sofá para salón?',body:'¿Qué modelo recomendáis para un salón pequeño?  ',category:'consejo'});
 assert.equal(data.title,'¿Un sofá para salón?');
 assert.equal(data.body,'¿Qué modelo recomendáis para un salón pequeño?');
 assert.equal(service.validateAnswer({body:'a'}),null);
 assert.equal(service.validateAnswer({body:'Puedes empezar por medir el espacio'}),'Puedes empezar por medir el espacio');
 assert.equal(service.validId('1'),true);
 for(const id of ['0','-1','a','1;DROP','999999999999999999'])assert.equal(service.validId(id),false);
});
test('lectura pública, escritura restringida, creación y respuesta entre personas distintas',async()=>{
 await withApp(async(req,dbMock)=>{
  const empty=await req('/api/resuelve/questions');
  assert.equal(empty.status,200);
  assert.deepEqual(empty.data.items,[]);
  const denied=await req('/api/resuelve/questions',{method:'POST',body:{title:'Quiero consejo',body:'Necesito recomendaciones para elegir una silla',category:'consejo'}});
  assert.equal(denied.status,401);
  const created=await req('/api/resuelve/questions',{user:1,method:'POST',
   body:{title:'Consejo para sofá pequeño',body:'Quiero recomendaciones para un salón con poco espacio.',category:'consejo'}});
  assert.equal(created.status,201);
  const id=created.data.id;
  assert.ok(id);
  const list=await req('/api/resuelve/questions');
  assert.equal(list.data.items.length,1);
  assert.equal(list.data.items[0].author_username,'ana');
  assert.equal(list.data.items[0].answer_count,0);
  assert.ok(!Object.hasOwn(list.data.items[0],'email'));
  const own=await req('/api/resuelve/questions/'+id+'/answers',{user:1,method:'POST',body:{body:'Yo tengo una respuesta muy útil'}});
  assert.equal(own.status,409);
  const other=await req('/api/resuelve/questions/'+id+'/answers',{user:2,method:'POST',
   body:{body:'Mide la pared primero y prueba un sofá de dos plazas.'}});
  assert.equal(other.status,201);
  const notices=dbMock.audit.filter(call=>call.sql.startsWith('INSERT INTO notifications('));
  assert.equal(notices.length,1);
  assert.deepEqual(notices[0].args,[String(id),2]);
  assert.match(notices[0].sql,/\'system\',\'resuelve\'/);
  const detail=await req('/api/resuelve/questions/'+id);
  assert.equal(detail.status,200);
  assert.equal(detail.data.answers.length,1);
  assert.equal(detail.data.answers[0].author_username,'luis');
  assert.equal(dbMock.questions.size,1);
 });
});
test('solo la autora puede aceptar una respuesta del mismo hilo, reabrir o resolver',async()=>{
 await withApp(async(req)=>{
  const ask=body=>req('/api/resuelve/questions',{user:1,method:'POST',body:{
    title:'Una pregunta concreta de prueba',body,category:'ayuda'}});
  const q1=(await ask('Necesito una recomendación concreta para elegir.')).data.id;
  const q2=(await ask('Busco una segunda recomendación distinta y útil.')).data.id;
  const a1=(await req('/api/resuelve/questions/'+q1+'/answers',{user:2,method:'POST',
   body:{body:'Puedes empezar por revisar las medidas disponibles.'}})).data.id;
  const a2=(await req('/api/resuelve/questions/'+q2+'/answers',{user:2,method:'POST',
   body:{body:'Revisa las diferencias entre productos parecidos.'}})).data.id;
  assert.equal((await req('/api/resuelve/questions/'+q1+'/solve',{user:2,method:'POST',body:{answerId:a1}})).status,409);
  assert.equal((await req('/api/resuelve/questions/'+q1+'/solve',{user:1,method:'POST',body:{answerId:a2}})).status,409);
  const solved=await req('/api/resuelve/questions/'+q1+'/solve',{user:1,method:'POST',body:{answerId:a1}});
  assert.equal(solved.status,200);
  assert.equal(String(solved.data.acceptedAnswerId),String(a1));
  assert.equal((await req('/api/resuelve/questions?estado=resolved')).data.items.length,1);
  assert.equal((await req('/api/resuelve/questions?estado=open')).data.items.length,1);
  assert.equal((await req('/api/resuelve/questions/'+q1+'/answers',{user:2,method:'POST',body:{body:'Otra respuesta que ya no cabe.'}})).status,409);
  assert.equal((await req('/api/resuelve/questions/'+q1+'/reopen',{user:2,method:'POST',body:{}})).status,409);
  assert.equal((await req('/api/resuelve/questions/'+q1+'/reopen',{user:1,method:'POST',body:{}})).status,200);
  assert.equal((await req('/api/resuelve/questions?estado=open')).data.items.length,2);
 });
});
test('protección de origen CSRF: no aceptar peticiones de sitios externos ni sin origen cookie',async()=>{
 await withApp(async(req)=>{
  const data={title:'Tengo una duda importante',body:'¿Qué recomendaríais para escoger un sofá?',category:'consejo'};
  assert.equal((await req('/api/resuelve/questions',{user:1,method:'POST',origin:'foreign',body:data})).status,403);
  assert.equal((await req('/api/resuelve/questions',{user:1,method:'POST',origin:'none',body:data})).status,403);
  assert.equal((await req('/api/resuelve/questions',{user:1,method:'POST',origin:'none',authorization:'bearer',body:data})).status,201);
 });
});
test('moderación admin oculta la petición; usuario normal no puede hacerlo',async()=>{
 await withApp(async(req)=>{
  const p=await req('/api/resuelve/questions',{user:1,method:'POST',body:{
   title:'Necesito una recomendación',body:'¿Qué tienda tiene opciones fiables en mi ciudad?',category:'busco'}});
  const id=p.data.id;
  assert.equal((await req('/api/resuelve/admin/question/'+id+'/hide',{user:2,method:'POST',body:{}})).status,403);
  assert.equal((await req('/api/resuelve/admin/question/'+id+'/hide',{user:3,method:'POST',body:{}})).status,200);
  assert.equal((await req('/api/resuelve/questions/'+id)).status,404);
  assert.equal((await req('/api/resuelve/questions?estado=all')).data.items.length,0);
 });
});
test('errores de entrada y filtros no generan consultas a base de datos inseguras',async()=>{
 await withApp(async(req,stub)=>{
  assert.equal((await req('/api/resuelve/questions?estado=hidden')).status,400);
  assert.equal((await req('/api/resuelve/questions?antes=-1')).status,400);
  assert.equal((await req('/api/resuelve/questions/uno')).status,400);
  assert.equal((await req('/api/resuelve/questions',{user:1,method:'POST',body:{
   title:'Muy corta',body:'demasiado corto',category:'consejo'}})).status,400);
  assert.ok(stub.audit.every(call=>!call.sql.includes('DROP TABLE')));
  assert.ok(stub.audit.every(call=>!call.sql.includes('serpapi.com')));
 });
});
test('V3.5.4 Mis peticiones: requiere sesión y no revela preguntas ajenas',async()=>{
 await withApp(async req=>{
  const input={title:'Necesito una recomendación',body:'¿Qué artículo conviene comprar para un salón pequeño?',category:'consejo'};
  const mine=await req('/api/resuelve/questions',{user:1,method:'POST',body:input});
  const other=await req('/api/resuelve/questions',{user:2,method:'POST',body:input});
  assert.equal(mine.status,201);assert.equal(other.status,201);
  assert.equal((await req('/api/resuelve/questions/mine')).status,401);
  assert.equal((await req('/api/resuelve/questions/mine?antes=-1',{user:1})).status,400);
  const own=await req('/api/resuelve/questions/mine',{user:1});
  assert.equal(own.status,200);
  assert.deepEqual(own.data.items.map(q=>Number(q.id)),[Number(mine.data.id)]);
  const theirs=await req('/api/resuelve/questions/mine',{user:2});
  assert.deepEqual(theirs.data.items.map(q=>Number(q.id)),[Number(other.data.id)]);
 });
});
test('V3.5.6: búsqueda literal y categorías sin fuga entre filtros',async()=>{
 await withApp(async req=>{
  const a=await req('/api/resuelve/questions',{user:1,method:'POST',body:{
   title:'Sofá para salón pequeño',body:'Busco consejos sobre un sofá cómodo en color beige.',category:'consejo'}});
  const b=await req('/api/resuelve/questions',{user:2,method:'POST',body:{
   title:'Busco bicicleta urbana',body:'Quiero encontrar una bicicleta para moverme por la ciudad.',category:'busco'}});
  assert.equal(a.status,201);assert.equal(b.status,201);
  const filtered=await req('/api/resuelve/questions?estado=all&categoria=consejo&q=sof%C3%A1');
  assert.equal(filtered.status,200);
  assert.deepEqual(filtered.data.items.map(q=>Number(q.id)),[Number(a.data.id)]);
  assert.equal((await req('/api/resuelve/questions?estado=all&q=%25')).status,400);
  assert.equal((await req('/api/resuelve/questions?categoria=inventada')).status,400);
  assert.equal((await req('/api/resuelve/questions?q='+('a'.repeat(81)))).status,400);
 });
});
test('V3.5.7 biblioteca: solo solución de calidad aprobada por administrador, con baja del autor',async()=>{
 await withApp(async(req,stub)=>{
  const q=(await req('/api/resuelve/questions',{user:1,method:'POST',body:{
   title:'Cómo escoger un sofá para un salón pequeño',
   body:'Necesito un sofá para un salón estrecho y me preocupa la distancia hasta el televisor y el paso libre.',
   category:'consejo'}})).data.id;
  const short=(await req('/api/resuelve/questions/'+q+'/answers',{user:2,method:'POST',body:{
   body:'Mide antes de comprar.'}})).data.id;
  assert.equal((await req('/api/resuelve/questions/'+q+'/solve',{user:1,method:'POST',body:{answerId:short}})).status,200);
  assert.equal((await req('/api/resuelve/solutions')).data.items.length,0);
  const admin='/api/resuelve/admin/solutions/'+q+'/approve';
  const reviewed={qualityReviewed:true,privacyReviewed:true,nonCommercialReviewed:true};
  assert.equal((await req(admin,{method:'POST',body:{}})).status,401);
  assert.equal((await req(admin,{user:2,method:'POST',body:{}})).status,403);
  assert.equal((await req(admin,{user:3,method:'POST',origin:'foreign',body:{}})).status,403);
  assert.equal((await req(admin,{user:3,method:'POST',body:{}})).status,400);
  assert.equal((await req(admin,{user:3,method:'POST',body:{qualityReviewed:true,privacyReviewed:false,nonCommercialReviewed:true}})).status,400);
  assert.equal((await req(admin,{user:3,method:'POST',body:reviewed})).status,409);
  const reopened=await req('/api/resuelve/questions/'+q+'/reopen',{user:1,method:'POST',body:{}});
  assert.equal(reopened.status,200);
  const good=(await req('/api/resuelve/questions/'+q+'/answers',{user:2,method:'POST',body:{
   body:'Primero mide el ancho de la habitación y deja al menos un paso cómodo. Después compara fondos reales, prueba el respaldo y revisa las medidas del ascensor antes de elegir. Anuncio recomendado: https://redlibertad.com/marketplace/sofa-123'}})).data.id;
  assert.equal((await req('/api/resuelve/questions/'+q+'/solve',{user:1,method:'POST',body:{answerId:good}})).status,200);
  assert.equal((await req(admin,{user:3,method:'POST',body:reviewed})).status,200);
  assert.equal(stub.questions.get(Number(q)).library_reviewed_by,3);
  const library=await req('/api/resuelve/solutions');
  assert.equal(library.status,200);
  assert.deepEqual(library.data.items.map(x=>Number(x.id)),[Number(q)]);
  assert.ok(library.data.items[0].solution.includes('Primero mide'));
  assert.ok(!library.data.items[0].solution.includes('Anuncio recomendado:'));
  assert.equal((await req('/api/resuelve/solutions?q=marketplace')).data.items.length,0);
  const byCategory=await req('/api/resuelve/solutions?categoria=consejo&q=medidas');
  assert.equal(byCategory.status,200);
  assert.deepEqual(byCategory.data.items.map(x=>Number(x.id)),[Number(q)]);
  assert.equal((await req('/api/resuelve/solutions?categoria=busco')).data.items.length,0);
  assert.equal((await req('/api/resuelve/solutions?q=bicicleta')).data.items.length,0);
  assert.equal((await req('/api/resuelve/solutions?q=primero')).data.items.length,1);
  assert.equal((await req('/api/resuelve/solutions?categoria=no_existe')).status,400);
  assert.equal((await req('/api/resuelve/solutions?q=x')).status,400);
  assert.equal((await req('/api/resuelve/solutions?q='+('x'.repeat(81)))).status,400);
  assert.equal((await req('/api/resuelve/solutions?antes='+q)).status,200);
  assert.equal((await req('/api/resuelve/solutions?antes='+q)).data.items.length,0);
  assert.equal((await req('/api/resuelve/solutions?antes=-1')).status,400);
  assert.equal((await req('/api/resuelve/questions/'+q+'/library/opt-out',{user:2,method:'POST',body:{}})).status,404);
  assert.equal((await req('/api/resuelve/questions/'+q+'/library/opt-out',{user:1,method:'POST',body:{}})).status,200);
  assert.equal((await req('/api/resuelve/solutions')).data.items.length,0);
  assert.equal((await req(admin,{user:3,method:'POST',body:reviewed})).status,409);
  assert.ok(stub.audit.some(entry=>entry.sql.includes('library_opt_out=FALSE')));
 });
});
test('V3.5.8 revisión: cola exclusiva de admin y actualizada tras aprobar o excluir',async()=>{
 await withApp(async req=>{
  const q=(await req('/api/resuelve/questions',{user:1,method:'POST',body:{
   title:'Cómo elegir un sofá cómodo para casa',
   body:'Quiero conocer medidas y consejos para elegir un sofá cómodo sin ocupar demasiado espacio en casa.',
   category:'consejo'}})).data.id;
  const a=(await req('/api/resuelve/questions/'+q+'/answers',{user:2,method:'POST',body:{
   body:'Mide antes el espacio libre del salón, comprueba la profundidad y prueba el respaldo. Revisa también las medidas del ascensor y la apertura de las puertas antes de comprar.'}})).data.id;
  assert.equal((await req('/api/resuelve/questions/'+q+'/solve',{user:1,method:'POST',body:{answerId:a}})).status,200);
  const url='/api/resuelve/admin/solutions/pending';
  assert.equal((await req(url)).status,401);
  assert.equal((await req(url,{user:2})).status,403);
  assert.equal((await req(url+'?antes=-1',{user:3})).status,400);
  const pending=await req(url,{user:3});
  assert.equal(pending.status,200);
  assert.deepEqual(pending.data.items.map(q=>Number(q.id)),[Number(q)]);
  assert.equal((await req('/api/resuelve/admin/solutions/'+q+'/approve',{user:3,method:'POST',body:{qualityReviewed:true,privacyReviewed:true,nonCommercialReviewed:true}})).status,200);
  assert.equal((await req(url,{user:3})).data.items.length,0);
  assert.equal((await req('/api/resuelve/admin/solutions/'+q+'/revoke',{user:3,method:'POST',body:{}})).status,200);
  assert.equal((await req(url,{user:3})).data.items.length,1);
  assert.equal((await req('/api/resuelve/questions/'+q+'/library/opt-out',{user:1,method:'POST',body:{}})).status,200);
  assert.equal((await req(url,{user:3})).data.items.length,0);
 });
});
test('V3.5.10: un enlace comercial no sustituye una respuesta realmente útil',async()=>{
 await withApp(async(req,dbMock)=>{
  // Preparamos una petición resuelta sin consumir el límite horario de creación de otros tests.
  const q=937;
  const sales='Compra aquí. Anuncio recomendado: https://redlibertad.com/marketplace/explorar?'+('ofertas'.repeat(14));
  dbMock.questions.set(q,{id:q,author_id:1,title:'Busco orientación para comprar sin gastar de más',
   body:'Quiero opiniones y pasos concretos para comparar opciones sin comprometer mi presupuesto familiar.',
   category:'busco',status:'resolved',accepted_answer_id:938,library_approved_answer_id:null,library_opt_out:false});
  dbMock.answers.set(938,{id:938,question_id:q,author_id:2,body:sales,status:'visible'});
  const flag={qualityReviewed:true,privacyReviewed:true,nonCommercialReviewed:true};
  assert.equal((await req('/api/resuelve/admin/solutions/'+q+'/approve',{user:3,method:'POST',body:flag})).status,409);
  assert.equal((await req('/api/resuelve/admin/solutions/pending',{user:3})).data.items.length,0);
  assert.equal((await req('/api/resuelve/solutions')).data.items.length,0);
  assert.ok(dbMock.audit.some(e=>e.sql.includes('split_part(a.body')));
 });
});
test('integración en servidor y pantalla móvil sin HTML inseguro',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/resuelve.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.css'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
 assert.match(server,/app\.use\('\/api\/resuelve',resuelveV350\)/);
 assert.match(server,/app\.get\('\/resuelve'/);
 assert.match(app,/href="\/resuelve"/);
 assert.match(html,/id="askForm"/);
 assert.match(html,/id="answerForm"/);
 assert.match(html,/id="resuelveExtras"/);
 assert.match(html,/class="optional-listing"/);
 assert.match(html,/no hace falta comprar/i);
 assert.match(js,/editorialReviewControls/);
 assert.match(js,/nonCommercialReviewed:true/);
 assert.match(js,/create\('details','answer-related-link'\)/);
 assert.doesNotMatch(js,/action\('Explorar Marketplace'/);
 assert.match(html,/data-filter="mine"[^>]*hidden/);
 assert.match(html,/id="questionSearchForm"/);
 assert.match(html,/id="solutionList"/);
 assert.match(html,/id="solutionFilterForm"/);
 assert.match(html,/id="solutionCategory"/);
 assert.match(js,/solutionSearch/);
 assert.match(js,/clearSolutionFilters/);
 assert.match(html,/id="libraryReviewPanel"/);
 assert.match(js,/loadReviewQueue/);
 assert.match(js,/\/api\/resuelve\/admin\/solutions\/pending/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(js,/loadSolutions/);
 assert.match(js,/\/api\/resuelve\/solutions/);
 assert.match(js,/questionSearchClear/);
 assert.match(js,/\/api\/resuelve\/questions\/mine/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(js,/aria-pressed/);
 const social=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
 assert.match(social,/entityType==='resuelve'/);
 assert.match(social,/location\.assign\('\/resuelve\?id='/);
});
