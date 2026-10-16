'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const script=fs.readFileSync('public/marketplace-v3250.js','utf8');
const css=fs.readFileSync('public/marketplace-v3250.css','utf8');
const page=fs.readFileSync('public/marketplace.html','utf8');
function render(mode='discover',user=99){
 const start=script.indexOf('function card(item){');
 const end=script.indexOf('function emptyMarketplaceState()',start);
 assert.ok(end>start);
 const maker=new Function('state','window','safeListingPhotos','slugifyMarket','esc','marketDisplayLocation','isRecentListing','priceLabel','marketNational','marketOrigin','label',script.slice(start,end)+';return card;');
 const card=maker({mode},{currentUserId:user},()=>['/uploads/test.jpg'],()=> 'taza',
  value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  ()=>'Venta en toda España',()=>false,()=> '15,99 €',()=>true,()=>'',{active:'Activo'});
 return card({id:5,seller_id:1,seller_username:'mundotaza',seller_name:'MundoTaza',seller_discoverable:true,
 title:'Taza Halloween Catrinas',status:'active',moderation_status:'published',
 kind:'product',deal:'sale',details:{condition:'new'},is_favorite:false});
}
test('public card has compact main contact and detail plus accessible secondary actions',()=>{
 const html=render();
 assert.match(html,/market-card-actions-v32772/);
 assert.match(html,/market-card-main-v32772/);
 for(const marker of ['data-contact-id="5"','data-share="5"','data-fav="5"','data-report="5"','compartirAnuncio=5','Más opciones del anuncio'])
  assert.ok(html.includes(marker),marker);
 assert.equal((html.match(/data-contact-id="5"/g)||[]).length,1);
});
test('seller, owner and moderator keep existing card actions',()=>{
 assert.match(render('mine',1),/data-edit="5"/);
 assert.match(render('mine',1),/data-delete="5"/);
 assert.match(render('discover',1),/data-manage="5"/);
 assert.match(render('reports',99),/data-mod="5"/);
 assert.doesNotMatch(render('mine',1),/market-card-actions-v32772/);
});
test('mobile layout is scoped and cache-busted',()=>{
 assert.match(css,/\.market-catalog-card \.actions\.market-card-actions-v32772/);
 assert.match(css,/market-card-extra-v32772\[open\]/);
 assert.match(page,/marketplace-v3250\.css\?v=3\.2\.77\.2/);
 assert.match(page,/marketplace-v3250\.js\?v=3\.2\.77\.3/);
});
