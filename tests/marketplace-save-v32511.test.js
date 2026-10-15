'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const client=read('public/marketplace-v3250.js');
const html=read('public/marketplace.html');
function validation(input){
  const start=client.indexOf('function listingFormData(form){');
  const end=client.indexOf('function listingError(',start);
  assert.ok(start!==-1&&end>start,'validation helper present');
  class FakeFormData{constructor(form){this.form=form;}get(field){return this.form[field]??null;}}
  const fn=vm.runInNewContext('('+client.slice(start,end).trim()+')',{FormData:FakeFormData});
  return fn({kind:'product',deal:'sale',title:'Taza Flork canción',description:'Taza especial con una descripción completa para el anuncio.',category:'Tazas',city:'España',price:'15.99',status:'active',...input});
}
test('Marketplace saves the example product with 15.99 euros, city and description',()=>{
  const result=validation({});
  assert.equal(result.error,undefined);
  assert.equal(result.data.priceCents,1599);
  assert.equal(result.data.kind,'product');
  assert.equal(result.data.city,'España');
});
test('Prices entered with comma or dot are accepted and malformed prices rejected',()=>{
  assert.equal(validation({price:'15,99'}).data.priceCents,1599);
  assert.equal(validation({price:'0'}).data.priceCents,0);
  assert.equal(validation({price:'15.999'}).field,'price');
  assert.equal(validation({price:'abc'}).field,'price');
  assert.equal(validation({price:'-10'}).field,'price');
});
test('Invalid title and description present field-specific messages',()=>{
  assert.equal(validation({title:'Ta'}).field,'title');
  assert.equal(validation({description:'muy breve'}).field,'description');
  assert.equal(validation({category:''}).field,'category');
  assert.equal(validation({city:''}).field,'city');
  assert.equal(validation({kind:'service',deal:'sale'}).field,'deal');
});
test('Save form bypasses silent native constraint blocking and displays errors',()=>{
  assert.match(html,/<form method="dialog" id="listingForm" novalidate>/);
  assert.match(html,/id="formError" role="alert" aria-live="assertive"/);
  assert.match(html,/marketplace-v3250\.js\?v=3\.2\.64/);
  assert.match(client,/function listingError\(/);
  assert.match(client,/scrollIntoView/);
  assert.match(client,/btn\.textContent='Subiendo foto '/);
  assert.match(client,/btn\.textContent=state\.editing\?/);
  assert.match(client,/btn\.disabled=!state\.authenticated/);
  assert.match(client,/const parsed=listingFormData\(form\)/);
});
test('Media upload expects existing API contract and reports errors',()=>{
  const media=read('src/routes/media.js');
  assert.match(client,/\/api\/media\/upload/);
  assert.match(client,/result\.media\?\.url/);
  assert.match(client,/state\.images\.push\(url\)/);
  assert.match(client,/response\.details\?\.fieldErrors/);
  assert.match(client,/request_timeout/);
  assert.match(client,/media_upload_failed/);
  assert.match(media,/upload\.single\('file'\)/);
  assert.match(media,/media: \{/);
});
test('Version is V3.2.60 and existing marketplace routes are unchanged',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.64.3');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.64\.3'/);
  assert.match(read('src/routes/marketplace-v3250.js'),/router\.post\('\/',rateLimit/);
  assert.match(read('src/routes/marketplace-v3250.js'),/listingInput\.safeParse/);
});
