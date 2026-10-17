'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const seo=require('../src/routes/marketplace-seo-v3251');
const {purchaseLink}=require('../src/services/marketplace-professional-v3276');
const item={
 id:8,title:'Taza Merry Christmas',description:'Taza Merry Christmas con muñeco de nieve.',
 category:'Navidad',kind:'product',deal:'sale',city:'Valencia',
 price_cents:1599,details:{saleScope:'national'},image_urls:['/uploads/marketplace-test.jpg'],
 seller_username:'mundotaza',seller_name:'MundoTaza',seller_status:'active',
 seller_discoverable:true,status:'active',moderation_status:'published',
 created_at:'2026-10-15T09:00:00.000Z',updated_at:'2026-10-17T09:00:00.000Z',
 store_url:'https://mundotaza.com/',store_status:'approved',purchase_enabled:true,
 external_product_url:'https://mundotaza.com/producto/taza-merry-christmas/',
 external_stock_status:'in_stock',external_source:'api',external_checked_at:new Date().toISOString()
};
test('approved synced product shows external Woo checkout action, original chat and price',()=>{
 assert.equal(purchaseLink(item),item.external_product_url);
 const html=seo.listingHtml(item);
 assert.match(html,/15,99/);
 assert.match(html,/Taza Merry Christmas/);
 assert.match(html,/src="https:\/\/redlibertad\.com\/marketplace\/imagen\/8\/0"/);
 assert.equal(html.split('href="'+item.external_product_url+'"').length-1,2);
 assert.match(html,/market-product-offer-actions-v32778/);
 assert.match(html,/class="primary market-product-buy-v32778"/);
 assert.match(html,/class="market-mobile-buy-v32778"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer">Comprar en la tienda/);
 assert.match(html,/class="secondary market-product-contact market-product-chat-v32778"/);
 assert.match(html,/Comprarás y pagarás en la web del vendedor/);
 assert.match(html,/RedLibertad no gestiona pagos ni envíos/);
 assert.equal((html.match(/Consultar al vendedor →/g)||[]).length,1);
 assert.match(html,/\/marketplace\?contact=mundotaza&amp;listing=8/);
 assert.match(html,/rel="canonical"/);
});
test('pending, inactive, no stock, untrusted domain and stale Woo data hide purchase CTA',()=>{
 const failureCases=[
 {store_status:'pending'},{store_status:'draft'},{store_status:'suspended'},
 {purchase_enabled:false},{external_stock_status:'out_of_stock'},
 {external_stock_status:'unknown'},{external_checked_at:new Date(Date.now()-50*3600*1000).toISOString()},
 {external_checked_at:null},{external_product_url:'https://elsewhere.example/product/mug'},
 {external_product_url:'https://mundotaza.com.evil.test/product/mug'},
 {external_product_url:'http://mundotaza.com/product/mug'},
 {external_product_url:'https://mundotaza.com@evil.test/product/mug'},
 {status:'paused'},{moderation_status:'hidden'},{kind:'service'},
 {deal:'buy'}
 ];
 for(const change of failureCases){
  const row={...item,...change};
  const html=seo.listingHtml(row);
  assert.equal(purchaseLink(row),null,JSON.stringify(change));
  assert.doesNotMatch(html,/Comprar en la tienda ↗/,JSON.stringify(change));
  assert.doesNotMatch(html,/market-product-buy-v32778/,JSON.stringify(change));
  assert.match(html,row.kind==='product'&&row.deal==='sale'?/Consultar al vendedor/:/Contactar con/);
 }
});
test('ordinary listings keep their original in-viewport and mobile chat CTAs',()=>{
 const unlinked={...item,store_status:null,purchase_enabled:false,external_source:null,
 external_product_url:null,external_stock_status:null,external_checked_at:null};
 const html=seo.listingHtml(unlinked);
 assert.equal((html.match(/Consultar al vendedor →/g)||[]).length,2);
 assert.match(html,/market-product-contact/);
 assert.doesNotMatch(html,/market-product-offer-actions-v32778/);
});
test('buy controls are server rendered, escaped and responsive without external redirect proxy',()=>{
 const route=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-v3251.css','utf8');
 assert.match(route,/const verifiedPurchaseUrl=purchaseLink\(row\)/);
 assert.match(route,/href="'\+esc\(verifiedPurchaseUrl\)/);
 assert.match(route,/const offerActions=verifiedPurchaseUrl/);
 assert.match(route,/const mobileAction=verifiedPurchaseUrl/);
 assert.match(route,/marketplace-seo-v3251\.css\?v=3\.2\.77\.8/);
 assert.match(css,/market-product-offer-actions-v32778/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/market-mobile-buy-v32778/);
 const hostile={...item,external_product_url:'https://evil.test/<script>'};
 assert.doesNotMatch(seo.listingHtml(hostile),/href="https:\/\/evil\.test/);
});
