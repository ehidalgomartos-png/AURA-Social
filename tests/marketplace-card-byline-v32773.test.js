'use strict';
// V3.2.77.3 — Card byline and geographical facts (actual existing helper functions).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('public/marketplace-v3250.js','utf8');
const html=fs.readFileSync('public/marketplace.html','utf8');
function render(overrides={}){
 const helpers=js.indexOf('function marketSpain(v){');
 const end=js.indexOf('function emptyMarketplaceState()',helpers);
 assert.ok(helpers>=0&&end>helpers,'market card functions found');
 const make=new Function('state','window','safeListingPhotos','slugifyMarket','esc','isRecentListing','priceLabel','label',js.slice(helpers,end)+';return card;');
 const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const card=make({mode:'discover'},{currentUserId:99},()=>[],()=> 'taza',escape,()=>false,()=> '15,99 €',{active:'Activo'});
 return card({id:9,seller_id:4,seller_discoverable:true,seller_name:'MundoTaza',seller_username:'mundotaza',
  status:'active',moderation_status:'published',kind:'product',deal:'sale',title:'Taza Halloween Catrinas',
  city:'España',details:{province:'España',saleScope:'national',condition:'new'},...overrides});
}
test('nationwide sale only states national availability once and links the seller',()=>{
 const card=render();
 assert.equal((card.match(/Venta en toda España/g)||[]).length,1);
 assert.doesNotMatch(card,/Venta disponible en toda España|📍 España/);
 assert.match(card,/Vendido por <a class="seller-profile-link" href="\/perfil\/mundotaza">MundoTaza<\/a>/);
 assert.match(card,/Ver anuncio/);
 assert.match(card,/Contactar/);
 assert.match(card,/Más opciones del anuncio/);
});
test('real seller city stays visible even with nationwide delivery',()=>{
 const card=render({city:'Valencia',details:{province:'Valencia',saleScope:'national'}});
 assert.equal((card.match(/Venta en toda España/g)||[]).length,1);
 assert.match(card,/Valencia · Vendido por/);
 assert.doesNotMatch(card,/Valencia · Venta disponible en toda España/);
});
test('local sale retains location information and buy/service keep their previous attribution',()=>{
 const local=render({city:'Valencia',details:{province:'Valencia',saleScope:'local'}});
 assert.match(local,/Valencia · Venta en la zona indicada · Vendido por/);
 const service=render({kind:'service',deal:'offer',city:'Valencia',details:{}});
 assert.match(service,/📍 Valencia · <a class="seller-profile-link"/);
 assert.doesNotMatch(service,/Vendido por/);
 const wanted=render({kind:'product',deal:'buy',city:'Valencia',details:{}});
 assert.match(wanted,/📍 Valencia · <a class="seller-profile-link"/);
 assert.doesNotMatch(wanted,/Vendido por/);
});
test('hidden seller identity is never accidentally rendered as an unapproved profile URL',()=>{
 const markup=render({seller_discoverable:false,seller_name:'Tienda & Más'});
 assert.doesNotMatch(markup,/href="\/perfil\//);
 assert.match(markup,/Vendido por Tienda &amp; Más/);
});
test('updated script is explicitly refreshed while unchanged marketplace stylesheet remains cached',()=>{
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.77\.3/);
 assert.match(html,/marketplace-v3250\.css\?v=3\.2\.77\.2/);
});
