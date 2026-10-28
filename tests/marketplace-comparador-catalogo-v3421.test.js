'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/db');
const {enrichLocalOffers}=require('../src/services/marketplace-comparador-merchant-offers-v3421');
const compare=require('../src/routes/marketplace-comparador-v32132');
const listing={id:91,title:'iPhone 12 128 GB Negro',price_cents:15900,
 image_urls:['/uploads/imagen.jpg'],details:{condition:'used'},display_name:'Antonio',username:'antonio'};
const partner={listing_id:91,store_id:12,store_name:'Tienda Ejemplo',store_url:'https://ejemplo.es/',
 store_status:'approved',purchase_enabled:true,stock_status:'in_stock',source:'manual',
 product_url:'https://ejemplo.es/producto/iphone',last_checked_at:null};
test('catálogo aprobado conserva la imagen local y enlaza directamente al dominio de la tienda',()=>{
 const [offer]=enrichLocalOffers([listing],[partner]);
 assert.equal(offer.internal,true,'no se convierte en oferta externa de SEO o SerpApi');
 assert.equal(offer.partner_store,true);
 assert.equal(offer.shop,'Tienda Ejemplo');
 assert.equal(offer.price_cents,15900);
 assert.equal(offer.href,'https://ejemplo.es/producto/iphone');
 assert.equal(offer.image,'/marketplace/imagen/91/0');
 assert.equal(offer.condition,'Usado');
});
test('no se promociona tienda pendiente, suspendida, sin existencias, URL ajena o stock API caducado',()=>{
 for(const patch of [
  {store_status:'pending'},{store_status:'suspended'},{purchase_enabled:false},
  {stock_status:'unknown'},{stock_status:'out_of_stock'},
  {product_url:'https://otro-vendedor.es/iphone'},
  {source:'api',last_checked_at:'2020-01-01T00:00:00Z'}
 ]){
  const [offer]=enrichLocalOffers([listing],[{...partner,...patch}]);
  assert.equal(offer.partner_store,false,JSON.stringify(patch));
  assert.match(offer.href,/^\/marketplace\/p\/91\//);
  assert.equal(offer.shop,'RedLibertad · Antonio');
 }
});
test('comprador sin acceso a tienda aprobada mantiene anuncio local y nunca se duplica',()=>{
 const offers=enrichLocalOffers([listing],[{...partner,listing_id:92}]);
 assert.equal(offers.length,1);
 assert.equal(offers[0].partner_store,false);
});
test('integración consulta catálogo profesional aprobado sin búsquedas SerpApi',async()=>{
 const original=db.query,calls=[];
 try{
  db.query=async(sql,args=[])=>{
   calls.push(sql);
   if(sql.startsWith('SELECT l.id,l.title,l.price_cents,l.image_urls,l.details,u.display_name,u.username'))
    return {rowCount:1,rows:[listing]};
   if(sql.startsWith('SELECT x.listing_id,x.store_id,x.product_url'))
    return {rowCount:1,rows:[partner]};
   return {rowCount:0,rows:[]};
  };
  const offers=await compare.localOffers('iphone 12 128 GB');
  assert.equal(offers.length,1);
  assert.equal(offers[0].partner_store,true);
  assert.equal(offers[0].href,partner.product_url);
  assert.ok(calls.some(sql=>sql.includes("s.status='approved'")));
  assert.ok(!calls.some(sql=>/serpapi|google_product|api_key/i.test(sql)));
 }finally{db.query=original;}
});
