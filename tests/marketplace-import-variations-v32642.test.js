'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const db=require('../src/db');
const {csvRecords,parseProduct,indexVariationParents}=require('../src/services/marketplace-woocommerce-csv-v3260');
const routes=require('../src/routes/marketplace-import-v3260');
const {listingInput}=require('../src/routes/marketplace-v3250');
const sample=[
 'ID,Type,SKU,Name,Parent,Published,In stock?,Description,Regular price,Categories,Images,GTIN',
 '500,variable,SARA,"Armario 4 Puertas Sara",,1,1,"Armario de cuatro puertas modelo Sara; selecciona el acabado que prefieras.",,Muebles,https://example.com/sara.jpg,4006381333931',
 '501,variation,SARA-PINA,"Armario 4 Puertas Sara - Piña Trufa",id:500,1,1,,345,,,',
 '502,variation,SARA-BLANCO,"Armario 4 Puertas Sara - Cambria Blanco",id:500,1,1,"Armario de cuatro puertas con acabado Cambria Blanco.",359,,https://example.com/blanco.jpg,',
 '503,variation,SARA-ORPHAN,"Armario sin padre - Acabado X",id:999,1,1,,379,,https://example.com/missing.jpg,',
 '504,simple,OTRO,"Mueble auxiliar",,1,1,"Producto auxiliar publicado con descripción real suficiente.",49.99,Otros,https://example.com/aux.jpg,'
].join('\n');
const opts={city:'Valencia',province:'Valencia',saleScope:'national'};
function read(p){return fs.readFileSync(p,'utf8');}
function rows(){const records=csvRecords(sample),parents=indexVariationParents(records);return records.map(r=>parseProduct(r,opts,parents));}
test('Variable parents are metadata-only; variants have distinct keys, stock and prices',()=>{
 const [parent,first,second,orphan,simple]=rows();
 assert.equal(parent.state,'skipped');
 assert.equal(parent.listing,null);
 assert.equal(first.state,'pending');
 assert.equal(first.key,'sku:sara-pina');
 assert.equal(first.priceCents,34500);
 assert.equal(first.listing.details.saleScope,'national');
 assert.equal(first.listing.category,'Muebles');
 assert.equal(first.listing.description.length>=25,true);
 assert.equal(second.state,'pending');
 assert.equal(second.priceCents,35900);
 assert.equal(second.key,'sku:sara-blanco');
 assert.equal(orphan.state,'invalid');
 assert.match(orphan.error,/variaciones sin su producto padre/);
 assert.equal(simple.state,'pending');
 assert.ok(listingInput.safeParse(first.listing).success);
 assert.ok(listingInput.safeParse(second.listing).success);
});
test('Only missing images fall back to parent image, with explicit warning',()=>{
 const [parent,a,b]=rows();
 assert.equal(a.urls[0],'https://example.com/sara.jpg');
 assert.match(a.warnings.join(' '),/Fotografía heredada/);
 assert.deepEqual(b.urls,['https://example.com/blanco.jpg']);
 assert.deepEqual(b.warnings,[]);
 const records=csvRecords(sample);
 records[0].cells[records[0].columns.indexOf('images')]='';
 const parents=indexVariationParents(records);
 const v=parseProduct(records[1],opts,parents);
 assert.equal(v.state,'invalid');
 assert.match(v.error,/imagen HTTPS/);
});
test('Manufacturer GTIN of parent is not copied to variation with its own identity',()=>{
 const [,one]=rows();
 assert.equal(one.listing.details.gtin,undefined);
});
test('A parent referenced by SKU and a parent written after its variants both work',()=>{
 const csv=[
  'ID,Type,SKU,Name,Parent,Published,In stock?,Description,Regular price,Categories,Images',
  '601,variation,V-1,"Armario 4 Puertas Sara - Blanco",sku:SARA,1,1,,345,,,',
  '600,variable,SARA,"Armario 4 Puertas Sara",,1,1,"Armario de cuatro puertas de la línea Sara, varios acabados.",,Muebles,https://example.com/p.jpg'
 ].join('\n');
 const records=csvRecords(csv),result=parseProduct(records[0],opts,indexVariationParents(records));
 assert.equal(result.state,'pending');
 assert.equal(result.priceCents,34500);
 assert.equal(result.urls.length,1);
});
test('Preview never writes listings or duplicates the parent, and counts inherited-image acknowledgments',async()=>{
 const saved=db.query,queries=[];
 db.query=async(sql,args)=>{queries.push({sql,args});if(sql.includes('SELECT source_key FROM marketplace_import_links'))return {rowCount:0,rows:[]};return {rowCount:1,rows:[]};};
 const fn=routes.router.stack.find(x=>x.route?.path==='/preview')?.route.stack.at(-1)?.handle;
 const res={statusCode:200,status(x){this.statusCode=x;return this;},json(x){this.body=x;return this;}};
 try{
  await fn({user:{id:7},body:{csv:sample,options:opts}},res,(e)=>{throw e;});
  assert.equal(res.statusCode,201);
  assert.equal(res.body.summary.skipped,1);
  assert.equal(res.body.summary.inheritedPhotos,1);
  assert.equal(res.body.summary.pending,3);
  assert.equal(res.body.summary.invalid,1);
  assert.equal(res.body.items[1].state,'pending');
  assert.match(res.body.items[1].warnings[0],/heredada/);
  assert.equal(queries.filter(x=>/INSERT INTO marketplace_listings/.test(x.sql)).length,0);
  const batch=queries.find(x=>/INSERT INTO marketplace_import_batches/.test(x.sql));
  assert.ok(batch);
  const items=JSON.parse(batch.args[2]);
  assert.ok(items.find(x=>x.state==='skipped'&&!x.listing));
 }finally{db.query=saved;}
});
test('Acknowledgment for photos is checked again by the server before importing',()=>{
 const server=read('src/routes/marketplace-import-v3260.js');
 const client=read('public/marketplace-import-v3260.js');
 const html=read('public/marketplace-import-v3260.html');
 assert.match(server,/inheritedPhotos>0&&req\.body\?\.ackInheritedPhotos!==true/);
 assert.match(client,/confirmVariantPhotos/);
 assert.match(html,/id="confirmVariantPhotos"/);
 assert.match(client,/Padre omitido/);
 assert.match(server,/ON CONFLICT DO NOTHING/);
 assert.match(server,/marketplace_import_links/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.70.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.70\.1'/);
});
