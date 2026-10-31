'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const supports=require('../src/services/independent-support-v3642');
const pages=require('../src/services/independent-public-pages-v3641');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.42: IDs y acciones no válidas nunca escriben apoyos',async()=>{
 assert.deepEqual(await supports.setSupport(4,'0',true),{error:'apoyo_invalido'});
 assert.deepEqual(await supports.setSupport(4,'../3',true),{error:'apoyo_invalido'});
 assert.deepEqual(await supports.setSupport(0,'3',true),{error:'apoyo_invalido'});
 assert.deepEqual(await supports.setSupport(4,'3','yes'),{error:'apoyo_invalido'});
 assert.equal(await supports.summary('../3'),null);
});
test('V3.6.42: solo artículos públicos de autores activos generan recuentos',async()=>{
 const old=db.query;
 let queries=[],expose=true,supportCount=3;
 db.query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT p.id,s.author_user_id,'))return {rows:expose?[{id:'11',author_user_id:'7',support_count:supportCount,viewer_supported:true}]:[]};
  return {rows:[],rowCount:0};
 };
 try{
  const summary=await supports.summary('11',8);
  assert.deepEqual(summary,{count:3,supported:true,canSupport:true});
  const own=await supports.summary('11',7);
  assert.equal(own.canSupport,false);
  const guest=await supports.summary('11');
  assert.equal(guest.supported,null);
  assert.equal(guest.canSupport,null);
  expose=false;
  assert.equal(await supports.summary('11'),null);
  expose=true;supportCount=-1;
  await assert.rejects(()=>supports.summary('11'),/invalid_support_count/);
  assert.ok(queries.some(q=>q.sql.includes('CREATE TABLE IF NOT EXISTS independent_article_support_v3642')));
  assert.ok(queries.some(q=>q.sql.includes('PRIMARY KEY(publication_id,user_id)')));
  const reads=queries.filter(q=>q.sql.startsWith('SELECT p.id,s.author_user_id,'));
  assert.ok(reads.every(q=>q.sql.includes("p.unpublished_at IS NULL")&&q.sql.includes("s.status='approved'")&&q.sql.includes('s.author_publish_consent_at IS NOT NULL')&&q.sql.includes("author.status='active'")));
  assert.ok(reads.every(q=>q.sql.includes("supporter.status='active'")));
  assert.ok(reads.every(q=>!q.sql.includes('supporter.username')));
 }finally{db.query=old;}
});
test('V3.6.42: un reconocimiento por cuenta, reversible, bloqueo al autor y retirada',async()=>{
 const connect=db.pool.connect;
 let selected={id:'11',author_user_id:'7'},count=1;
 const sqls=[];
 db.pool.connect=async()=>({
  release(){},
  async query(sql,args=[]){
   sqls.push({sql,args});
   if(sql.startsWith('SELECT p.id,s.author_user_id'))return{rows:selected?[selected]:[]};
   if(sql.startsWith('SELECT count(*)::int AS support_count'))return{rows:[{support_count:count}]};
   return{rows:[],rowCount:1};
  }
 });
 try{
  assert.deepEqual(await supports.setSupport(7,'11',true),{error:'apoyo_propio_no_permitido'});
  assert.ok(!sqls.some(q=>q.sql.startsWith('INSERT INTO independent_article_support_v3642')));
  assert.deepEqual(await supports.setSupport(8,'11',true),{count:1,supported:true});
  assert.ok(sqls.some(q=>q.sql.includes('ON CONFLICT (publication_id,user_id) DO NOTHING')));
  assert.ok(sqls.some(q=>q.sql.includes('FOR UPDATE OF p')));
  assert.deepEqual(await supports.setSupport(8,'11',false),{count:1,supported:false});
  assert.ok(sqls.some(q=>q.sql.includes('DELETE FROM independent_article_support_v3642 WHERE publication_id=$1 AND user_id=$2')));
  selected=null;
  assert.deepEqual(await supports.setSupport(8,'11',true),{error:'articulo_no_disponible'});
  assert.ok(sqls.some(q=>q.sql==='COMMIT'));
 }finally{db.pool.connect=connect;}
});
test('V3.6.42: rutas públicas/privadas no exponen identidad de quienes apoyan',()=>{
 const api=read('src/routes/independent-drafts-v3639.js');
 const html=read('src/routes/editorial-publication-v323.js');
 const page=read('src/services/independent-public-pages-v3641.js');
 const js=read('public/editorial-voices-support-v3642.js');
 const css=read('public/editorial-voices-support-v3642.css');
 assert.match(api,/router\.use\(requireAuth\)/);
 assert.match(api,/router\.post\('\/voces\/:id\/apoyo',sameOrigin,throttle/);
 assert.match(api,/router\.get\('\/voces\/:id\/apoyo'/);
 assert.match(api,/typeof req\.body\.supported!=='boolean'/);
 assert.match(html,/publicRouter\.get\('\/redactores\/voces\/:id\/apoyos'/);
 assert.match(html,/independentSupportV3642\.summary\(req\.params\.id\)/);
 assert.match(html,/Cache-Control','no-store'/);
 assert.match(page,/id="voicesSupportV3642"/);
 assert.match(page,/id="voicesSupportActionV3642"/);
 assert.match(page,/id="voicesSupportCountV3642"/);
 assert.match(page,/no equivale a verificar la información ni tiene valor económico/);
 assert.match(html,/editorial-voices-support-v3642\.js\?v=3\.6\.42/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/supported:next/);
 assert.match(js,/if\(me\.statusCode===401\)/);
 assert.match(js,/count\.textContent=countLabel\(n\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|stripe|paypal|checkout/i);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed|pointer-events:none|outline:none/);
 assert.doesNotThrow(()=>new Function(js));
});
