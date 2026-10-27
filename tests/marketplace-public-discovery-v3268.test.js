'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const db=require('../src/db'),seo=require('../src/routes/marketplace-seo-v3251');
const {catalogLocation,publicLocation,nationalSale}=require('../src/services/marketplace-coverage-v3261');
const read=file=>fs.readFileSync(file,'utf8');
const publicRoute=seo.router.stack.find(layer=>layer.route?.path==='/marketplace/explorar')?.route.stack[0].handle;
const sample={
 id:40,title:'Armario Turin',kind:'product',deal:'sale',city:'Valencia',
 category:'Hogar y muebles',details:{province:'Comunidad Valenciana',saleScope:'national'},
 image_urls:['/uploads/armario.jpg'],price_cents:23500,
 description:'Armario para organizar el hogar, con tres puertas y cajones.',
 seller_username:'muebles',seller_name:'Muebles',status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-15T17:00:00Z',updated_at:'2026-10-15T17:00:00Z'
};
function response(){
 return {statusCode:200,html:'',setHeader(){return this;},type(){return this;},
  status(n){this.statusCode=n;return this;},send(html){this.html=html;return this;}};
}
async function render(query,categories=['Hogar y muebles','Tazas'],rows=[sample]){
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('SELECT MIN(BTRIM(l.category))'))return {rows:categories.map(category=>({category})),rowCount:categories.length};
  if(sql.includes('SELECT l.id,l.title,l.kind,l.deal'))return {rows,rowCount:rows.length};
  return {rows:[],rowCount:0};
 };
 const out=response();
 try{await publicRoute({query},out,error=>{throw error;});}
 finally{db.query=original;}
 return {out,calls,query:calls.find(x=>x.sql.includes('SELECT l.id,l.title,l.kind,l.deal'))};
}
test('public category list and offers derive only from visible published listings',async()=>{
 const {out,calls}=await render({});
 assert.equal(out.statusCode,200);
 assert.match(out.html,/market-public-quick/);
 assert.match(out.html,/Todas las categorías/);
 assert.match(out.html,/Hogar y muebles/);
 assert.match(out.html,/Venta en toda España/);
 assert.match(out.html,/market-seo-cardlink/);
 const categories=calls.find(c=>c.sql.includes('SELECT MIN(BTRIM(l.category))'));
 assert.match(categories.sql,/l.status='active'/);
 assert.match(categories.sql,/l.moderation_status='published'/);
 assert.match(categories.sql,/u.discoverable=true/);
 assert.match(categories.sql,/LIMIT 150/);
});
test('category and maximum price use parameters and filtered pages are noindex',async()=>{
 const {out,query}=await render({categoria:'Tazas',precio_max:'250,50',q:'regalo',orden:'price_asc'});
 assert.match(out.html,/name="categoria"/);
 assert.match(out.html,/value="Tazas" selected/);
 assert.match(out.html,/name="precio_max"/);
 assert.match(out.html,/noindex,follow/);
 assert.match(out.html,/Categoría: Tazas/);
 assert.match(query.sql,/LOWER\(BTRIM\(l.category\)\)=LOWER\(\$6\)/);
 assert.match(query.sql,/l.price_cents<=\$8/);
 assert.match(query.sql,/ORDER BY l.price_cents ASC,l.id DESC LIMIT 25 OFFSET \$5/);
 assert.equal(query.args[5],'Tazas');
 assert.equal(query.args[7],25050);
 assert.ok(!query.sql.includes('regalo'));
});
test('nationwide search is restricted to products for sale while seller city stays separate',async()=>{
 const {out,query}=await render({nacional:'1',tipo:'product',operacion:'sale'});
 assert.equal(query.args[6],true);
 assert.match(query.sql,/l.kind='product' AND l.deal='sale'/);
 assert.match(query.sql,/l.details->>'saleScope'='national'/);
 assert.match(query.sql,/COALESCE\(l.details->>'saleScope',''\)=''/);
 assert.match(out.html,/nacional=1/);
 assert.match(out.html,/Venta disponible en toda España/);
 assert.match(out.html,/noindex,follow/);
 assert.equal(nationalSale(sample),true);
});
test('pagination retains filters and active buttons without exposing raw HTML',async()=>{
 const rows=Array.from({length:25},(_,i)=>({...sample,id:i+1,title:'Armario de madera'}));
 const {out}=await render({categoria:'Hogar y muebles',precio_max:'500',pagina:'2',q:'armario'},['Hogar y muebles'],rows);
 assert.match(out.html,/Siguientes →/);
 assert.match(out.html,/pagina=3/);
 assert.match(out.html,/categoria=Hogar\+y\+muebles/);
 assert.match(out.html,/precio_max=500/);
 assert.match(out.html,/q=armario/);
 assert.match(out.html,/Anteriores/);
 const injected=await render({categoria:'<img src=x onerror=alert(1)>'},[]);
 assert.doesNotMatch(injected.out.html,/<img src=x onerror=alert\(1\)>/);
 assert.match(injected.out.html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});
test('catalogue uses compact origin while detail keeps its full location',()=>{
 const local={...sample,details:{province:'Comunidad Valenciana',saleScope:'local'}};
 assert.equal(catalogLocation(local),'Valencia');
 assert.equal(publicLocation(local),'Valencia · Comunidad Valenciana · Venta en la zona indicada');
 assert.equal(catalogLocation(sample),'Venta disponible en toda España');
 const detail=seo.listingHtml(local);
 assert.match(detail,/Comunidad Valenciana/);
 assert.match(detail,/Consultar al vendedor/);
 assert.match(detail,/application\/ld\+json/);
});
test('invalid maximum price is ignored safely and no category is invented',async()=>{
 const {out,query}=await render({precio_max:'-1',orden:'evil'},[]);
 assert.equal(query.args[7],null);
 assert.match(query.sql,/ORDER BY l.created_at DESC,l.id DESC/);
 assert.doesNotMatch(out.html,/NaN/);
 const styles=read('public/marketplace-seo-v3251.css');
 assert.match(styles,/\.market-public-quick/);
 assert.match(styles,/\.market-public-quick a\{[^}]*min-height:44px/);
 assert.match(styles,/\.market-public-grid \.thumb img\{[^}]*object-fit:contain/);
});
test('release version, public cache, PWA and seller tools remain aligned',()=>{
 // Runtime release version follows package.json; historical asset versions stay intact.
 const version=JSON.parse(read('package.json')).version;
 assert.ok(/^\d+\.\d+\.\d+$/.test(version));
 assert.ok(read('server.js').includes("APP_VERSION='"+version+"'"));
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-seo-v3251\.css\?v=3\.2\.77\.8/);
 assert.match(read('public/marketplace.html'),/marketplace-v3250\.js\?v=3\.2\.77\.3/);
 assert.match(read('public/marketplace.html'),/marketSellerTools/);
 assert.match(read('public/marketplace.html'),/marketplace\/importar/);
 assert.match(read('public/manifest.webmanifest'),/"id": "\/app"/);
});
