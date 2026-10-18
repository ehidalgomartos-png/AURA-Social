'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const script=read('public/marketplace-share-v3254.js');
const listing={
 id:77,title:'Armario Turín 3 Puertas',description:'Armario blanco de tres puertas y dos cajones, disponible para envío.',
 kind:'product',deal:'sale',category:'Hogar y muebles',city:'Valencia',
 details:{saleScope:'national',province:'Valencia'},image_urls:['/uploads/armario.webp'],
 price_cents:23500,seller_username:'muebleselchollazo',seller_name:'Muebles El Chollazo',
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-15T09:00:00Z',updated_at:'2026-10-15T09:00:00Z'
};
function harness({supported=true,shareError=null}={}){
 const logs={shares:[],copies:[],prompts:[]};
 const status={textContent:''};
 let clickListener;
 const navigator={
  clipboard:{writeText:async url=>{logs.copies.push(url);}}
 };
 if(supported)navigator.share=async payload=>{
  logs.shares.push(payload);
  if(shareError)throw {name:shareError};
 };
 const context={URL,navigator,
  window:{prompt:(...args)=>{logs.prompts.push(args);}},
  document:{addEventListener:(type,callback)=>{if(type==='click')clickListener=callback;},
   getElementById:()=>status}
 };
 vm.runInNewContext(script,context);
 async function click(attributes){
  const button={
   hasAttribute:key=>Object.hasOwn(attributes,key),
   getAttribute:key=>attributes[key]??null
  };
  await clickListener({target:{closest:()=>button}});
 }
 return {logs,status,click};
}
const url='https://redlibertad.com/marketplace/p/77/armario-turin-3-puertas';

test('SEO detail offers native sharing, retains all previous channels and category discovery',()=>{
 const html=seo.listingHtml(listing);
 assert.match(html,/data-market-native-share="https:\/\/redlibertad.com\/marketplace\/p\/77\/armario-turin-3-puertas"/);
 assert.match(html,/data-market-share-title="Armario Turín 3 Puertas"/);
 assert.match(html,/Publicar en RedLibertad/);
 assert.match(html,/WhatsApp/);
 assert.match(html,/Facebook/);
 assert.match(html,/data-copy-url=/);
 assert.match(html,/market-more-category-v3272/);
 assert.match(html,/\/marketplace\/explorar\?tipo=product&amp;categoria=Hogar%20y%20muebles/);
 assert.match(html,/marketplace-share-v3254\.js\?v=3\.2\.75/);
 assert.match(html,/property="og:image"/);
 assert.match(html,/\/marketplace\/imagen\/77\/0/);
});
test('native share triggers only after a click and carries the accurate URL',async()=>{
 const h=harness();
 assert.equal(h.logs.shares.length,0);
 await h.click({'data-market-native-share':url,'data-market-share-title':'Armario Turín 3 Puertas'});
 assert.equal(h.logs.shares.length,1);
 assert.equal(h.logs.shares[0].url,url);
 assert.equal(h.logs.shares[0].title,'Armario Turín 3 Puertas');
 assert.equal(h.logs.copies.length,0);
});
test('unsupported Web Share gracefully copies; cancel does not copy or post',async()=>{
 const h=harness({supported:false});
 await h.click({'data-market-native-share':url});
 assert.deepEqual(h.logs.copies,[url]);
 assert.match(h.status.textContent,/copiado/);
 const cancelled=harness({shareError:'AbortError'});
 await cancelled.click({'data-market-native-share':url});
 assert.deepEqual(cancelled.logs.copies,[]);
 assert.equal(cancelled.status.textContent,'');
});
test('unexpected share errors fall back to clipboard without posting',async()=>{
 const h=harness({shareError:'NotAllowedError'});
 await h.click({'data-market-native-share':url});
 assert.deepEqual(h.logs.copies,[url]);
 assert.equal(h.logs.shares.length,1);
});
test('share and copy URLs reject external origins, injected queries and invalid IDs',async()=>{
 const h=harness();
 for(const unsafe of [
  'https://redlibertad.com.attacker.invalid/marketplace/p/77/armario',
  'https://redlibertad.com/marketplace/p/77/armario?next=evil',
  'https://redlibertad.com/marketplace/p/77/armario#hash',
  'javascript:alert(1)','https://redlibertad.com/marketplace/p/0/armario'
 ])await h.click({'data-market-native-share':unsafe});
 assert.equal(h.logs.shares.length,0);
 assert.equal(h.logs.copies.length,0);
 await h.click({'data-copy-url':url});
 assert.deepEqual(h.logs.copies,[url]);
});
test('seller category is encoded and no user supplied HTML leaks into attributes',()=>{
 const bad={...listing,title:'<script>alert(1)</script>',category:'Hogar & <script>alert(1)</script>'};
 const html=seo.listingHtml(bad);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/data-market-share-title="&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
 assert.match(html,/categoria=Hogar%20%26%20%3Cscript%3E/);
});
test('no DB schema or PWA changes, release and responsive assets updated',()=>{
 const css=read('public/marketplace-seo-v3251.css');
 assert.match(css,/\.market-native-share-v3272/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(read('server.js'),/APP_VERSION='3\.2\.77'/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.77');
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.77\.3/);
 assert.match(read('public/app.html'),/social\.js\?v=3\.2\.75/);
});
