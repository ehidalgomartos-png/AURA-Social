'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const meta=require('../src/services/marketplace-product-meta-v32118');
const seo=require('../src/routes/marketplace-seo-v3251');
const base={
 id:118,title:'Armario Turín 3 Puertas 2 Cajones - Blanco',
 description:'Armario de tres puertas con cajones, acabado blanco y amplio espacio de almacenaje.',
 kind:'product',deal:'sale',category:'Armarios Puertas Batientes',
 city:'Valencia',price_cents:23500,
 details:{condition:'new',province:'Valencia',saleScope:'national'},
 image_urls:['/uploads/public-118.webp'],seller_username:'vendedor',seller_name:'Vendedor público',
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 created_at:'2026-10-15T10:00:00.000Z',updated_at:'2026-10-18T10:00:00.000Z'
};
function head(html){return html.split('</head>')[0];}
function metaContent(html,name){
 const match=head(html).match(new RegExp('<meta name="'+name+'" content="([^"]*)"'));
 return match?.[1]||'';
}
test('real WooCommerce armario offers distinct, concise Spanish SEO metadata',()=>{
 const result=meta.forListing(base);
 assert.ok(result);
 assert.match(result.title,/Armario Turín/);
 assert.match(result.title,/Valencia/);
 assert.match(result.title,/RedLibertad/);
 assert.ok(result.title.length<=meta.TITLE_LIMIT);
 assert.match(result.description,/Armario Turín/);
 assert.match(result.description,/235,00/);
 assert.match(result.description,/Nuevo\./);
 assert.match(result.description,/Valencia/);
 assert.match(result.description,/contacta con el vendedor/);
 assert.ok(result.description.length<=meta.DESCRIPTION_LIMIT);
 assert.doesNotMatch(result.description,/envío gratis|en stock garantizado|pago en RedLibertad|Milanuncios|Wallapop/i);
 const legacy=meta.forListing({...base,description:'Armario funcional. WhatsAppFacebookTwitter'});
 assert.doesNotMatch(legacy.description,/WhatsAppFacebookTwitter/);
 const html=seo.listingHtml(base);
 assert.match(head(html),/Armario Turín/);
 assert.equal(metaContent(html,'description'),result.description);
 assert.match(head(html),/rel="canonical" href="https:\/\/redlibertad\.com\/marketplace\/p\/118\/armario-turin-3-puertas-2-cajones-blanco"/);
 assert.match(head(html),/og:description/);
 assert.match(html,/marketplace\/imagen\/118\/0/);
 assert.match(html,/Consultar al vendedor/);
});
test('country-wide sales with unknown origin must not invent Valencia, delivery promises or shipping',()=>{
 const row={...base,city:'España',details:{province:'España',saleScope:'national'}};
 const result=meta.forListing(row);
 assert.match(result.title,/España/);
 assert.match(result.description,/Venta anunciada para España/);
 assert.doesNotMatch(result.title+' '+result.description,/Valencia|envío incluido|entrega gratuita|compra segura/i);
});
test('new, used and unspecified conditions differ without fabricating product state',()=>{
 const used=meta.forListing({...base,details:{condition:'used'}});
 assert.match(used.description,/Usado/);
 assert.doesNotMatch(used.description,/Nuevo\./);
 const unknown=meta.forListing({...base,details:{}});
 assert.doesNotMatch(unknown.description,/\bNuevo\b|\bUsado\b/);
 const external=meta.forListing(base,{externalPurchase:true});
 assert.match(external.description,/Compra en la web del vendedor/);
 assert.doesNotMatch(external.description,/pagar en RedLibertad/);
 const original=seo.entitySchema(base,'https://redlibertad.com'+seo.listingPath(base),seo.imagePaths(base));
 assert.equal(original.offers.price,'235.00');
 assert.equal(original.offers.itemCondition,'https://schema.org/NewCondition');
});
test('seller long text is sanitized and limited, with no metadata XSS injection',()=>{
 const input={...base,title:'<img src=x onerror=alert(1)> Armario   con  cajones',
   description:'<script>alert(1)</script> Armario de tres puertas, '.repeat(20)};
 const result=meta.forListing(input);
 assert.ok(result.title.length<=78);
 assert.ok(result.description.length<=160);
 assert.doesNotMatch(result.title+' '+result.description,/<script|<img|onerror=/i);
 const html=seo.listingHtml(input);
 assert.doesNotMatch(head(html),/<img src=x|<script>alert\(1\)<\/script>/);
 assert.match(html,/application\/ld\+json/);
});
test('unknown or invalid price cannot lead to invented amounts',()=>{
 for(const value of ['not a price',-50,Number.POSITIVE_INFINITY,null]){
  const description=meta.forListing({...base,price_cents:value})?.description;
  if(value===null){
   // Null/0 is a legitimate 0-cent numeric field; preserve existing semantics.
   assert.match(description,/0,00/);
  }else{
   assert.doesNotMatch(description,/—\s*(?:NaN|Infinity|-0,50)/);
  }
 }
});
test('service, wanted and real-estate metadata remain unchanged',()=>{
 for(const row of [
  {...base,kind:'service',deal:'offer'},
  {...base,kind:'property',deal:'rent'},
  {...base,deal:'buy'}
 ]){
  assert.equal(meta.forListing(row),null);
  const html=seo.listingHtml(row);
  assert.match(head(html),/RedLibertad Marketplace/);
  assert.match(html,/application\/ld\+json/);
 }
});
test('small factual helper is wired only to public product detail SSR',()=>{
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.match(source,/marketplaceProductMetaV32118\.forListing\(row,\{externalPurchase:Boolean\(verifiedPurchaseUrl\)\}\)/);
 assert.match(source,/title:improvedProductMeta\?\.title\|\|/);
 assert.match(source,/description:improvedProductMeta\?\.description\|\|/);
 assert.match(source,/if\(!eligible\(row\)\)return unavailable/);
 assert.match(source,/if\(req\.path!==listingPath\(row\)\)/);
 assert.match(source,/schema:structuredData\(row,url,images,qualifiedCategory\)/);
 assert.doesNotMatch(fs.readFileSync('src/services/marketplace-product-meta-v32118.js','utf8'),/\bINSERT\b|\bUPDATE\b|\bDELETE\b|Stripe|sk_live_/);
});
