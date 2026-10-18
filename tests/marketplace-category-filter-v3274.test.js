'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const seo=require('../src/routes/marketplace-seo-v3251'),db=require('../src/db');
const read=p=>fs.readFileSync(p,'utf8');
const route=seo.router.stack.find(x=>x.route?.path==='/marketplace/explorar').route.stack[0].handle;
const record={id:77,title:'Armario Turín 3 Puertas',kind:'product',deal:'sale',category:'Armarios Puertas Batientes',city:'Valencia',details:{province:'Valencia',saleScope:'local'},price_cents:23500,image_urls:['/uploads/armario.webp'],created_at:'2026-10-16T08:00:00.000Z'};
async function render(query={},groups=[{category:'Anime',kind:'product'},{category:'Reformas y mantenimiento',kind:'service'},{category:'Casas',kind:'property'},{category:'Armarios Puertas Batientes',kind:'product'}]){
 const previous=db.query,calls=[];
 db.query=async (sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('SELECT MIN(BTRIM(l.category))'))return {rows:groups,rowCount:groups.length};
  if(sql.includes('SELECT l.id,l.title,l.kind,l.deal'))return {rows:[record],rowCount:1};
  return {rows:[],rowCount:0};
 };
 const response={html:'',setHeader(){return this;},type(){return this;},send(html){this.html=html;return this;}};
 try{await route({query},response,error=>{throw error;});}finally{db.query=previous;}
 return {html:response.html,calls};
}
function options(html){
 const select=html.match(/<select name="categoria">([\s\S]*?)<\/select>/)?.[1]||'';
 assert.ok(select,'category dropdown missing');
 return select;
}
test('public catalogue groups product, service and property presets, preserving imported category names',async()=>{
 const {html}=await render();
 const category=options(html);
 assert.match(category,/<optgroup label="Productos" data-market-kind-v3274="product">/);
 assert.match(category,/<optgroup label="Servicios" data-market-kind-v3274="service">/);
 assert.match(category,/<optgroup label="Inmobiliaria" data-market-kind-v3274="property">/);
 assert.match(category,/>Anime<\/option>/);
 assert.match(category,/>Armarios Puertas Batientes<\/option>/);
 assert.match(category,/>Casas<\/option>/);
 assert.match(category,/>Reformas y mantenimiento<\/option>/);
 assert.equal((category.match(/>Reformas y mantenimiento<\/option>/g)||[]).length,1);
});
test('category query stays tied to public, published, discoverable listings and their real kinds',async()=>{
 const {calls}=await render();
 const sql=calls.find(x=>x.sql.includes('SELECT MIN(BTRIM(l.category))')).sql;
 assert.match(sql,/l.kind AS kind/);
 assert.match(sql,/GROUP BY l.kind, LOWER\(BTRIM\(l.category\)\)/);
 assert.match(sql,/l.status='active'/);
 assert.match(sql,/l.moderation_status='published'/);
 assert.match(sql,/u.status='active'/);
 assert.match(sql,/u.discoverable=true/);
});
test('category selection, sorting, national sale, and noindex remain after filtering',async()=>{
 const {html,calls}=await render({tipo:'product',categoria:'Anime',orden:'price_asc',nacional:'1'});
 assert.match(html,/value="Anime" selected/);
 assert.match(html,/market-public-quick/);
 assert.match(html,/noindex,follow/);
 assert.match(html,/nacional=1/);
 const q=calls.find(x=>x.sql.includes('SELECT l.id,l.title,l.kind,l.deal'));
 assert.equal(q.args[5],'Anime');
 assert.equal(q.args[6],true);
 assert.match(q.sql,/ORDER BY l.price_cents ASC/);
});
test('untrusted categories are escaped; legacy selected URLs remain visible',async()=>{
 const evil='<img src=x onerror=alert(1)>';
 const {html}=await render({categoria:evil},[{kind:'product',category:evil}]);
 assert.doesNotMatch(html,/<img src=x onerror=/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(options(html),/value="&lt;img src=x onerror=alert\(1\)&gt;" selected/);
});
test('empty catalogue still has general categories without SQL data',async()=>{
 const {html}=await render({},[]);
 const cats=options(html);
 for(const label of ['Tecnología','Electrodomésticos','Pisos','Clases y formación'])assert.ok(cats.includes('>'+label+'</option>'),label);
});
test('client updates category optgroups on change, keeps valid choice and clears incompatible ones',()=>{
 const js=read('public/marketplace-category-filter-v3274.js');
 assert.doesNotThrow(()=>new vm.Script(js));
 const make=(tag,value,kind)=>({
  tagName:tag,value,
  getAttribute:key=>key==='data-market-kind-v3274'?kind:null,
  cloneNode(){return make(tag,value,kind);}
 });
 const defaultOption=make('OPTION','',null);
 const product=make('OPTGROUP',null,'product'),service=make('OPTGROUP',null,'service'),property=make('OPTGROUP',null,'property');
 product.options=[make('OPTION','Hogar y muebles',null)];
 service.options=[make('OPTION','Profesionales',null)];
 property.options=[make('OPTION','Pisos',null)];
 for(const n of [product,service,property])n.cloneNode=function(){const c=make('OPTGROUP',null,n.getAttribute('data-market-kind-v3274'));c.options=n.options.map(o=>o.cloneNode(true));c.cloneNode=n.cloneNode;return c;};
 const kind={value:'product',handlers:{},addEventListener(ev,fn){this.handlers[ev]=fn;}};
 const select={value:'Hogar y muebles',children:[defaultOption,product,service,property],options:[],
  replaceChildren(...elements){this.children=elements;this.options=elements.flatMap(e=>e.tagName==='OPTION'?[e]:e.options||[]);}
 };
 const form={querySelector:q=>q.includes('"tipo"')?kind:select};
 const context={document:{querySelector:()=>form},Array};
 vm.runInNewContext(js,context);
 assert.equal(select.children.length,2);
 assert.equal(select.value,'Hogar y muebles');
 kind.value='service';kind.handlers.change();
 assert.equal(select.children.length,2);
 assert.equal(select.children[1].getAttribute('data-market-kind-v3274'),'service');
 assert.equal(select.value,'');
 kind.value='';kind.handlers.change();
 assert.equal(select.children.length,4);
});
test('versioned public script, mobile style, main release and existing protected flows stay unchanged',()=>{
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/marketplace-category-filter-v3274\.js\?v=3\.2\.75/);
 assert.match(read('public/marketplace-seo-v3251.css'),/market-category-help-v3273/);
 assert.match(read('src/routes/marketplace-seo-v3251.js'),/data-market-community-share-v3273 hidden/);
});
