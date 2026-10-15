'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const flow=require('../public/editorial-quick-publish-v3245');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const item={id:9,revision:3,status:'pending',source_id:4,source_status:'approved',
 canonical_url:'https://example.org/news/9',editorial_title:'Anterior titular editorial propio',
 editorial_summary:'Resumen anterior escrito por un editor y con información pública suficientemente detallada para revisión.',
 editor_note:'Revisión anterior detallada'};
const fields={title:'Nuevo titular informativo original de prueba',
 summary:'Información informativa contrastada para el nuevo resumen de RedLibertad, con contexto suficiente y sin atribuciones inventadas.',
 note:'He consultado el origen, comprobado los hechos y los permisos de la imagen.',
 checks:{sourceRead:true,factsChecked:true,rightsChecked:true}};
const ok=(candidate,extras={})=>({r:{ok:true},d:{ok:true,...(candidate?{candidate:{revision:candidate}}:{}),...extras}});
test('one-click publishing requires a genuine human attestation and review note',()=>{
 assert.equal(flow.validate({item,fields}).ok,true);
 for(const field of ['sourceRead','factsChecked','rightsChecked']){
   const incomplete={...fields,checks:{...fields.checks,[field]:false}};
   assert.equal(flow.validate({item,fields:incomplete}).ok,false);
 }
 assert.equal(flow.validate({item,fields:{...fields,note:''}}).ok,false);
 assert.equal(flow.validate({item:{...item,status:'approved'},fields}).ok,false);
 assert.equal(flow.validate({item:{...item,source_id:null},fields}).ok,false);
 assert.equal(flow.validate({item:{...item,canonical_url:'http://example.org'},fields}).ok,false);
});
test('unsaved AI text uses draft → approval → quality → publish, with incrementing revisions',async()=>{
 const calls=[],progress=[];
 const stub=async(url,options)=>{
   const body=JSON.parse(options.body);calls.push({url,method:options.method,body});
   if(url.endsWith('/draft'))return ok(4);
   if(url.endsWith('/decision'))return ok(5);
   if(url.includes('/quality/'))return ok();
   return ok(null,{url:'/noticias/p/9',publicationId:9});
 };
 const result=await flow.run({item,fields,apiRequest:stub,onStep:s=>progress.push(s)});
 assert.equal(result.url,'/noticias/p/9');
 assert.deepEqual(calls.map(x=>x.method),['PATCH','POST','PUT','POST']);
 assert.deepEqual(calls.map(x=>x.body.revision),[3,4,5,5]);
 assert.equal(calls[1].body.decision,'approve');
 assert.equal(calls[2].body.decision,'clear');
 assert.equal(calls[2].body.sourceChecked,true);
 assert.equal(calls[3].body.confirm,true);
 assert.equal(progress.at(-1),'publicada');
});
test('never spends money, approves or publishes when manual checks are missing',async()=>{
 let calls=0;
 await assert.rejects(flow.run({item,fields:{...fields,checks:{...fields.checks,rightsChecked:false}},
  apiRequest:async()=>{calls++;return ok();}}));
 assert.equal(calls,0);
});
test('if approval fails, quality and publish are NEVER called',async()=>{
 const urls=[];
 await assert.rejects(flow.run({item,fields,apiRequest:async(url)=>{
   urls.push(url);
   if(url.endsWith('/draft'))return ok(4);
   return {r:{ok:false},d:{error:'editorial_source_not_approved'}};
 }}),{stage:'aprobar noticia'});
 assert.equal(urls.length,2);
});
test('if quality fails, publication is blocked; partial progress stays explicit',async()=>{
 const urls=[];
 await assert.rejects(flow.run({item,fields,apiRequest:async(url)=>{
   urls.push(url);
   if(url.endsWith('/draft'))return ok(4);
   if(url.endsWith('/decision'))return ok(5);
   return {r:{ok:false},d:{error:'editorial_quality_stale'}};
 }}),{stage:'comprobar calidad'});
 assert.equal(urls.length,3);
});
test('unchanged reviewed draft skips PATCH but still requires approval and quality',async()=>{
 const current={...item,editorial_title:fields.title,editorial_summary:fields.summary,editor_note:fields.note};
 const urls=[];
 const result=await flow.run({item:current,fields,apiRequest:async(url)=>{
   urls.push(url);
   if(url.endsWith('/decision'))return ok(4);
   if(url.includes('/quality/'))return ok();
   return ok(null,{url:'/noticias/p/9'});
 }});
 assert.equal(urls.length,3);
 assert.equal(urls[0].endsWith('/decision'),true);
 assert.equal(result.url,'/noticias/p/9');
});
test('integrated editor and mobile preview remain explicit and cache-busted',()=>{
 const admin=read('public/admin.js'),html=read('public/admin.html'),css=read('public/admin.css');
 assert.match(html,/id="editorialQuickPublishV3245"/);
 assert.match(html,/id="editorialQuickPreviewV3245"/);
 assert.match(html,/id="editorialQuickConfirmV3245"/);
 assert.match(admin,/editorialQuickPublishV3245\.run/);
 assert.match(admin,/renderEditorialOriginalityV32171/);
 assert.match(html,/editorial-quick-publish-v3245\.js\?v=3\.2\.63\.2/);
 assert.match(css,/\.editorial-quick-preview-v3245/);
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'3.2.63.2');
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-quick-publish/);
});
