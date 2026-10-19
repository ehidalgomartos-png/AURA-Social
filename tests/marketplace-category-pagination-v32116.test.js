'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const seo=require('../src/marketplace-category-seo-v32112');
const marketplace=require('../src/routes/marketplace-seo-v3251');
const def=seo.bySlug('muebles');
const listing=id=>({id,title:'Armario Turin '+id,kind:'product',deal:'sale',
 category:'Armarios Puertas Batientes',details:{condition:'new'},city:'Valencia',
 image_urls:[],price_cents:15900,created_at:new Date().toISOString()});
test('32 public furniture ads lead to two bounded, distinct crawlable pages',()=>{
 assert.equal(seo.CATEGORY_PAGE_SIZE,24);
 assert.equal(seo.categoryPath(def,1),'/marketplace/muebles');
 assert.equal(seo.categoryPath(def,2),'/marketplace/muebles?pagina=2');
 assert.match(seo.listingQuery(def),/LIMIT 25 OFFSET 0$/);
 assert.match(seo.listingQuery(def,{page:2}),/LIMIT 25 OFFSET 24$/);
 assert.match(seo.listingQuery(def,{page:3}),/LIMIT 25 OFFSET 48$/);
 assert.match(seo.listingQuery(def,{page:1000}),/LIMIT 25 OFFSET 23976$/);
 assert.throws(()=>seo.listingQuery(def,{page:1001}),/invalid_marketplace_category_page/);
 assert.throws(()=>seo.listingQuery(def,{page:-1}),/invalid_marketplace_category_page/);
 assert.throws(()=>seo.categoryPath(def,1001),/invalid_marketplace_category_page/);
 assert.throws(()=>seo.listingQuery({where:'true OR 1=1'},{page:1}),/invalid_marketplace_category_page/);
});
test('invalid and noncanonical page parameters cannot manufacture public paging URLs',()=>{
 for(const value of ['0','-1','1001','99999','2.4','02','2 OR 1=1','',null,2,['2']])
  assert.equal(seo.validPage(value),false,String(value));
 for(const value of ['1','2','999','1000'])assert.equal(seo.validPage(value),true,value);
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const segment=src.slice(src.indexOf('// V3.2.112: finite public category'),src.indexOf("router.get('/sitemap-marketplace-categorias.xml'"));
 assert.match(segment,/if\(!marketplaceCategorySeoV32112\.validPage\(rawPage\)\)return unavailable\(res\)/);
 assert.match(segment,/if\(page>lastPage\)return unavailable\(res\)/);
 assert.match(segment,/if\(page>1&&!listings\.length\)return unavailable\(res\)/);
 assert.match(segment,/result\.slice\(0,marketplaceCategorySeoV32112\.CATEGORY_PAGE_SIZE\)/);
 assert.match(segment,/marketplaceCategorySeoV32112\.listingQuery\(categoryDef,\{page\}\)/);
 assert.match(segment,/hasNext=page<marketplaceCategorySeoV32112\.MAX_CATEGORY_PAGES/);
 assert.match(segment,/canonical:ORIGIN\+categoryPath/);
 assert.match(segment,/structuredData\(categoryDef,listings,\{page\}\)/);
 assert.match(segment,/page>1\?' — Página '\+page:''/);
 assert.match(segment,/const minOnPage=page===1\?marketplaceCategorySeoV32112\.MIN_PUBLIC_ADS:1/);
});
test('page 1 lists 1–24 of 32 and has next but no previous',()=>{
 const body=seo.content(def,{count:32,indexable:true,page:1,
  visibleCount:24,hasNext:true,cards:'<article>One</article>'});
 assert.match(body,/32 anuncios públicos/);
 assert.match(body,/Mostrando 1–24 de 32/);
 assert.match(body,/Página 1 de 2/);
 assert.match(body,/rel="next" href="\/marketplace\/muebles\?pagina=2"/);
 assert.doesNotMatch(body,/rel="prev"/);
 assert.match(body,/Anuncios disponibles/);
});
test('page 2 has a unique canonical and shows only 25–32 of 32',()=>{
 const body=seo.content(def,{count:32,indexable:true,page:2,
  visibleCount:8,hasNext:false,cards:'<article>More</article>'});
 assert.match(body,/Mostrando 25–32 de 32/);
 assert.match(body,/Página 2 de 2/);
 assert.match(body,/rel="prev" href="\/marketplace\/muebles"/);
 assert.doesNotMatch(body,/rel="next"/);
 assert.match(body,/Muebles para el hogar: nuevos y de segunda mano — página 2/);
 const row=Array.from({length:8},(_,i)=>listing(8-i));
 const schema=seo.structuredData(def,row,{page:2});
 const [page,crumbs,items]=schema['@graph'];
 assert.equal(page.url,'https://redlibertad.com/marketplace/muebles?pagina=2');
 assert.equal(page['@id'],page.url+'#webpage');
 assert.equal(crumbs.itemListElement[2].item,page.url);
 assert.deepEqual(items.itemListElement.map(x=>x.position),[25,26,27,28,29,30,31,32]);
 assert.equal(items.itemListElement.length,8);
});
test('no navigation for thin collections or single page, preserving noindex editorial gate',()=>{
 const low=seo.content(def,{count:4,indexable:false,visibleCount:4,page:1,
  cards:'<article>Small collection</article>'});
 assert.match(low,/Estamos ampliando esta categoría/);
 assert.doesNotMatch(low,/market-category-pagination-v32116/);
 const one=seo.content(def,{count:9,indexable:true,visibleCount:9,page:1,hasNext:false});
 assert.doesNotMatch(one,/rel="next"|rel="prev"/);
 assert.equal(seo.canIndex({muebles_catalogo:4},def),false);
 assert.equal(seo.canIndex({muebles_catalogo:32},def),true);
});
test('visible RECENTE badge reflects publication recency, not new/used item condition',()=>{
 const s=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.equal((s.match(/market-new-chip" title="Publicado recientemente">RECIENTE/g)||[]).length,2);
 assert.doesNotMatch(s,/market-new-chip">NUEVO/);
 const row={...listing(2),description:'Armario de madera nuevo de catálogo.',
   status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
   seller_username:'vendedor',seller_name:'Vendedor'};
 const html=marketplace.listingHtml(row,[]);
 assert.match(html,/Publicado recientemente">RECIENTE/);
 assert.match(html,/Estado<\/dt><dd>Nuevo/);
 assert.doesNotMatch(html,/market-new-chip">NUEVO/);
});
test('mobile category links stay accessible and purchases remain on seller website',()=>{
 const css=fs.readFileSync('public/marketplace-category-seo-v32112.css','utf8');
 assert.match(css,/market-category-pagination-v32116/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed/);
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.doesNotMatch(source,/stripe\.checkout\(|sk_live_/);
 assert.match(source,/marketplaceCategorySeoV32112\.sitemapXml/);
});
