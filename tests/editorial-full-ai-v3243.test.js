'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const router=require('../src/routes/admin-editorial-ai-image-v3243');
const api=read('src/routes/admin-editorial-ai-image-v3243.js');
const pub=read('src/routes/editorial-publication-v323.js');
const social=read('src/routes/editorial-social-v324.js');
const ui=read('public/admin.js'),html=read('public/admin.html');
const jpeg=Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
test('Express receives an actual router and both routes are admin protected',()=>{
 assert.equal(typeof router,'function');
 assert.match(api,/router\.use\(requireAdmin\)/);
 assert.match(api,/router\.post\('\/ai-image\/:id',limit/);
 assert.match(api,/router\.post\('\/ai-complete\/:id',limit/);
 assert.match(read('server.js'),/app\.use\('\/api\/admin\/editorial', editorialAiImageV3243Admin\)/);
});
test('no paid image generation without opt-in and an API key',()=>{
 const oldKey=process.env.OPENAI_API_KEY,oldEnabled=process.env.EDITORIAL_AI_IMAGE_ENABLED;
 try{
  delete process.env.OPENAI_API_KEY;
  process.env.EDITORIAL_AI_IMAGE_ENABLED='true';
  assert.equal(router.configured(),false);
  process.env.OPENAI_API_KEY='sk-test-placeholder-not-real';
  process.env.EDITORIAL_AI_IMAGE_ENABLED='false';
  assert.equal(router.configured(),false);
  process.env.EDITORIAL_AI_IMAGE_ENABLED='true';
  assert.equal(router.configured(),true);
 }finally{
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldEnabled===undefined)delete process.env.EDITORIAL_AI_IMAGE_ENABLED;else process.env.EDITORIAL_AI_IMAGE_ENABLED=oldEnabled;
 }
});
test('image prompt never portrays editorial illustration as an eyewitness photo',()=>{
 const regular=router.imagePrompt({sourceTitle:'Cambios en el transporte público municipal',verifiedFacts:'Se debatió una modificación del servicio'});
 assert.match(regular.prompt,/NO foto documental/);
 assert.match(regular.prompt,/NO rostros identificables/);
 assert.match(regular.prompt,/NO texto/);
 assert.equal(regular.mode,'conceptual');
 const sensitive=router.imagePrompt({sourceTitle:'Accidente con menores en una ciudad',verifiedFacts:'Investigación abierta'});
 assert.equal(sensitive.mode,'conceptual-sensitive');
 assert.match(sensitive.prompt,/TEMA SENSIBLE/);
 assert.match(sensitive.prompt,/sin víctimas/);
 assert.ok(sensitive.prompt.length<=2600);
});
test('image API request uses JPEG 3:2 low-cost configuration and validates bytes',async()=>{
 const key=process.env.OPENAI_API_KEY,enabled=process.env.EDITORIAL_AI_IMAGE_ENABLED;
 process.env.OPENAI_API_KEY='sk-fake-unit-testing-secret-only';
 process.env.EDITORIAL_AI_IMAGE_ENABLED='true';
 let called;
 try{
  const img=await router.generateImage('Ilustración abstracta',{fetcher:async(url,opts)=>{
   called={url,opts};
   return {ok:true,json:async()=>({data:[{b64_json:jpeg.toString('base64')}]})};
  }});
  assert.equal(img.mime,'image/jpeg');
  assert.equal(called.url,'https://api.openai.com/v1/images/generations');
  const req=JSON.parse(called.opts.body);
  assert.equal(req.size,'1536x1024');
  assert.equal(req.quality,'low');
  assert.equal(req.output_format,'jpeg');
  assert.equal(req.output_compression,75);
  assert.equal(req.n,1);
  assert.equal(req.prompt,'Ilustración abstracta');
  await assert.rejects(router.generateImage('bad',{fetcher:async()=>({
   ok:true,json:async()=>({data:[{b64_json:Buffer.from('Not an image').toString('base64')}]})
  })}),{code:'editorial_ai_image_invalid'});
 }finally{
  if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  if(enabled===undefined)delete process.env.EDITORIAL_AI_IMAGE_ENABLED;else process.env.EDITORIAL_AI_IMAGE_ENABLED=enabled;
 }
});
test('hard cap on configured budgets and persistent serialized reservation',()=>{
 const a=process.env.EDITORIAL_AI_IMAGE_DAILY_LIMIT,b=process.env.EDITORIAL_AI_IMAGE_MONTHLY_LIMIT;
 try{
  process.env.EDITORIAL_AI_IMAGE_DAILY_LIMIT='100000';
  process.env.EDITORIAL_AI_IMAGE_MONTHLY_LIMIT='500000';
  assert.equal(router.dailyLimit(),10);
  assert.equal(router.monthlyLimit(),30);
  process.env.EDITORIAL_AI_IMAGE_DAILY_LIMIT='3';
  process.env.EDITORIAL_AI_IMAGE_MONTHLY_LIMIT='8';
  assert.equal(router.dailyLimit(),3);
  assert.equal(router.monthlyLimit(),8);
 }finally{
  if(a===undefined)delete process.env.EDITORIAL_AI_IMAGE_DAILY_LIMIT;else process.env.EDITORIAL_AI_IMAGE_DAILY_LIMIT=a;
  if(b===undefined)delete process.env.EDITORIAL_AI_IMAGE_MONTHLY_LIMIT;else process.env.EDITORIAL_AI_IMAGE_MONTHLY_LIMIT=b;
 }
 for(const token of ['editorial_ai_image_requests','pg_advisory_xact_lock(3243, 1)',
  "'reserved','succeeded'","date_trunc('month'","Europe/Madrid",
  'editorial_ai_image_one_per_story','editorial_ai_image_quota','editorial_ai_image_reservation_expired'])
  assert.ok(api.includes(token),token);
});
test('saving image does not publish: reset review and quality, audited, with rollback cleanup',()=>{
 for(const token of ["editorial_image_origin='ai'","editorial_image_prompt=$4",
  "editorial_image_model=$5","editorial_ai_generated_at=now()",
  "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1",
  "'ai_illustration'","'ROLLBACK'","fs.unlink(stored.absolutePath)",
  "requiresNewReview:true,requiresNewQuality:true","published:false",
  "'/ai-complete/:id'","editorial_review_stale"])assert.ok(api.includes(token),token);
 assert.doesNotMatch(api,/UPDATE editorial_publications SET|INSERT INTO editorial_publications/);
});
test('public news surfaces and social feed identify the illustration as AI',()=>{
 assert.match(pub,/ADD COLUMN IF NOT EXISTS image_origin VARCHAR\(12\)/);
 assert.match(pub,/image_rights_reference=\$12,image_origin=\$13/);
 assert.match(pub,/row\.editorial_image_origin==='ai'/);
 assert.match(pub,/row\.editorial_image_prompt/);
 assert.match(pub,/row\.image_origin==='ai'/);
 assert.match(pub,/p\.image_origin==='ai'/);
 assert.match(pub,/Imagen ilustrativa generada con IA/);
 assert.match(social,/p\.image_credit,p\.image_origin/);
 assert.match(read('public/editorial-home-v324.js'),/item\.image_origin==='ai'/);
});
test('admin has fourth image mode and full draft requires confirmation',()=>{
 assert.match(html,/value="ai"> Generar ilustración con IA/);
 assert.match(html,/id="editorialAiImageButtonV3243"/);
 assert.match(html,/id="editorialAiCompleteButtonV3243"/);
 assert.match(html,/id="editorialAiImagePreviewV3243"/);
 assert.match(ui,/requestEditorialAiImageV3243/);
 assert.match(ui,/editorialAiImageBusyV3243/);
 assert.match(ui,/refreshEditorialImageAfterSaveV3242\(id\)/);
 assert.match(ui,/Sin GUARDAR|SIN GUARDAR/);
 assert.match(ui,/confirm\('Esta operación utilizará créditos de OpenAI/);
 assert.match(ui,/editorialAiImageErrorV3243/);
});
test('3.2.56 is wired with new release assets and CI tests without modifying PWA worker',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.56');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.56'/);
 assert.match(html,/\/admin\.js\?v=3\.2\.56/);
 assert.match(read('public/app.html'),/\/social\.js\?v=3\.2\.56/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-full-ai/);
 assert.match(read('package.json'),/test:editorial-full-ai/);
});
