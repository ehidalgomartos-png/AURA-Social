'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {csvRecords,parseProduct}=require('../src/services/marketplace-woocommerce-csv-v3260');
const read=p=>fs.readFileSync(p,'utf8');
const row=(sep=';',preamble='')=>preamble+['ID','Tipo','SKU','Nombre del producto','Publicado','Descripción','Precio normal','Imágenes'].join(sep)+'\r\n'
 +['10','simple','TC-10','Taza Stitch Navideño','1','Taza personalizada de cerámica perfecta como regalo navideño','15.99','https://example.com/taza.jpg'].join(sep);
test('CSV WooCommerce supports direct export in comma, semicolon, pipe and tab layouts',()=>{
 for(const sep of [',',';','|','\t']){
  const imported=csvRecords(row(sep));
  assert.equal(imported.length,1);
  const prod=parseProduct(imported[0],{city:'Valencia',saleScope:'national'});
  assert.equal(prod.title,'Taza Stitch Navideño');
  assert.equal(prod.state,'pending');
  assert.equal(prod.priceCents,1599);
  assert.equal(prod.listing.details.saleScope,'national');
 }
});
test('UTF-8 BOM and spreadsheet sep preambles are handled safely',()=>{
 const a=csvRecords('\uFEFF'+row(';','sep=;\r\n'));
 assert.equal(a[0].cells[2],'TC-10');
 const b=csvRecords('sep=,\n'+row(','));
 assert.equal(b[0].cells[3],'Taza Stitch Navideño');
});
test('True one-column data gives precise unsupported-header diagnostic',()=>{
 assert.throws(()=>csvRecords('solo una columna\nproducto'),/csv_invalid_header/);
 assert.throws(()=>csvRecords('ID,SKU,Precio\n1,AB,15'),/csv_not_woocommerce/);
 assert.throws(()=>csvRecords('ID\u0000,\u0000Nombre'),/csv_invalid_encoding/);
});
test('Importer can detect UTF-16 exports, retains preview-and-confirm safeguards',()=>{
 const client=read('public/marketplace-import-v3260.js');
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.match(client,/file\.arrayBuffer\(\)/);
 assert.match(client,/utf-16le/);
 assert.match(client,/utf-16be/);
 assert.match(client,/csv_invalid_header/);
 assert.match(client,/\/preview/);
 assert.match(client,/confirmRights/);
 const page=read('public/marketplace.html');
 assert.doesNotMatch(page,/href="\/marketplace\/google"/);
 assert.match(page,/href="\/marketplace\/importar"/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.75');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.75'/);
});
