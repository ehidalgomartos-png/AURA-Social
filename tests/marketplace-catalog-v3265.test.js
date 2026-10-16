'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('public/marketplace-v3250.js'),html=read('public/marketplace.html'),css=read('public/marketplace-v3250.css');
function extract(start,end){const a=js.indexOf(start),b=js.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return js.slice(a,b);}
const code=extract('function safeListingPhotos(item){','function marketSpain(v){')+extract('function card(item){','function emptyMarketplaceState(){');
function render(item){
 const ctx={state:{mode:'discover'},window:{currentUserId:77},esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 marketNational:x=>x.kind==='product'&&x.deal==='sale'&&x.details?.saleScope==='national',
 marketDisplayLocation:x=>x.city+' · Venta en toda España',
 slugifyMarket:x=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,'-'),
 priceLabel:x=>(x.price_cents/100).toFixed(2)+' €',isRecentListing:()=>false,label:{active:'Activo'}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.card(item);
}
const row={id:45,kind:'product',deal:'sale',title:'Armario Sara Blanco',price_cents:34500,
 details:{brand:'Marca Real',condition:'new',saleScope:'national'},city:'Valencia',
 status:'active',moderation_status:'published',seller_discoverable:true,seller_username:'muebles',
 seller_name:'Muebles',seller_id:999,image_urls:['/uploads/armario1.webp','/uploads/armario2.jpg']};
test('cards keep SEO product links, real photo counts and brand/condition/coverage',()=>{
 const out=render(row);
 assert.match(out,/href="\/marketplace\/p\/45\/armario-sara-blanco"/);
 assert.match(out,/aria-label="2 fotografías"/);
 assert.match(out,/2 fotos/);
 assert.match(out,/Marca Real · Nuevo · Venta en toda España/);
 assert.match(out,/alt="Armario Sara Blanco"/);
 assert.match(out,/loading="lazy"/);
 assert.doesNotMatch(out,/WooCommerce|tienda WooCommerce/);
});
test('untrusted photo URLs are excluded from card source attributes',()=>{
 const out=render({...row,image_urls:['https://example.invalid/a.jpg','/uploads/good.jpg','javascript:alert(1)']});
 assert.match(out,/src="\/uploads\/good.jpg"/);
 assert.doesNotMatch(out,/example\.invalid|javascript:/);
 assert.doesNotMatch(out,/market-photo-count/);
});
test('paused listing never makes its photo a public SEO link',()=>{
 const out=render({...row,status:'paused'});
 assert.doesNotMatch(out,/market-photo-link/);
 assert.match(out,/data-open="45"/);
});
test('nationwide quick filter is handled by backend and preserves origin',()=>{
 const api=read('src/routes/marketplace-v3250.js');
 assert.match(api,/req\.query\.saleScope==='national'/);
 assert.match(api,/l\.details->>'saleScope'='national'/);
 assert.match(api,/l\.kind='product' AND l\.deal='sale'/);
 assert.match(api,/LOWER\(l\.city\)/);
 assert.match(js,/saleScope:state\.nationalOnly\?'national':''/);
 assert.match(js,/state\.kind='product';state\.deal='sale';state\.nationalOnly=true/);
 assert.match(js,/state\.nationalOnly=false/);
 assert.match(html,/data-market-quick="national"/);
 assert.match(html,/id="marketAppliedFilters"/);
});
test('quick filter buttons really update the state and do not repeat the single-element selector bug',()=>{
 const snippet=extract('function updateQuickFiltersV3265(){','function setDeal(d){');
 const state={kind:'',deal:'',nationalOnly:false};
 const make=(dataset)=>({dataset,classList:{active:false,toggle(_c,on){this.active=on;}},setAttribute(key,value){this[key]=value;}});
 const shortcuts=['all','products','national'].map(marketQuick=>make({marketQuick}));
 const kinds=['','product','service','property'].map(kind=>make({kind}));
 const deals=['','sale','buy','offer'].map(deal=>make({deal}));
 let resets=0,loads=0;
 const form={reset(){resets++;}};
 const notice={textContent:''};
 const ctx={state,$:id=>id==='#filters'?form:id==='#marketAppliedFilters'?notice:null,
  $$:id=>id==='[data-market-quick]'?shortcuts:id==='[data-kind]'?kinds:id==='[data-deal]'?deals:[],
  FormData:class{get(){return '';}},load(){loads++;},Set};
 vm.createContext(ctx);vm.runInContext(snippet,ctx);
 ctx.quickFilterV3265('national');
 assert.equal(state.kind,'product');assert.equal(state.deal,'sale');assert.equal(state.nationalOnly,true);
 assert.equal(shortcuts[2].classList.active,true);assert.match(notice.textContent,/Toda España/);
 ctx.quickFilterV3265('products');
 assert.equal(state.deal,'');assert.equal(state.nationalOnly,false);assert.equal(shortcuts[1].classList.active,true);
 ctx.quickFilterV3265('all');
 assert.equal(state.kind,'');assert.equal(resets,1);assert.equal(loads,3);
 assert.equal(shortcuts[0].classList.active,true);
});
test('mobile accessible controls and cache-busting release are aligned',()=>{
 assert.match(css,/\.market-catalog-card \.thumb\{position:relative;aspect-ratio:4\/3/);
 assert.match(css,/\.market-catalog-shortcuts button\{flex:none;min-height:44px/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(html,/marketplace-v3250\.css\?v=3\.2\.73/);
 assert.match(html,/marketplace-v3250\.js\?v=3\.2\.73/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.73');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.73'/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
