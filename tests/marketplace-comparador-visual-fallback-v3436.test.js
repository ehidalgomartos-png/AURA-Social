'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const detail=require('../src/services/marketplace-comparador-product-detail-v3418');
const {recentFallback,recentImage}=require('../src/services/marketplace-comparador-recent-images-v3432');
const {validOfferPhoto}=require('../src/services/marketplace-comparador-image-confidence-v3433');

const offer={title:'Samsung Galaxy S26 256 GB Smartphone',shop:'Tienda real',condition:'Usado',
 price_cents:60000,price_currency:'EUR',image:'https://images1.gstatic.com/images?q=tbn:opaque-photo',
 href:'https://tienda.es/s26'};

test('la misma búsqueda Samsung utiliza el mismo icono en portada y ficha',()=>{
 const query='samsung s26 256 GB';
 assert.equal(recentImage(query,[offer]),null);
 const expected=recentFallback(query);
 assert.equal(expected,'/assets/comparador-movil-generico-v3435.svg');
 const html=detail.heroMarkup(query,[offer],null,false,0);
 assert.match(html,/class="cmp-detail-image cmp-detail-image-placeholder"/);
 assert.ok(html.includes('src="'+expected+'"'));
 assert.match(html,/Fotografía no verificada · Imagen ilustrativa/);
 assert.doesNotMatch(html,/src="\/assets\/comparador-producto-v3432\.svg"/);
 assert.match(html,/600,00/);
 assert.match(html,/href="#precios-y-tiendas"/);
});
test('iPhone sin foto usa icono móvil, no bolsa de compra',()=>{
 const query='iphone 12 128 GB';
 const uncertain={...offer,title:'Apple iPhone 12 128 GB',price_cents:9000,image:''};
 const html=detail.heroMarkup(query,[uncertain],null);
 assert.equal(recentFallback(query),'/assets/comparador-movil-generico-v3435.svg');
 assert.match(html,/comparador-movil-generico-v3435\.svg/);
 assert.match(html,/90,00/);
});
test('una fotografía realmente identificable conserva el tratamiento habitual',()=>{
 const query='samsung s26 256 GB';
 const verified={...offer,image:'https://images1.gstatic.com/products/samsung-s26-front.jpg'};
 assert.equal(validOfferPhoto(query,verified),verified.image);
 const html=detail.heroMarkup(query,[verified],null);
 assert.match(html,/class="cmp-detail-image"/);
 assert.match(html,/class="cmp-detail-photo"/);
 assert.match(html,/samsung-s26-front\.jpg/);
 assert.doesNotMatch(html,/cmp-detail-image-placeholder|Fotografía no verificada/);
});
test('categorías y búsqueda genérica mantienen comportamiento anterior',()=>{
 assert.equal(recentFallback('armario'),'/assets/comparador-armarios-generico-v3435.svg');
 assert.equal(recentFallback('mesa de comedor'),'/assets/comparador-producto-v3432.svg');
 const html=detail.broadResultsMarkup('armario',[{title:'Armario 2 puertas',price_cents:6499,shop:'Tienda A'}],false);
 assert.match(html,/Búsqueda general/);
 assert.doesNotMatch(html,/cmp-detail-image-placeholder/);
});
test('la ilustración no invade la pantalla móvil ni simula una foto real',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/comparador-premium-v3431.css'),'utf8');
 assert.match(css,/cmp-detail-image\.cmp-detail-image-placeholder/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/min-height:185px/);
 assert.match(css,/\.cmp-detail-noimage small/);
});
