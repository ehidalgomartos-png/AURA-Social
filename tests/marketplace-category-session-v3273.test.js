'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const seo=require('../src/routes/marketplace-seo-v3251'),db=require('../src/db');
const read=p=>fs.readFileSync(p,'utf8');
const listing={id:77,title:'Armario Turín',description:'Armario de madera con puertas y cajones para organizar el hogar.',kind:'product',deal:'sale',category:'Armarios Puertas Batientes',city:'Valencia',details:{province:'Comunidad Valenciana'},image_urls:['/uploads/armario.webp'],price_cents:23500,seller_username:'muebleselchollazo',seller_name:'Muebles El Chollazo',status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,created_at:'2026-10-15T09:00:00Z',updated_at:'2026-10-15T09:00:00Z'};
const route=seo.router.stack.find(x=>x.route?.path==='/marketplace/explorar').route.stack[0].handle;
async function render(published=[]){
 const original=db.query;
 db.query=async sql=>{
  if(sql.includes('SELECT MIN(BTRIM(l.category))'))return {rows:published.map(category=>({category})),rowCount:published.length};
  if(sql.includes('SELECT l.id,l.title,l.kind,l.deal'))return {rows:[listing],rowCount:1};
  return {rows:[],rowCount:0};
 };
 const res={setHeader(){return this;},type(){return this;},status(){return this;},send(html){this.html=html;return this;}};
 try{await route({query:{}},res,e=>{throw e;});}finally{db.query=original;}
 return res.html;
}
test('all key product, service, real-estate categories are listed even with zero published ads',async()=>{
 const html=await render(),selector=html.match(/<select name="categoria">([\s\S]*?)<\/select>/)?.[1]||'';
 for(const cat of ['Hogar y muebles','Moda y accesorios','Tecnología','Electrodomésticos','Deportes y ocio','Pisos','Garajes','Reformas y mantenimiento','Clases y formación'])assert.ok(selector.includes('>'+cat+'</option>'),cat);
 assert.match(html,/Algunas categorías todavía no tienen anuncios/);
});
test('existing WooCommerce category names stay visible, case-insensitive duplicates removed',async()=>{
 const html=await render(['Anime','Navidad','Armarios Puertas Batientes','Hogar y muebles','hogar y muebles']);
 const selector=html.match(/<select name="categoria">([\s\S]*?)<\/select>/)?.[1]||'';
 for(const cat of ['Anime','Navidad','Armarios Puertas Batientes'])assert.ok(selector.includes('>'+cat+'</option>'),cat);
 assert.equal((selector.match(/>Hogar y muebles<\/option>/g)||[]).length,1);
});
test('public listing initially hides member-only community post without hiding public share options',()=>{
 const html=seo.listingHtml(listing);
 assert.match(html,/class="market-community-link-v3269" data-market-community-share-v3273 hidden/);
 for(const label of ['Publicar en RedLibertad','Compartir desde el móvil','WhatsApp','Facebook','Copiar enlace'])assert.ok(html.includes(label));
});
function harness({status=401,user=null,error=false}={}){
 const link={hidden:true},calls=[];
 const ctx={URL,navigator:{},window:{prompt(){}},document:{querySelectorAll:()=>[link],addEventListener(){},getElementById:()=>({textContent:''})},
  fetch:async(path,options)=>{calls.push({path,options});if(error)throw Error('offline');return {ok:status===200,json:async()=>({user})};}};
 vm.runInNewContext(read('public/marketplace-share-v3254.js'),ctx);
 return {link,calls,check:()=>vm.runInNewContext('revealMarketplaceCommunityShareV3273()',ctx)};
}
test('guests, inactive users and network errors never reveal posting',async()=>{
 for(const v of [{status:401},{status:503},{status:200,user:null},{status:200,user:{id:1,status:'blocked'}},{error:true}]){const h=harness(v);await h.check();assert.equal(h.link.hidden,true);}
});
test('logged-in active user sees voluntary action only after authenticated fetch',async()=>{
 const h=harness({status:200,user:{id:7,status:'active'}});await h.check();
 assert.equal(h.link.hidden,false);
 assert.equal(h.calls.at(-1).path,'/api/auth/me');
 assert.equal(h.calls.at(-1).options.credentials,'same-origin');
 assert.equal(h.calls.at(-1).options.cache,'no-store');
});
test('cache keys, release metadata and hidden CSS remain aligned',()=>{
 assert.match(read('public/marketplace-seo-v3251.css'),/market-community-link-v3269\[hidden\]\{display:none!important\}/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-share-v3254\.js\?v=3\.2\.75/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.77');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.77'/);
});
