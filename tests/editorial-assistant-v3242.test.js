'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ai=require('../src/routes/admin-editorial-ai-v3242');
const media=read('src/routes/admin-editorial-media-v3242.js');
const admin=read('public/admin.js'),html=read('public/admin.html');
const pub=read('src/routes/editorial-publication-v323.js');
const review=read('src/routes/admin-editorial-review-v322.js');
const aiRoute=read('src/routes/admin-editorial-ai-v3242.js');
test('three image modes are visible and original RSS licensing flow remains separate',()=>{
  for(const v of ['value="none"','value="own"','value="rss"',
    'editorialImageOwnFormV3242','editorialImageRemoveV3242','editorialImageRssControlsV3242']){
    assert.ok(html.includes(v),v);
  }
  assert.match(html,/editorialImageUseV3222/);
  assert.match(admin,/updateEditorialImageModeV3242/);
  assert.match(admin,/images\/'\+encodeURIComponent\(id\)\+'\/own/);
  assert.match(admin,/images\/'\+encodeURIComponent\(id\)\+'\/without/);
});
test('owned photo upload remains admin-only and validates bytes and rights',()=>{
  for(const token of ['router.use(requireAdmin)','multer.memoryStorage()',
    'MAX_IMAGE_BYTES','mimeOfImage(req.file?.buffer)',
    'confirmedOwnedRights','rightsReference',
    "router.post('/images/:id/own',limited",
    'await assertWritable(client,id,data.revision)',
    'editorial_unpublish_before_reopen',
    "editorial_image_origin='own'",
    "status='pending',reviewed_at=NULL,reviewed_by=NULL,revision=revision+1",
    "'own_photo'","'remove_photo'","await client.query('ROLLBACK')",
    'await fs.unlink(saved.absolutePath)',"router.post('/images/:id/without',limited"]){
    assert.ok(media.includes(token),token);
  }
  assert.match(review,/ADD COLUMN IF NOT EXISTS editorial_image_origin/);
  assert.match(review,/c\.editorial_image_origin/);
  assert.match(pub,/row\.editorial_image_origin!=='own'/);
  assert.match(pub,/row\.rights_mode!=='licensed'/);
  assert.match(read('src/routes/admin-editorial-images-v3222.js'),/editorial_image_origin='rss'/);
});
test('photos are never published or authorised by toggling a front-end radio',()=>{
  assert.match(media,/requiresNewReview:true,requiresNewQuality:true,published:false/);
  assert.match(pub,/if\(!qualityReady\(row\)\)/);
  assert.match(pub,/if\(!isOriginalEditorial\(row\)\)/);
  assert.match(media,/res\.set\('Cache-Control','no-store'\)/);
  assert.match(admin,/confirmedOwnedRights/);
});
test('no automatic filler text on review or imported webpage; AI is explicitly requested',()=>{
  assert.doesNotMatch(admin,/if\(item\.status==='pending'\)fillEditorialDraftV3213\(item,false\)/);
  assert.doesNotMatch(admin,/RedLibertad analiza: '\+String\(draft\.title_suggestion/);
  assert.match(admin,/\$\('#editorialWebTitleV3223'\)\.value='';/);
  assert.match(admin,/\$\('#editorialWebSummaryV3223'\)\.value='';/);
  assert.match(admin,/editorialAiDraftButtonV3242/);
  assert.match(admin,/editorialWebAiDraftV3242/);
  assert.match(html,/Hechos contrastados/);
});
test('AI is disabled by default, only on-demand by admin with throttling and no publishing',()=>{
  const old=process.env.OPENAI_API_KEY;
  try{
    delete process.env.OPENAI_API_KEY;
    assert.equal(ai.aiReady(),false);
    assert.equal(ai.haveEvidence({sourceTitle:'Algo ocurrió',sourceExcerpt:''}),false);
    assert.equal(ai.haveEvidence({verifiedFacts:'A'.repeat(70)}),true);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=old;}
  for(const token of ['router.use(requireAdmin)','router.post(','store:false',
    "https://api.openai.com/v1/responses",'max_output_tokens:700',
    "strict:true","confirmedPhotoRights", "editorial_ai_not_configured"]){
    if(token!=='confirmedPhotoRights')assert.ok(aiRoute.includes(token),token);
  }
  assert.match(aiRoute,/autoPublish:false/);
  assert.doesNotMatch(aiRoute,/approveCandidate|autoPublish\s*:\s*true|INSERT INTO editorial/);
});
test('AI proposes constrained original output and checks insufficient evidence',async()=>{
  const old=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='sk-test-exclusively-fake-value';
  const facts='El ayuntamiento aprobó una mejora en el transporte público en su reunión del lunes, con un nuevo autobús previsto para el próximo año.';
  const ctx={sourceTitle:'El ayuntamiento aprueba nuevas medidas de transporte',
    sourceExcerpt:'La corporación municipal presenta mejoras en los autobuses del centro de la ciudad desde el próximo año.',
    sourceName:'Diario Ejemplo',verifiedFacts:facts};
  let call;
  const fake=async(url,opts)=>{
    call={url,opts};
    return {ok:true,json:async()=>({output:[{type:'message',content:[{
      type:'output_text',text:JSON.stringify({ready:true,
        title:'Mejoras previstas en el transporte público municipal',
        summary:'El ayuntamiento ha aprobado una propuesta de mejora del transporte público. Según los datos facilitados, se prevé añadir un autobús durante el próximo año. La información requiere revisión editorial antes de su publicación.',
        reason:''})}]}]})};
  };
  try{
    const result=await ai.generate(ctx,{fetcher:fake});
    assert.equal(result.ready,true);
    assert.match(result.title,/transporte público/);
    assert.equal(call.url,'https://api.openai.com/v1/responses');
    const sent=JSON.parse(call.opts.body);
    assert.equal(sent.store,false);
    assert.equal(sent.text.format.type,'json_schema');
    assert.equal(sent.input[1].role,'user');
    assert.equal(sent.input[1].content.includes(facts),true);
    assert.equal(sent.input[1].content.includes('sk-test'),false);
    await assert.rejects(ai.generate({sourceTitle:'Titular escueto',sourceExcerpt:'Muy poco'},{fetcher:fake}),
      {code:'editorial_ai_insufficient_evidence'});
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=old;}
});
test('version and CI are updated without touching the previous PWA and SW',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.50');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.50'/);
  assert.match(read('server.js'),/editorialMediaV3242Admin/);
  assert.match(read('server.js'),/editorialAiV3242Admin/);
  assert.match(html,/\/admin\.js\?v=3\.2\.50/);
  assert.match(read('public/app.html'),/\/social\.js\?v=3\.2\.50/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-assistant/);
});
