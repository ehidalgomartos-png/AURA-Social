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
 const questions=new Map(),answers=new Map(),reports=new Map(),helpPrefs=new Map();let qi=1,ai=1,ri=1;
 const audit=[];
 const users=new Map([[1,{id:1,username:'ana',is_admin:false}],[2,{id:2,username:'luis',is_admin:false}],[3,{id:3,username:'admin',is_admin:true}]]);
 async function query(sql,args=[]){
  audit.push({sql,args});
  if(/^(?:CREATE|ALTER)\b/i.test(sql.trim()))return {rows:[],rowCount:0};
  if(/FROM users\s+WHERE id=\$1/i.test(sql)){
   const u=users.get(Number(args[0]));
   return {rowCount:u?1:0,rows:u?[{...u,age_verified:true,show_sensitive:false,status:'active',auth_token_version:0,suspended_until:null,suspension_reason:''}]:[]};
  }
  if(sql.startsWith('WITH public_questions AS (')){
   const visible=[...questions.values()].filter(q=>['open','resolved'].includes(q.status)&&users.has(q.author_id));
   const allAnswers=[...answers.values()].filter(a=>a.status==='visible'&&
    visible.some(q=>q.id===a.question_id)&&users.has(a.author_id));
   const accepted=q=>allAnswers.some(a=>a.id===q.accepted_answer_id&&a.question_id===q.id);
   const recent=date=>date&&new Date(date).getTime()>=Date.now()-30*24*60*60*1000;
   const row={
    public_questions:visible.length,
    open_questions:visible.filter(q=>q.status==='open').length,
    resolved_questions:visible.filter(q=>q.status==='resolved'&&accepted(q)).length,
    questions_with_answers:new Set(allAnswers.map(a=>a.question_id)).size,
    unique_helpers:new Set(allAnswers.map(a=>a.author_id)).size,
    thanked_resolutions:visible.filter(q=>q.status==='resolved'&&q.thanked_at&&accepted(q)).length,
    questions_30d:visible.filter(q=>recent(q.created_at)).length,
    resolved_30d:visible.filter(q=>q.status==='resolved'&&recent(q.solved_at)&&accepted(q)).length
   };
   return {rows:[row],rowCount:1};
  }
  if(sql.startsWith('INSERT INTO resuelve_questions(')){
   const row={id:qi++,author_id:Number(args[0]),title:args[1],body:args[2],category:args[3],professional_help_requested:args[4]===true,
    status:'open',accepted_answer_id:null,library_approved_answer_id:null,library_opt_out:false,created_at:new Date().toISOString()};
   questions.set(row.id,row);return {rows:[{id:row.id}],rowCount:1};
  }
  if(sql.startsWith("SELECT q.id,q.title,q.category,q.solved_at,") &&
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
  if(sql.startsWith("SELECT q.id,q.title,q.category,q.solved_at,")){
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
  if(sql.startsWith('SELECT categories FROM resuelve_help_preferences WHERE user_id=')){
   const pref=helpPrefs.get(Number(args[0]));
   return {rows:pref?[{categories:pref}]:[],rowCount:pref?1:0};
  }
  if(sql.startsWith('INSERT INTO resuelve_help_preferences(')){
   const topics=[...args[1]];
   helpPrefs.set(Number(args[0]),topics);
   return {rows:[{categories:topics}],rowCount:1};
  }
  if(sql.startsWith('SELECT q.id,q.title,q.body') && sql.includes('JOIN resuelve_help_preferences p')){
   const topics=helpPrefs.get(Number(args[0]))||[];
   const rows=[...questions.values()].filter(q=>q.status==='open'&&
    q.author_id!==Number(args[0])&&topics.includes(q.category)&&
    (!args[1]||q.id<Number(args[1]))&&users.has(q.author_id))
    .sort((a,b)=>b.id-a.id).slice(0,24)
    .map(q=>({...q,author_username:users.get(q.author_id).username,
     answer_count:[...answers.values()].filter(a=>a.question_id===q.id&&a.status==='visible').length}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('SELECT q.id, q.title')) {
   const rows=[...questions.values()].filter(q=>q.author_id===Number(args[0])&&q.status!=='hidden'&&
     (!args[1]||q.id<Number(args[1]))).sort((a,b)=>b.id-a.id).slice(0,24)
     .map(q=>({...q,author_username:users.get(q.author_id).username,
       answer_count:[...answers.values()].filter(a=>a.question_id===q.id&&a.status==='visible').length}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('SELECT q.id,q.title FROM resuelve_questions q')){
   const q=questions.get(Number(args[0])),a=answers.get(q?.accepted_answer_id);
   if(!q||q.author_id!==Number(args[1])||q.status!=='resolved'||!a||
    a.status!=='visible'||a.question_id!==q.id)return {rows:[],rowCount:0};
   return {rows:[{id:q.id,title:q.title}],rowCount:1};
  }
  if(sql.startsWith('SELECT q.id,q.title')){
   const rows=[...questions.values()].filter(q=>q.status!=='hidden'&&
    (args[0]==='all'||q.status===args[0])&&(!args[1]||q.id<Number(args[1]))&&
    (!args[2]||q.category===args[2])&&(!args[3]||(q.title+' '+q.body).toLowerCase().includes(String(args[3]).toLowerCase()))&&
    (!args[4]||q.professional_help_requested===true))
    .sort((a,b)=>b.id-a.id).slice(0,24).map(q=>({...q,
     author_username:users.get(q.author_id)?.username||'desconocido',
     answer_count:[...answers.values()].filter(a=>a.question_id===q.id&&a.status==='visible').length}));
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith('UPDATE resuelve_questions SET thanked_at=now()')){
   const q=questions.get(Number(args[0])),a=answers.get(q?.accepted_answer_id);
   if(!q||q.author_id!==Number(args[1])||q.status!=='resolved'||q.thanked_at||
    !a||a.status!=='visible')return {rows:[],rowCount:0};
   q.thanked_at=new Date().toISOString();
   return {rows:[{id:q.id,thanked_at:q.thanked_at}],rowCount:1};
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
   const a={id:ai++,question_id:q.id,author_id:Number(args[1]),body:args[2],professional_role:args[3]||null,
    self_professional_role:args[4]||null,self_commercial_interest:args[5]===true,
    status:'visible',created_at:new Date().toISOString()};
   answers.set(a.id,a);return {rows:[{id:a.id}],rowCount:1};
  }
  if(sql.startsWith('INSERT INTO resuelve_answer_reports(')){
   const a=answers.get(Number(args[0]));
   const q=questions.get(a?.question_id);
   if(!a||!q||a.status!=='visible'||q.status==='hidden'||a.author_id===Number(args[1])||
    [...reports.values()].some(r=>r.answer_id===a.id&&r.reporter_id===Number(args[1])))
    return {rows:[],rowCount:0};
   const report={id:ri++,answer_id:a.id,reporter_id:Number(args[1]),reason:args[2],
    status:'pending',created_at:new Date().toISOString()};
   reports.set(report.id,report);
   return {rows:[{id:report.id}],rowCount:1};
  }
  if(sql.startsWith('SELECT r.id,r.answer_id,r.reason,r.created_at,')){
   const rows=[...reports.values()].filter(r=>{
    const a=answers.get(r.answer_id),q=questions.get(a?.question_id);
    return r.status==='pending'&&a?.status==='visible'&&q?.status!=='hidden'&&
     (!args[0]||r.id<Number(args[0]));
   }).sort((a,b)=>b.id-a.id).slice(0,20).map(r=>{
    const a=answers.get(r.answer_id),q=questions.get(a.question_id);
    return {id:r.id,answer_id:a.id,reason:r.reason,created_at:r.created_at,
     question_id:q.id,title:q.title,body:a.body,self_professional_role:a.self_professional_role,
     self_commercial_interest:a.self_commercial_interest};
   });
   return {rows,rowCount:rows.length};
  }
  if(sql.startsWith("UPDATE resuelve_answer_reports SET status='dismissed'")){
   const r=reports.get(Number(args[0]));
   if(!r||r.status!=='pending')return {rows:[],rowCount:0};
   r.status='dismissed';r.reviewed_by=Number(args[1]);r.reviewed_at=new Date().toISOString();
   return {rows:[{id:r.id}],rowCount:1};
  }
  if(sql.startsWith("UPDATE resuelve_answer_reports SET status='resolved'")){
   const rows=[...reports.values()].filter(r=>r.answer_id===Number(args[0])&&r.status==='pending');
   for(const r of rows){r.status='resolved';r.reviewed_at=new Date().toISOString();}
   return {rows:[],rowCount:rows.length};
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
   q.status='open';q.accepted_answer_id=null;q.library_approved_answer_id=null;q.thanked_at=null;return {rows:[{id:q.id}],rowCount:1};
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
 return {query,audit,questions,answers,reports,helpPrefs};
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
   body:{title:'Necesito orientación para un trámite',body:'No sé qué documentos debo preparar para realizar un trámite administrativo.',category:'consejo',professionalHelpRequested:true}});
  assert.equal(created.status,201);
  const id=created.data.id;
  assert.ok(id);
  const list=await req('/api/resuelve/questions');
  assert.equal(list.data.items.length,1);
  assert.equal(list.data.items[0].author_username,'ana');
  assert.equal(list.data.items[0].professional_help_requested,true);
  assert.equal(list.data.items[0].answer_count,0);
  assert.ok(!Object.hasOwn(list.data.items[0],'email'));
  const own=await req('/api/resuelve/questions/'+id+'/answers',{user:1,method:'POST',body:{body:'Yo tengo una respuesta muy útil'}});
  assert.equal(own.status,409);
  const other=await req('/api/resuelve/questions/'+id+'/answers',{user:2,method:'POST',
   body:{body:'Mide la pared primero y prueba un sofá de dos plazas.'}});
  assert.equal(other.status,201);
  const notices=dbMock.audit.filter(call=>call.sql.startsWith('INSERT INTO notifications(') && call.sql.includes("'Han respondido a tu petición en RedLibertad Resuelve.'"));
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
test('V3.5.12: buscar ayuda profesional sin mezclar anuncios o peticiones corrientes',async()=>{
 const base={title:'Orientación para trámite',body:'Necesito entender un procedimiento administrativo sin compartir mis datos.',category:'ayuda'};
 assert.equal(service.validateQuestion({...base,professionalHelpRequested:'on'}),null);
 assert.equal(service.validateQuestion({...base}).professionalHelpRequested,false);
 assert.equal(service.validateQuestion({...base,professionalHelpRequested:true}).professionalHelpRequested,true);
 await withApp(async(req,stub)=>{
  stub.questions.set(900,{id:900,author_id:1,title:'Necesito ayuda para un trámite',body:'No encuentro a quién preguntar sobre mi documentación.',
   category:'ayuda',professional_help_requested:true,status:'open',created_at:new Date().toISOString()});
  stub.questions.set(901,{id:901,author_id:2,title:'Busco consejos para organizarme',body:'Quiero conocer experiencias de otras personas sin contratar servicios.',
   category:'consejo',professional_help_requested:false,status:'open',created_at:new Date().toISOString()});
  const endpoint='/api/resuelve/questions?estado=all&profesional=si';
  const result=await req(endpoint);
  assert.equal(result.status,200);
  assert.deepEqual(result.data.items.map(x=>Number(x.id)),[900]);
  assert.equal((await req('/api/resuelve/questions?profesional=no')).status,400);
  assert.equal((await req('/api/resuelve/questions?profesional=si&categoria=consejo')).data.items.length,0);
  assert.equal((await req('/api/resuelve/questions?estado=all')).data.items.length,2);
  assert.equal((await req('/api/resuelve/questions/900')).data.question.professional_help_requested,true);
  assert.ok(stub.audit.some(x=>x.sql.includes('q.professional_help_requested=TRUE')));
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
test('V3.5.11 orienta hacia una profesión sin permitir anuncios, teléfonos ni autoacreditación',async()=>{
 const valid=service.validateProfessionalRole;
 assert.equal(valid('electricista'),'electricista');
 assert.equal(valid('  técnico de calderas  '),'técnico de calderas');
 assert.equal(valid(''),null);
 assert.equal(valid('https://ejemplo.es'),undefined);
 assert.equal(valid('contacto@ejemplo.es'),undefined);
 assert.equal(valid('699 123 456'),undefined);
 assert.equal(valid(45),undefined);
 assert.equal(valid('x'.repeat(71)),undefined);
 await withApp(async(req,stub)=>{
  const q=939;
  stub.questions.set(q,{
   id:q,author_id:1,title:'Problema eléctrico en una vivienda',
   body:'Necesito saber a quién consultar porque salta continuamente un interruptor de protección.',
   category:'ayuda',status:'open',accepted_answer_id:null,
   library_approved_answer_id:null,library_opt_out:false
  });
  const route='/api/resuelve/questions/'+q+'/answers';
  const body='No manipules el cuadro ni desmontes enchufes. Un especialista puede revisar la instalación con seguridad.';
  assert.equal((await req(route,{user:2,method:'POST',body:{body,professionalRole:'https://empresa.es'}})).status,400);
  assert.equal((await req(route,{user:2,method:'POST',body:{body,professionalRole:'612 555 123'}})).status,400);
  const response=await req(route,{user:2,method:'POST',body:{body,professionalRole:'electricista'}});
  assert.equal(response.status,201);
  const detail=await req('/api/resuelve/questions/'+q);
  assert.equal(detail.status,200);
  assert.equal(detail.data.answers[0].professional_role,'electricista');
  assert.equal(detail.data.answers[0].body,body);
  assert.ok(stub.audit.some(call=>call.sql.startsWith('INSERT INTO resuelve_answers(')&&call.args[3]==='electricista'));
 });
});
test('V3.5.13: experiencia autodeclarada sin verificación ni publicidad encubierta',async()=>{
 const valid=service.validateProfessionalDisclosure;
 assert.deepEqual(valid({}),{role:null,commercialInterest:false});
 assert.deepEqual(valid({selfProfessionalRole:'electricista',commercialInterest:'yes'}),{role:'electricista',commercialInterest:true});
 assert.deepEqual(valid({selfProfessionalRole:'trabajador social',commercialInterest:'no'}),{role:'trabajador social',commercialInterest:false});
 assert.equal(valid({selfProfessionalRole:'médico',commercialInterest:''}),null);
 assert.equal(valid({selfProfessionalRole:'fontanero',commercialInterest:true}),null);
 assert.equal(valid({selfProfessionalRole:'https://empresa.es',commercialInterest:'no'}),null);
 assert.equal(valid({commercialInterest:'yes'}),null);
 await withApp(async(req,stub)=>{
  const q=953;
  stub.questions.set(q,{id:q,author_id:1,title:'¿A quién acudir ante una avería?',
   body:'Busco orientación antes de tocar la instalación eléctrica de mi vivienda.',
   category:'ayuda',status:'open',accepted_answer_id:null,library_opt_out:false});
  const url='/api/resuelve/questions/'+q+'/answers';
  const body='Antes de intervenir en la instalación, deja el equipo desconectado y consulta a un electricista cualificado para que compruebe las protecciones.';
  assert.equal((await req(url,{user:2,method:'POST',body:{
   body,selfProfessionalRole:'electricista',commercialInterest:''}})).status,400);
  assert.equal((await req(url,{user:2,method:'POST',body:{
   body,selfProfessionalRole:'electricista',commercialInterest:'quizas'}})).status,400);
  assert.equal((await req(url,{user:2,method:'POST',body:{
   body:'Contrátame ya',selfProfessionalRole:'electricista',commercialInterest:'yes'}})).status,400);
  const published=await req(url,{user:2,method:'POST',body:{
   body,professionalRole:'electricista',selfProfessionalRole:'electricista',commercialInterest:'yes'}});
  assert.equal(published.status,201);
  const detail=await req('/api/resuelve/questions/'+q);
  assert.equal(detail.status,200);
  assert.equal(detail.data.answers.length,1);
  assert.equal(detail.data.answers[0].self_professional_role,'electricista');
  assert.equal(detail.data.answers[0].self_commercial_interest,true);
  assert.equal(detail.data.answers[0].professional_role,'electricista');
  assert.ok(stub.audit.some(x=>x.sql.startsWith('INSERT INTO resuelve_answers(')&&x.args[4]==='electricista'&&x.args[5]===true));
  // Los mensajes corrientes siguen siendo válidos sin declarar una profesión.
  const ordinary=await req(url,{user:2,method:'POST',body:{body:'Te recomiendo consultar las instrucciones y pedir ayuda antes de hacer nada.'}});
  assert.equal(ordinary.status,201);
  const again=await req('/api/resuelve/questions/'+q);
  assert.equal(again.data.answers[1].self_professional_role,null);
  assert.equal(again.data.answers[1].self_commercial_interest,false);
 });
});
test('V3.5.14: avisos privados, permisos, duplicados y moderación humana',async()=>{
 await withApp(async(req,stub)=>{
  const q=976,a=977;
  stub.questions.set(q,{id:q,author_id:1,title:'Orientación ante una reparación',
   body:'Quiero conocer experiencias antes de pedir ayuda especializada.',
   category:'ayuda',status:'open',accepted_answer_id:null,library_opt_out:false});
  stub.answers.set(a,{id:a,question_id:q,author_id:2,body:'Antes de intervenir en una instalación es mejor revisar la documentación y consultar con una persona cualificada.',
   status:'visible',self_professional_role:'electricista',self_commercial_interest:true,created_at:new Date().toISOString()});
  const endpoint='/api/resuelve/answers/'+a+'/report';
  const report={reason:'publicidad_encubierta'};
  assert.equal((await req(endpoint,{method:'POST',body:report})).status,401);
  assert.equal((await req(endpoint,{user:1,method:'POST',origin:'foreign',body:report})).status,403);
  assert.equal((await req(endpoint,{user:1,method:'POST',body:{reason:'inventada'}})).status,400);
  assert.equal((await req(endpoint,{user:2,method:'POST',body:report})).status,409);
  assert.equal((await req('/api/resuelve/answers/0/report',{user:1,method:'POST',body:report})).status,400);
  const first=await req(endpoint,{user:1,method:'POST',body:report});
  assert.equal(first.status,201);
  assert.equal((await req(endpoint,{user:1,method:'POST',body:report})).status,409);
  assert.equal(stub.answers.get(a).status,'visible');
  const second=await req(endpoint,{user:3,method:'POST',body:{reason:'cualificacion_falsa'}});
  assert.equal(second.status,201);
  const list='/api/resuelve/admin/reports/pending';
  assert.equal((await req(list)).status,401);
  assert.equal((await req(list,{user:1})).status,403);
  assert.equal((await req(list+'?antes=mal',{user:3})).status,400);
  const queue=await req(list,{user:3});
  assert.equal(queue.status,200);
  assert.deepEqual(queue.data.items.map(r=>Number(r.id)),[Number(second.data.id),Number(first.data.id)]);
  assert.ok(!Object.hasOwn(queue.data.items[0],'reporter_id'));
  assert.ok(!Object.hasOwn(queue.data.items[0],'reporter_username'));
  const dismiss='/api/resuelve/admin/reports/'+first.data.id+'/dismiss';
  assert.equal((await req(dismiss,{user:1,method:'POST',body:{}})).status,403);
  assert.equal((await req(dismiss,{user:3,method:'POST',origin:'foreign',body:{}})).status,403);
  assert.equal((await req(dismiss,{user:3,method:'POST',body:{}})).status,200);
  assert.equal(stub.reports.get(Number(first.data.id)).reviewed_by,3);
  assert.equal((await req(dismiss,{user:3,method:'POST',body:{}})).status,409);
  assert.deepEqual((await req(list,{user:3})).data.items.map(r=>Number(r.id)),[Number(second.data.id)]);
  const hide=await req('/api/resuelve/admin/answer/'+a+'/hide',{user:3,method:'POST',body:{}});
  assert.equal(hide.status,200);
  assert.equal(stub.answers.get(a).status,'hidden');
  assert.equal(stub.reports.get(Number(second.data.id)).status,'resolved');
  assert.equal((await req(list,{user:3})).data.items.length,0);
  assert.equal(stub.reports.get(Number(first.data.id)).status,'dismissed');
 });
});
test('V3.5.16: áreas voluntarias, consulta privada y sin recomendar peticiones propias',async()=>{
 assert.equal(service.validHelpTopics([]),true);
 assert.equal(service.validHelpTopics(['consejo','ayuda']),true);
 for(const bad of [null,'ayuda',['desconocido'],['ayuda','ayuda'],['consejo',7],['consejo','busco','ayuda','experiencia','otro']])
  assert.equal(service.validHelpTopics(bad),false);
 await withApp(async(req,stub)=>{
  const pref='/api/resuelve/help-topics',feed='/api/resuelve/questions/for-me';
  assert.equal((await req(pref)).status,401);
  assert.equal((await req(feed)).status,401);
  assert.equal((await req(pref,{user:1})).data.categories.length,0);
  assert.equal((await req(pref,{user:1,method:'POST',body:{categories:['consejo']},origin:'foreign'})).status,403);
  assert.equal((await req(pref,{user:1,method:'POST',body:{categories:['consejo','consejo']}})).status,400);
  assert.equal((await req(pref,{user:1,method:'POST',body:{categories:['no_existe']}})).status,400);
  assert.equal((await req(pref,{user:1,method:'POST',body:{categories:'ayuda'}})).status,400);
  stub.questions.set(1041,{id:1041,author_id:1,title:'Pido consejo',body:'Pido ayuda para un trámite',
   category:'ayuda',status:'open',created_at:new Date().toISOString()});
  stub.questions.set(1042,{id:1042,author_id:2,title:'Consulta sobre trámite',body:'¿Cómo orientar a una persona que necesita información?',
   category:'ayuda',status:'open',created_at:new Date().toISOString()});
  stub.questions.set(1043,{id:1043,author_id:3,title:'Experiencias útiles',body:'Compartir una experiencia sobre un procedimiento',
   category:'experiencia',status:'open',created_at:new Date().toISOString()});
  stub.questions.set(1044,{id:1044,author_id:2,title:'Consejo resuelto',body:'Cómo solucionar una cuestión concreta',
   category:'ayuda',status:'resolved',created_at:new Date().toISOString()});
  stub.questions.set(1045,{id:1045,author_id:2,title:'Contenido oculto',body:'Este contenido está moderado',
   category:'ayuda',status:'hidden',created_at:new Date().toISOString()});
  assert.equal((await req(feed,{user:1})).data.items.length,0);
  const save=await req(pref,{user:1,method:'POST',body:{categories:['ayuda','experiencia']}});
  assert.equal(save.status,200);
  assert.deepEqual(save.data.categories,['ayuda','experiencia']);
  assert.deepEqual((await req(pref,{user:1})).data.categories,['ayuda','experiencia']);
  assert.equal((await req(pref,{user:2})).data.categories.length,0);
  const visible=await req(feed,{user:1});
  assert.equal(visible.status,200);
  assert.deepEqual(visible.data.items.map(q=>Number(q.id)),[1043,1042]);
  assert.equal(visible.data.items.some(q=>q.author_id===1),false);
  assert.equal((await req(feed+'?antes=-1',{user:1})).status,400);
  assert.deepEqual((await req(feed+'?antes=1043',{user:1})).data.items.map(q=>Number(q.id)),[1042]);
  assert.equal((await req(feed,{user:2})).data.items.length,0);
  assert.equal((await req(pref,{user:1,method:'POST',body:{categories:[]}})).status,200);
  assert.equal((await req(feed,{user:1})).data.items.length,0);
  assert.equal(stub.helpPrefs.get(1).length,0);
  assert.ok(stub.audit.some(x=>x.sql.includes('q.author_id<>$1')));
  assert.ok(stub.audit.some(x=>x.sql.includes('q.category=ANY(p.categories)')));
 });
});
test('V3.5.17: agradecimiento único y previsualización social solo para autora y resueltas',async()=>{
 await withApp(async(req,stub)=>{
  const q=981,a=982;
  stub.questions.set(q,{id:q,author_id:1,title:'Cómo solucionar un problema con una gestión',
   body:'Una consulta sobre un trámite que hemos podido resolver con consejos útiles.',
   category:'ayuda',status:'open',accepted_answer_id:null,thanked_at:null,library_opt_out:false});
  stub.answers.set(a,{id:a,question_id:q,author_id:2,body:'Comprueba las instrucciones oficiales y conserva el justificante del trámite.',
   status:'visible',created_at:new Date().toISOString()});
  const preview='/api/resuelve/questions/'+q+'/share-preview';
  const thank='/api/resuelve/questions/'+q+'/thank';
  assert.equal((await req(preview)).status,401);
  assert.equal((await req(preview,{user:2})).status,404);
  assert.equal((await req(preview,{user:1})).status,404);
  assert.equal((await req(thank,{user:1,method:'POST',origin:'foreign',body:{}})).status,403);
  assert.equal((await req(thank,{user:1,method:'POST',body:{}})).status,409);
  assert.equal((await req('/api/resuelve/questions/'+q+'/solve',{user:1,method:'POST',body:{answerId:a}})).status,200);
  assert.equal((await req(preview,{user:2})).status,404);
  const shared=await req(preview,{user:1});
  assert.equal(shared.status,200);
  assert.deepEqual(shared.data,{ok:true,id:q,title:stub.questions.get(q).title,url:'/resuelve?id='+q});
  assert.ok(!JSON.stringify(shared.data).includes(stub.answers.get(a).body));
  assert.equal((await req(thank,{user:2,method:'POST',body:{}})).status,409);
  assert.equal((await req(thank,{user:1,method:'POST',body:{}})).status,200);
  assert.ok(stub.questions.get(q).thanked_at);
  assert.equal((await req(thank,{user:1,method:'POST',body:{}})).status,409);
  assert.ok((await req('/api/resuelve/questions/'+q)).data.question.thanked_at);
  assert.equal((await req('/api/resuelve/questions/'+q+'/reopen',{user:1,method:'POST',body:{}})).status,200);
  assert.equal(stub.questions.get(q).thanked_at,null);
  assert.equal((await req(preview,{user:1})).status,404);
  assert.ok(stub.audit.some(x=>x.sql.includes('q.author_id=$2')&&x.sql.includes("q.status='resolved'")));
 });
});
test('V3.5.18: estadísticas agregadas reales y exclusivas de administradores',async()=>{
 await withApp(async(req,stub)=>{
  const url='/api/resuelve/admin/impact',now=new Date().toISOString(),old='2024-01-01T00:00:00Z';
  assert.equal((await req(url)).status,401);
  assert.equal((await req(url,{user:1})).status,403);
  assert.equal((await req(url,{user:2})).status,403);
  const empty=await req(url,{user:3});
  assert.equal(empty.status,200);
  assert.deepEqual(empty.data.metrics,{
   public_questions:0,open_questions:0,resolved_questions:0,
   questions_with_answers:0,unique_helpers:0,thanked_resolutions:0,
   questions_30d:0,resolved_30d:0
  });
  assert.ok(!Number.isNaN(Date.parse(empty.data.asOf)));
  const q=(id,author_id,status,created_at=now)=>({
   id,author_id,status,created_at,title:'Ejemplo real de ayuda',
   body:'Consulta para recibir una orientación útil de la comunidad.',
   category:'ayuda',accepted_answer_id:null,thanked_at:null,solved_at:null
  });
  stub.questions.set(991,q(991,1,'open'));
  stub.questions.set(992,{...q(992,2,'resolved'),accepted_answer_id:998,thanked_at:now,solved_at:now});
  stub.questions.set(993,q(993,3,'hidden'));
  stub.questions.set(994,{...q(994,1,'resolved'),accepted_answer_id:996,solved_at:now});
  stub.questions.set(995,q(995,3,'open',old));
  stub.answers.set(997,{id:997,question_id:991,author_id:2,status:'visible'});
  stub.answers.set(998,{id:998,question_id:992,author_id:1,status:'visible'});
  stub.answers.set(999,{id:999,question_id:993,author_id:2,status:'visible'});
  stub.answers.set(996,{id:996,question_id:994,author_id:2,status:'hidden'});
  const response=await req(url,{user:3});
  assert.equal(response.status,200);
  assert.deepEqual(response.data.metrics,{
   public_questions:4,open_questions:2,resolved_questions:1,
   questions_with_answers:2,unique_helpers:2,thanked_resolutions:1,
   questions_30d:3,resolved_30d:1
  });
  assert.deepEqual(Object.keys(response.data),['ok','metrics','asOf']);
  assert.ok(!JSON.stringify(response.data).includes('998'));
  const query=stub.audit.find(x=>x.sql.startsWith('WITH public_questions AS ('));
  assert.ok(query.sql.includes("author.status='active'"));
  assert.ok(query.sql.includes("respondent.status='active'"));
  assert.ok(query.sql.includes("a.status='visible'"));
  assert.ok(query.sql.includes("q.status IN ('open','resolved')"));
  assert.ok(query.sql.includes("count(DISTINCT author_id)"));
  assert.equal(query.args.length,0);
 });
});
test('integración en servidor y pantalla móvil sin HTML inseguro',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/resuelve.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.js'),'utf8');
 const adminHtml=fs.readFileSync(path.join(__dirname,'../src/views/resuelve-admin-v3519.html'),'utf8');
 const adminJs=fs.readFileSync(path.join(__dirname,'../public/resuelve-admin-v3519.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.css'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
 assert.match(server,/app\.use\('\/api\/resuelve',resuelveV350\)/);
 assert.match(server,/app\.get\('\/resuelve'/);
 assert.match(app,/href="\/resuelve"/);
 assert.match(html,/id="askForm"/);
 assert.match(html,/id="answerForm"/);
 assert.match(html,/id="answerProfessionalRole"/);
 assert.match(html,/id="answerSelfProfessionalRole"/);
 assert.match(html,/id="answerCommercialInterest"/);
 assert.match(adminHtml,/id="avisos"/);
 assert.match(js,/function answerReportControl\(answer\)/);
 assert.match(adminJs,/async function reports\(more=false\)/);
 assert.match(adminJs,/\/api\/resuelve\/admin\/reports\/pending/);
 assert.match(js,/\/api\/resuelve\/answers\/'/);
 assert.match(html,/no una verificación de títulos/);
 assert.match(js,/resuelve-professional-disclosure/);
 assert.match(js,/Esta persona declara un posible interés económico/);
 assert.match(js,/a\.self_professional_role,a\.self_commercial_interest/);
 assert.match(html,/class="professional-help-option"/);
 assert.match(js,/professional-advice/);
 assert.match(js,/answerContent\(a\.body,a\.professional_role,a\.self_professional_role,a\.self_commercial_interest\)/);
 assert.match(html,/id="resuelveExtras"/);
 assert.match(html,/class="optional-listing"/);
 assert.match(html,/Nadie tiene que comprar/i);
 assert.match(js,/editorialReviewControls/);
 assert.match(js,/nonCommercialReviewed:true/);
 assert.match(adminJs,/nonCommercialReviewed:true/);
 assert.match(js,/create\('details','answer-related-link'\)/);
 assert.doesNotMatch(js,/action\('Explorar Marketplace'/);
 assert.match(html,/data-filter="mine"[^>]*hidden/);
 assert.match(html,/id="questionSearchForm"/);
 assert.match(adminHtml,/id="adminImpactMetrics"/);
 assert.match(adminHtml,/id="adminImpactMetrics"/);
 assert.match(adminHtml,/id="refreshAdminImpact"/);
 assert.match(adminJs,/async function impact\(\)/);
 assert.match(adminJs,/\/api\/resuelve\/admin\/impact/);
 assert.match(adminJs,/resuelve-impact-tile/);

 assert.match(html,/id="inviteHelpSection"/);
 assert.match(html,/id="inviteHelpToggle"/);
 assert.match(html,/id="inviteWhatsApp"/);
 assert.match(html,/id="inviteTelegram"/);
 assert.match(html,/id="inviteEmail"/);
 assert.match(html,/id="inviteCopyLink"/);
 assert.match(js,/function bindHelpInvitation\(\)/);
 assert.match(js,/compartirResuelve=/);
 assert.match(js,/if\(mine&&solved\)/);
 assert.match(js,/Publícalo en RedLibertad/);
 assert.match(js,/Dar las gracias/);
 assert.match(js,/\/api\/resuelve\/questions\/'.*?'\/thank/);

 assert.match(html,/data-filter="help"[^>]*hidden>Puedo ayudar/);
 assert.match(html,/id="helpTopicsPanel"/);
 assert.match(html,/id="helpTopicsForm"/);
 assert.match(html,/id="helpTopicsStatus"/);
 assert.match(js,/\/api\/resuelve\/questions\/for-me/);
 assert.match(js,/\/api\/resuelve\/help-topics/);
 assert.match(js,/loadHelpTopics\(\)/);
 assert.match(js,/saveHelpTopics\(categories\)/);
 assert.match(html,/placeholder="Ej.: ayuda para hacer un trámite"/);
 assert.match(html,/placeholder="Ej.: cómo actuar ante una avería"/);
 assert.match(html,/id="askProfessionalHelp"/);
 assert.match(html,/id="questionProfessionalFilter"/);
 assert.match(js,/professionalOnly/);
 assert.match(js,/profesional','si'/);
 assert.doesNotMatch(html,/placeholder="Ej.: sofá pequeño"/);
 assert.doesNotMatch(html,/placeholder="Ej.: cómo elegir un sofá"/);
 assert.match(html,/id="solutionList"/);
 assert.match(html,/id="solutionFilterForm"/);
 assert.match(html,/id="solutionCategory"/);
 assert.match(js,/solutionSearch/);
 assert.match(js,/clearSolutionFilters/);
 assert.match(adminHtml,/id="soluciones"/);
 assert.match(adminJs,/async function solutions\(more=false\)/);
 assert.match(adminJs,/\/api\/resuelve\/admin\/solutions\/pending/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(adminHtml,/noindex,nofollow,noarchive/);
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
