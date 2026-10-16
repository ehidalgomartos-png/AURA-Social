'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/marketplace-v3250.js','utf8');
const html=fs.readFileSync('public/marketplace.html','utf8');
const css=fs.readFileSync('public/marketplace-v3250.css','utf8');
const seo=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
function renderCard(sellerId,userId,mode='discover'){
 const start=source.indexOf('function card(item){');
 const end=source.indexOf('function emptyMarketplaceState(){',start);
 assert.ok(start>=0&&end>start);
 const item={id:24,seller_id:sellerId,seller_username:'ejemplo',seller_name:'Ejemplo',
  seller_discoverable:true,status:'active',moderation_status:'published',kind:'product',
  deal:'sale',title:'Taza de prueba',category:'Tazas',city:'Valencia',details:{},price_cents:1599,
  image_urls:[],is_favorite:false};
 return vm.runInNewContext(source.slice(start,end)+'\ncard(item)',{
  item,state:{mode},window:{currentUserId:userId},firstImage:()=>null,
  slugifyMarket:()=> 'taza-de-prueba',esc:value=>String(value),
  priceLabel:()=> '15,99 €',label:{active:'Activo'}
 });
}
test('Own listing in Explore is managed instead of saved or reported',()=>{
 const card=renderCard(7,7);
 assert.match(card,/data-manage="24"/);
 assert.doesNotMatch(card,/data-fav=/);
 assert.doesNotMatch(card,/data-report=/);
});
test('A listing owned by someone else keeps favorite and report actions',()=>{
 const card=renderCard(11,7);
 assert.match(card,/data-fav="24"/);
 assert.match(card,/data-report="24"/);
 assert.doesNotMatch(card,/data-manage=/);
});
test('My listings retain edit and deletion actions',()=>{
 const card=renderCard(7,7,'mine');
 assert.match(card,/data-edit="24"/);
 assert.match(card,/data-delete="24"/);
 assert.doesNotMatch(card,/data-fav=/);
});
test('Discovery filters are hidden in personal tabs and empty states have CTAs',()=>{
 assert.match(source,/\.tabs,\.market-deals/);
 assert.match(source,/data-empty-create/);
 assert.match(source,/data-empty-explore/);
 assert.match(source,/data-empty-clear/);
 assert.match(source,/data-manage/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.tabs\{display:grid;grid-template-columns:repeat\(2/);
 assert.match(seo,/Todavía no hay anuncios públicos/);
});
test('Version and cache invalidation stay aligned',()=>{
 assert.equal(require('../package.json').version,'3.2.71');
 assert.match(fs.readFileSync('server.js','utf8'),/APP_VERSION='3\.2\.69\.1'/);
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.69\.1/);
 assert.match(html,/marketplace-v3250\.css\?v=3\.2\.69\.1/);
 assert.match(seo,/marketplace-share-v3254\.js\?v=3\.2\.63\.2/);
});
