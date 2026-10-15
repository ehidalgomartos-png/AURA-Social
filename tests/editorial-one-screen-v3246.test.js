'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const one=require('../public/editorial-ai-publisher-v3246');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const metadata={canonical_url:'https://medio.example/articulo',source_title:'Avance cultural confirmado',source_excerpt:'Un evento con datos del medio'};
const profiles=[{id:14,name:'Cultura',category:'cultura'}];
const fields={url:metadata.canonical_url,category:'cultura',profileId:14,
 title:'Una novedad cultural da lugar a una exposición pública',
 summary:'El museo anuncia una exposición en la que se presentan diversas piezas culturales, conforme a la información detallada en la fuente original.',
 note:'He leído la fuente y comprobado el contexto y los derechos necesarios.',
 checks:{sourceRead:true,factsChecked:true,rightsChecked:true},
 verifiedFacts:'El medio presenta el programa cultural de la ciudad.',wantImage:false,paidImageConfirmed:false};
test('strict HTTPS canonical URL and profile match before any save',()=>{
 assert.equal(one.validate({metadata,fields,profiles}).ok,true);
 assert.equal(one.validate({metadata,fields:{...fields,url:'https://otro.example/noticia'},profiles}).ok,false);
 assert.equal(one.validate({metadata,fields:{...fields,url:'http://medio.example/articulo'},profiles}).ok,false);
 assert.equal(one.validate({metadata,fields:{...fields,profileId:99},profiles}).ok,false);
 assert.equal(one.validate({metadata,fields:{...fields,note:''},profiles}).ok,false);
 assert.equal(one.validate({metadata,fields:{...fields,checks:{...fields.checks,rightsChecked:false}},profiles}).ok,false);
});
test('paid image cannot be requested without explicit cost confirmation',async()=>{
 let calls=0;
 await assert.rejects(one.prepare({metadata,profiles,fields:{...fields,wantImage:true},apiRequest:async()=>{calls++;}}),{stage:'validación'});
 assert.equal(calls,0);
});
test('saved news remains pending and is NEVER automatically approved or published',async()=>{
 const calls=[];
 const outcome=await one.prepare({metadata,fields,profiles,apiRequest:async(url,request)=>{
   calls.push({url,body:JSON.parse(request.body)});
   return {r:{ok:true},d:{ok:true,candidate:{id:83,revision:1,status:'pending'}}};
 }});
 assert.deepEqual(outcome,{id:'83',hasImage:false});
 assert.deepEqual(calls.map(x=>x.url),['/api/admin/editorial/web-import/save']);
 assert.equal(calls[0].body.confirmedPhotoIsNotLicensed,true);
});
test('image is generated only on demand, after persisting a new candidate',async()=>{
 const urls=[],revisions=[];
 const outcome=await one.prepare({metadata,profiles,fields:{...fields,wantImage:true,paidImageConfirmed:true},
   apiRequest:async(url,req)=>{
    urls.push(url);revisions.push(JSON.parse(req.body).revision);
    if(url.endsWith('/save'))return {r:{ok:true},d:{candidate:{id:123,revision:1,status:'pending'}}};
    return {r:{ok:true},d:{candidate:{revision:2,editorial_image_url:'/uploads/ed-photo.jpg'}}};
 }});
 assert.equal(outcome.id,'123');assert.equal(outcome.hasImage,true);
 assert.deepEqual(urls,['/api/admin/editorial/web-import/save','/api/admin/editorial/ai-image/123']);
 assert.equal(revisions[1],1);
});
test('image failures preserve draft ID and do not attempt publication',async()=>{
 let calls=0;
 await assert.rejects(one.prepare({metadata,profiles,fields:{...fields,wantImage:true,paidImageConfirmed:true},
  apiRequest:async(url)=>{
   calls++;
   if(url.endsWith('/save'))return {r:{ok:true},d:{candidate:{id:12,revision:1}}};
   return {r:{ok:false},d:{error:'editorial_ai_image_quota'}};
  }}),error=>error.candidateId==='12'&&error.stage==='generar ilustración IA');
 assert.equal(calls,2);
});
test('UI calls existing V3.2.60 review-to-publication preview, not direct publish',()=>{
 const admin=read('public/admin.js'),html=read('public/admin.html'),css=read('public/admin.css');
 assert.match(html,/id="editorialAiUrlV3246"/);
 assert.match(html,/id="editorialAiPrepareV3246"/);
 assert.match(html,/id="editorialAiGenerateDraftV3246"/);
 assert.match(html,/id="editorialAiPaidConfirmV3246"/);
 assert.match(html,/editorial-ai-publisher-v3246\.js\?v=3\.2\.63\.2/);
 assert.match(admin,/editorialAiPublisherV3246\.prepare/);
 assert.match(admin,/editorialQuickPublishV3245.*click/);
 assert.match(css,/\.editorial-ai-fast-v3246/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.69');
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-one-screen/);
});
