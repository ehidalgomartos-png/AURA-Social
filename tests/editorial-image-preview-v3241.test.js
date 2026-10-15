'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/admin.js'),html=read('public/admin.html');
const first=js.indexOf("$('#editorialImagePreviewButtonV3222')?.addEventListener('click',");
const last=js.indexOf("$('#editorialImageUseV3222')?.addEventListener('click',",first);
assert.ok(first>=0&&last>first,'The private preview click handler must be present');
const handler=js.slice(first,last);

function simulate(){
  const callbacks={},timers=new Map();
  let count=0;
  const img={
    loading:'lazy',alt:'',onload:null,onerror:null,
    removeAttribute(name){if(name==='src')this.src='';}
  };
  const figure={hidden:true},status={textContent:''};
  const button={disabled:false,addEventListener(event,fn){callbacks[event]=fn}};
  const elements={
    '#editorialImagePreviewV3222':img,
    '#editorialImageFigureV3222':figure,
    '#editorialImageStatusV3222':status,
    '#editorialImagePreviewButtonV3222':button
  };
  const script=[
    "let editorialImagePreviewSequenceV3241=0;",
    "let editorialImagePreviewTimerV3241=null;",
    "let editorialReviewCurrent={id:94,source_id:1,source_image_url:'https://news.example.test/photo.jpg'};",
    handler,
    "globalThis.previewTest={click:()=>{},changeRow:x=>{editorialReviewCurrent=x;}};"
  ].join('\n');
  const context={
    $:key=>elements[key],
    encodeURIComponent,
    setTimeout(fn,ms){const id=++count;timers.set(id,{fn,ms});return id;},
    clearTimeout(id){timers.delete(id);}
  };
  vm.runInNewContext(script,context);
  return {img,figure,status,button,timers,click:callbacks.click,changeRow:context.previewTest.changeRow};
}

test('manual preview starts eagerly despite being inside a hidden figure',()=>{
  const s=simulate();
  s.click();
  assert.equal(s.img.loading,'eager');
  assert.equal(s.img.src,'/api/admin/editorial/images/94/preview');
  assert.equal(s.figure.hidden,true);
  assert.equal(s.button.disabled,true);
  assert.match(s.status.textContent,/Cargando/);
  assert.equal(s.timers.size,1);
  assert.equal([...s.timers.values()][0].ms,30000);
  s.click();
  assert.equal(s.timers.size,1,'repeat clicks cannot trigger extra downloads');
});

test('successful preview becomes visible and releases the pending state',()=>{
  const s=simulate();s.click();
  s.img.onload();
  assert.equal(s.figure.hidden,false);
  assert.equal(s.button.disabled,false);
  assert.match(s.status.textContent,/Vista previa privada cargada/);
  assert.equal(s.timers.size,0);
});

test('failed preview shows an actionable error and permits retry',()=>{
  const s=simulate();s.click();s.img.onerror();
  assert.equal(s.figure.hidden,true);
  assert.equal(s.button.disabled,false);
  assert.match(s.status.textContent,/reintentar/);
  assert.equal(s.timers.size,0);
  s.click();
  assert.equal(s.button.disabled,true);
  assert.equal(s.timers.size,1);
});

test('timeout ends loading, removes pending image and allows another attempt',()=>{
  const s=simulate();s.click();
  const timer=[...s.timers.values()][0];
  timer.fn();
  assert.equal(s.figure.hidden,true);
  assert.equal(s.button.disabled,false);
  assert.equal(s.img.src,'');
  assert.match(s.status.textContent,/tardado demasiado/);
  s.click();
  assert.equal(s.img.src,'/api/admin/editorial/images/94/preview');
});

test('stale results do not show a photo for a different editorial candidate',()=>{
  const s=simulate();s.click();
  s.changeRow({id:95,source_id:1,source_image_url:'https://news.example.test/other.jpg'});
  s.img.onload();
  assert.equal(s.figure.hidden,true);
  assert.match(s.status.textContent,/Cargando/);
  assert.match(js,/function closeEditorialReview\(\)\{\s*cancelEditorialImagePreviewV3241\(\)/);
  assert.match(js,/function displayEditorialImageV3222\(item\)\{\s*cancelEditorialImagePreviewV3241\(\)/);
});

test('private HTTPS-only preview, human image rights and explicit authorization remain intact',()=>{
  const backend=read('src/routes/admin-editorial-images-v3222.js');
  assert.match(backend,/router\.use\(requireAdmin\)/);
  assert.match(backend,/router\.get\('\/images\/:id\/preview',limiter/);
  assert.match(backend,/res\.set\('Cache-Control','private, no-store'\)/);
  assert.match(backend,/confirmedPhotoRights:z\.literal\(true\)/);
  assert.match(backend,/rights_mode!=='licensed'/);
  assert.match(backend,/requiresNewReview:true,requiresNewQuality:true/);
  assert.match(html,/id="editorialImagePreviewV3222"[^>]*loading="eager"/);
  assert.match(html,/\/admin\.js\?v=3\.2\.63\.2/);
  assert.match(read('server.js'),/APP_VERSION='3\.2\.63\.2'/);
  assert.equal(JSON.parse(read('package.json')).version,'3.2.63.2');
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-preview/);
});
