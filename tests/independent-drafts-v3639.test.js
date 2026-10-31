'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const db=require('../src/db');
const drafts=require('../src/services/independent-drafts-v3639');
const {sameOrigin}=require('../src/routes/independent-drafts-v3639');
const {renderIndependentVoicesLanding,renderIndependentVoicesEditor}=require('../src/services/independent-voices-v3638');
const {page}=require('../src/routes/editorial-publication-v323');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.39: los borradores admiten escritura incompleta, nunca HTML ni atributos extra',()=>{
 const base={kind:'noticia',title:'Mi noticia original',body:'Primer párrafo.',sources:[]};
 assert.deepEqual(drafts.validateDraft(base),base);
 assert.equal(drafts.validateDraft({...base,title:'ab'}),null);
 assert.equal(drafts.validateDraft({...base,body:''}),null);
 assert.equal(drafts.validateDraft({...base,kind:'patrocinado'}),null);
 assert.equal(drafts.validateDraft({...base,author_user_id:3}),null);
 assert.equal(drafts.validateDraft({...base,status:'published'}),null);
 assert.equal(drafts.validateDraft({...base,sources:['http://ejemplo.es/fuente']}),null);
 assert.equal(drafts.validateDraft({...base,sources:['https://example.com/a','https://example.com/a']}),null);
 assert.equal(drafts.validateDraft({...base,sources:Array(9).fill('https://example.es/')}),null);
 assert.equal(drafts.validateDraft({...base,body:'x'.repeat(15001)}),null);
 assert.equal(drafts.validateDraft(null),null);
});
test('V3.6.39: las consultas privadas siempre se limitan a la cuenta y al estado draft',async()=>{
 const original=db.query;
 let calls=[];
 db.query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(/^CREATE /.test(sql))return{rowCount:0,rows:[]};
  if(/^SELECT /.test(sql))return{rowCount:0,rows:[]};
  if(/^INSERT /.test(sql))return{rowCount:1,rows:[{id:7,title:'Noticia privada',revision:1}]};
  if(/^UPDATE /.test(sql))return{rowCount:1,rows:[{id:7,revision:2}]};
  if(/^DELETE /.test(sql))return{rowCount:1,rows:[{id:7}]};
  throw Error('Unexpected SQL');
 };
 try{
  const input={title:'Noticia privada',kind:'opinion',body:'Texto exclusivo',sources:[]};
  await drafts.list(11);
  await drafts.get(11,'7');
  await drafts.create(11,input);
  await drafts.update(11,'7',1,input);
  await drafts.remove(11,'7',2);
  assert.match(calls[0].sql,/CREATE TABLE IF NOT EXISTS independent_article_drafts_v3639/);
  assert.match(calls[0].sql,/author_user_id BIGINT NOT NULL REFERENCES users\(id\)/);
  assert.match(calls[0].sql,/status VARCHAR\(20\) NOT NULL DEFAULT 'draft' CHECK\(status='draft'\)/);
  assert.match(calls[0].sql,/revision INTEGER NOT NULL DEFAULT 1/);
  const select=calls.filter(x=>x.sql.startsWith('SELECT '));
  assert.equal(select.length,2);
  for(const c of select){assert.match(c.sql,/author_user_id=\$\d/);assert.ok(c.args.includes(11));}
  const insert=calls.find(x=>x.sql.startsWith('INSERT '));
  assert.match(insert.sql,/INSERT INTO independent_article_drafts_v3639/);
  assert.equal(insert.args[0],11);
  const update=calls.find(x=>x.sql.startsWith('UPDATE '));
  assert.match(update.sql,/revision=revision\+1/);
  assert.match(update.sql,/author_user_id=\$6 AND revision=\$7 AND status='draft'/);
  assert.deepEqual(update.args.slice(-3),['7',11,1]);
  const del=calls.find(x=>x.sql.startsWith('DELETE '));
  assert.match(del.sql,/author_user_id=\$2 AND revision=\$3 AND status='draft'/);
  assert.deepEqual(del.args,['7',11,2]);
 }finally{db.query=original;}
});
test('V3.6.39: cambios con revisión obsoleta y IDs erróneos se rechazan',async()=>{
 const base={title:'Una idea',kind:'opinion',body:'Una opinión original',sources:[]};
 assert.equal(await drafts.update(1,'0',1,base),null);
 assert.equal(await drafts.update(1,'1',0,base),null);
 assert.equal(await drafts.remove(1,'2',-1),false);
 assert.equal(drafts.validId('5;DROP'),false);
 assert.equal(drafts.validId('../5'),false);
});
test('V3.6.39: las escrituras requieren Origin HTTPS coincidente',()=>{
 const run=(origin,host)=>{let ok=false,status,code;const req={headers:{origin},get:()=>host};const res={status:s=>{status=s;return{json:o=>{code=o.error;return o}}}};sameOrigin(req,res,()=>{ok=true});return{ok,status,code};};
 assert.deepEqual(run('https://redlibertad.com','redlibertad.com'),{ok:true,status:undefined,code:undefined});
 assert.deepEqual(run('https://otro.ejemplo','redlibertad.com'),{ok:false,status:403,code:'origen_no_permitido'});
 assert.deepEqual(run(undefined,'redlibertad.com'),{ok:false,status:403,code:'origen_requerido'});
 assert.deepEqual(run('http://redlibertad.com','redlibertad.com'),{ok:false,status:403,code:'origen_no_permitido'});
 assert.equal(run('http://localhost:3000','localhost:3000').ok,true);
});
test('V3.6.39: API segura no contiene publicación, votos ni pagos',()=>{
 const routes=read('src/routes/independent-drafts-v3639.js');
 const server=read('server.js');
 assert.match(routes,/router\.use\(requireAuth\)/);
 assert.match(routes,/birth_date <= \(CURRENT_DATE - INTERVAL '18 years'\)/);
 assert.match(routes,/req\.user\.id/);
 assert.doesNotMatch(routes,/req\.user\.ageVerified===true/);
 assert.match(routes,/sameOrigin,throttle/);
 for(const method of ['get','post','put','delete'])assert.match(routes,new RegExp('router\\.'+method+'\\('));
 assert.match(server,/app\.use\('\/api\/noticias\/redactores',independentDraftsV3639\)/);
 assert.doesNotMatch(routes,/\/publish|\/submit|\/vote|\/tip|\/checkout|stripe\./i);
 assert.doesNotMatch(routes,/requireAdmin/);
});
test('V3.6.39: editor privado sin renderizar HTML de usuarios ni falsa publicación',()=>{
 const landing=renderIndependentVoicesLanding();
 const html=renderIndependentVoicesEditor();
 const ui=read('public/editorial-voices-drafts-v3639.js');
 const editorial=read('src/routes/editorial-publication-v323.js');
 const css=read('public/editorial-voices-drafts-v3639.css');
 assert.match(landing,/href="\/noticias\/redactores\/escribir"/);
 assert.match(html,/id="draftFormV3639"/);
 assert.match(html,/id="draftLoginV3639"/);
 assert.match(html,/id="draftListV3639"/);
 assert.match(html,/Ningún borrador se publica ni se envía a revisión/);
 assert.match(editorial,/publicRouter\.get\('\/redactores\/escribir'/);
 assert.match(editorial,/noindex:true,independentVoices:true/);
 assert.match(editorial,/editorial-voices-drafts-v3639\.js/);
 assert.match(ui,/credentials:'same-origin'/);
 assert.match(ui,/textContent=d\.title/);
 assert.match(ui,/revision:state\.revision/);
 assert.match(ui,/window\.confirm/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(ui));
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/:focus-visible/);
 assert.match(page({title:'Test',description:'OK',pathname:'/noticias/redactores/escribir',body:html,noindex:true,independentVoices:true}),/meta name="robots" content="noindex,follow"/);
});
