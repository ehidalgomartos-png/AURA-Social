'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const db=require('../src/db');
const {csvRecords,parseProduct,cents,MAX_CSV_BYTES}=require('../src/services/marketplace-woocommerce-csv-v3260');
const {safeHost,publicIPv4,sniff,MAX_IMAGE}=require('../src/services/marketplace-import-photos-v3260');
const importer=require('../src/routes/marketplace-import-v3260');
const marketplace=require('../src/routes/marketplace-v3250');
const read=p=>fs.readFileSync(p,'utf8');
const sample=[
 'ID,Type,SKU,Name,Published,In stock?,Description,Regular price,Sale price,Categories,Images',
 '101,simple,TZ-1,"Taza Regalo",1,1,"Taza personalizada de cerámica perfecta para regalo familiar.",19.99,15.99,"Tazas, Regalos","https://shop.example.com/p1.jpg"',
 '102,simple,TZ-2,"Taza Cumpleaños",1,1,"Taza bonita para cumpleaños de una persona especial.",18.50,,"Tazas, Eventos","https://shop.example.com/p2.jpg"'
].join('\n');
function route(p,method='post'){const r=importer.router.stack.find(x=>x.route?.path===p&&x.route?.methods[method]);return r?.route.stack.at(-1)?.handle;}
function res(){return {statusCode:200,body:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};}
test('V3.2.60 syntax, UI navigation, routes and release metadata',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.66');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.66'"));
 assert.doesNotThrow(()=>new vm.Script(read('public/marketplace-import-v3260.js')));
 assert.doesNotThrow(()=>new vm.Script(read('public/marketplace-v3250.js')));
 const html=read('public/marketplace-import-v3260.html');
 for(const term of ['type="file"','id="importCity"','id="previewList"','id="confirmRights"','id="bar"','id="pauseBtn"'])assert.ok(html.includes(term),term);
 assert.ok(read('public/marketplace.html').includes('href="/marketplace/importar"'));
 assert.ok(read('src/routes/marketplace-seo-v3251.js').includes("router.get('/marketplace/importar'"));
 assert.ok(read('src/routes/marketplace-v3250.js').includes("router.use('/import'"));
 assert.ok(marketplace.stack.some(x=>x.regexp?.test('/import/preview')));
});
test('WooCommerce CSV handles BOM, quoted multiline, semicolon locale and limits',()=>{
 const rows=csvRecords('\uFEFF'+sample);assert.equal(rows.length,2);
 assert.equal(rows[0].line,2);assert.equal(rows[0].cells[3],'Taza Regalo');
 const semicolon=[
  'ID;Tipo;SKU;Nombre;Publicado;Descripción;Precio normal;Imágenes',
  '1;simple;PR-1;"Taza',
  'Especial";1;"Taza especial para regalo de cumpleaños familiar";"15,99";"https://shop.example.com/image.jpg"'
 ].join('\n');
 const mapped=parseProduct(csvRecords(semicolon)[0],{city:'Valencia',province:'Valencia'});
 assert.equal(mapped.priceCents,1599);assert.equal(mapped.key,'sku:pr-1');
 assert.ok(mapped.title.includes('Especial'));assert.equal(mapped.listing.details.province,'Valencia');
 assert.equal(cents('1.299,00'),129900);assert.equal(cents('1,299.00'),129900);assert.equal(cents('15,99'),1599);
 assert.throws(()=>csvRecords('test'),/csv_invalid_header|csv_no_products/);
 assert.throws(()=>csvRecords('a'.repeat(MAX_CSV_BYTES+1)),/csv_too_large/);
});
test('Variants, unpublished listings, out-of-stock and missing photos are not imported',()=>{
 const lines=[
  'ID,Type,SKU,Name,Published,In stock?,Description,Regular price,Images',
  '101,variation,A-01,Child variation,1,1,Long descriptive content for an example,29.99,https://shop.example.com/a.jpg',
  '102,simple,A-02,Unpublished item,0,1,Long descriptive content for the product example,19.99,https://shop.example.com/b.jpg',
  '103,simple,A-03,Picture missing,1,1,Long descriptive content for the product example,15.99,',
  '104,simple,A-04,Out of stock item,1,0,Long descriptive content for the product example,15.99,https://shop.example.com/c.jpg'
 ].join('\n');
 const records=csvRecords(lines).map(row=>parseProduct(row,{city:'Valencia'}));
 assert.ok(records.every(x=>x.state==='invalid'));assert.ok(records[0].error.includes('variaciones'));assert.ok(records[2].error.includes('imagen'));
});
test('SSRF protection denies private hosts, credentials, non-HTTPS and reserved addresses',()=>{
 for(const bad of ['http://example.com/a.jpg','https://127.0.0.1/a.jpg','https://[::1]/a.jpg','https://localhost/a.jpg','https://metadata.google.internal/','https://admin:password@shop.com/a.jpg','https://shop.com:8443/a.jpg','https://shop.com@127.0.0.1/a.jpg'])
  assert.throws(()=>safeHost(bad),undefined,bad);
 assert.equal(safeHost('https://cdn.shop.example.com/photos/taza.jpg').hostname,'cdn.shop.example.com');
 for(const addr of ['127.0.0.1','10.10.1.3','192.168.1.25','169.254.169.254','172.16.0.2','100.64.1.2','198.18.1.3','203.0.113.1','0.0.0.0','224.0.0.1'])assert.equal(publicIPv4(addr),false,addr);
 assert.equal(publicIPv4('1.1.1.1'),true);assert.ok(MAX_IMAGE<=5*1024*1024);
 assert.equal(sniff(Buffer.from([255,216,255,0,0])),'.jpg');assert.throws(()=>sniff(Buffer.from('<html>not image</html>')),/image_unsupported_format/);
});
test('Preview persists private draft, without creating marketplace listings',async()=>{
 const original=db.query,queries=[];
 db.query=async(sql,args)=>{queries.push({sql,args});if(sql.includes('SELECT source_key FROM marketplace_import_links'))return {rows:[]};return {rowCount:1,rows:[]};};
 try{
  const fn=route('/preview');assert.equal(typeof fn,'function');const out=res();
  await fn({user:{id:35},body:{csv:sample,options:{city:'Valencia',province:'Valencia'}}},out,e=>{throw e;});
  assert.equal(out.statusCode,201);assert.equal(out.body.ok,true);assert.equal(out.body.summary.total,2);
  assert.equal(out.body.summary.pending,2);assert.equal(out.body.items[0].photos,1);
  const stored=queries.find(x=>x.sql.startsWith('INSERT INTO marketplace_import_batches'));assert.ok(stored);assert.equal(stored.args[1],35);
  assert.ok(!queries.some(x=>x.sql.includes('INSERT INTO marketplace_listings')));
  assert.ok(stored.args[2].includes('sku:tz-1'));
 }finally{db.query=original;}
});
test('Confirmation and import steps are owner scoped, serialized and idempotent',()=>{
 const s=read('src/routes/marketplace-import-v3260.js');
 assert.ok(s.includes('WHERE id=$1 AND seller_id=$2 FOR UPDATE'));assert.ok(s.includes('if(!b.confirmed)'));
 assert.ok(s.includes("items.find(x=>x.state==='pending')"));assert.ok(s.includes('marketplace_import_links'));
 assert.ok(s.includes('ON CONFLICT DO NOTHING'));assert.ok(s.includes('await saveImages(item.urls)'));
 assert.ok(s.includes('await eraseFiles(files)'));assert.ok(s.includes("item.state='failed'"));
 assert.ok(s.includes("await client.query('COMMIT')"));
 const js=read('public/marketplace-import-v3260.js');assert.ok(js.includes('state.running=true'));assert.ok(js.includes('confirmRights'));
});
