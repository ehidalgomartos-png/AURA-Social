'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const seo=require('../src/marketplace-category-seo-v32112');
const marketplace=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const all={...Object.fromEntries(seo.LANDINGS.map(d=>[d.id,10])),muebles_catalogo:20,armarios:6,sofas:6,dormitorios:6,used_category_diversity:3};
const few={segunda_mano:4,muebles:0,moviles:0,vehiculos:0,servicios:3,inmuebles:1};
test('ten finite meaningful category routes, with distinct intent and no competitor keyword stuffing',()=>{
 assert.equal(seo.LANDINGS.length,10);
 assert.equal(new Set(seo.LANDINGS.map(d=>d.path)).size,10);
 assert.equal(new Set(seo.LANDINGS.map(d=>d.title)).size,10);
 for(const def of seo.LANDINGS){
  assert.equal(seo.bySlug(def.slug),def);
  assert.match(def.path,/^\/marketplace\/[a-z-]+$/);
  assert.match(def.title,/RedLibertad/);
  assert.ok(def.description.length>=90 && def.description.length<190);
  assert.doesNotMatch(def.title+' '+def.description,/Wallapop|Milanuncios|ofertas garantizadas|miles de anuncios|mejor precio/i);
  assert.equal(seo.countQuery().includes(def.id),true);
  assert.match(seo.listingQuery(def),/ORDER BY l.created_at DESC,l.id DESC LIMIT 25 OFFSET 0/);
 }
 assert.equal(seo.bySlug('../../secret'),null);
 assert.throws(()=>seo.listingQuery({where:'true OR 1=1'}),/unknown_marketplace_category/);
});
test('second-hand terms require explicit used condition; seller privacy and moderation are applied to all queries',()=>{
 const used=seo.LANDINGS.filter(d=>['segunda_mano','muebles','moviles','vehiculos'].includes(d.id));
 assert.equal(used.length,4);
 for(const def of used){
  assert.match(def.where,/l\.kind='product'/);
  assert.match(def.where,/l\.deal='sale'/);
  assert.match(def.where,/l\.details->>'condition'='used'/);
 }
 for(const q of [seo.countQuery(),...seo.LANDINGS.map(seo.listingQuery)]){
  assert.match(q,/l.status='active'/);
  assert.match(q,/l.moderation_status='published'/);
  assert.match(q,/u.status='active'/);
  assert.match(q,/u.discoverable=true/);
  assert.doesNotMatch(q,/ILIKE \$|LIMIT 999999/);
 }
 const services=seo.bySlug('servicios');
 assert.match(services.where,/l\.kind='service' AND l\.deal='offer'/);
 assert.match(seo.bySlug('inmuebles').where,/l\.kind='property'/);
});
test('only categories with at least five real public advertisements are indexable or in XML sitemap',()=>{
 assert.equal(seo.MIN_PUBLIC_ADS,5);
 assert.equal(seo.canIndex({segunda_mano:8,used_category_diversity:1},seo.bySlug('segunda-mano')),false);
 assert.equal(seo.canIndex({segunda_mano:8,used_category_diversity:2},seo.bySlug('segunda-mano')),true);
 assert.equal(seo.canIndex({muebles:4},seo.bySlug('muebles-segunda-mano')),false);
 assert.equal(seo.canIndex({muebles:5},seo.bySlug('muebles-segunda-mano')),true);
 assert.deepEqual(seo.qualified(few),[]);
 assert.equal(seo.sitemapXml(few).includes('<url>'),false);
 assert.equal(seo.qualified(all).length,10);
 assert.equal((seo.sitemapXml(all).match(/<url>/g)||[]).length,10);
 assert.match(seo.sitemapXml({muebles:5}),/https:\/\/redlibertad\.com\/marketplace\/muebles-segunda-mano/);
 assert.doesNotMatch(seo.sitemapXml({muebles:5}),/marketplace\/inmuebles/);
});
test('category navigation only exposes qualified page links, never empty or noindex URLs',()=>{
 assert.equal(seo.navigation(few),'');
 const menu=seo.navigation({muebles:5,servicios:7,inmuebles:0},{current:'muebles-segunda-mano'});
 assert.match(menu,/href="\/marketplace\/servicios"/);
 assert.doesNotMatch(menu,/href="\/marketplace\/muebles-segunda-mano"/);
 assert.doesNotMatch(menu,/href="\/marketplace\/inmuebles"/);
});
test('helpful category HTML handles thin inventory honestly and preserves external checkout',()=>{
 const def=seo.bySlug('muebles-segunda-mano');
 const low=seo.content(def,{count:2,indexable:false});
 assert.match(low,/Estamos ampliando esta categoría/);
 assert.doesNotMatch(low,/2 anuncios públicos/);
 const rich=seo.content(def,{count:8,cards:'<article>Real</article>',indexable:true});
 assert.equal((rich.match(/<h1>/g)||[]).length,1);
 assert.match(rich,/8 anuncios públicos/);
 assert.match(rich,/<article>Real<\/article>/);
 assert.match(rich,/web del vendedor/);
 assert.doesNotMatch(rich,/pagar en RedLibertad|compra protegida|anuncios gratis/i);
});
test('only real visible item URLs are expressed in safe CollectionPage JSON-LD',()=>{
 const def=seo.bySlug('segunda-mano');
 const data=seo.structuredData(def,[
  {id:7,title:'Sofá usado en Valencia'},
  {id:8,title:'</script><script>alert(1)</script>'}
 ]);
 const [page,crumbs,items]=data['@graph'];
 assert.equal(page['@type'],'CollectionPage');
 assert.equal(page.url,'https://redlibertad.com/marketplace/segunda-mano');
 assert.equal(crumbs['@type'],'BreadcrumbList');
 assert.equal(items['@type'],'ItemList');
 assert.equal(items.itemListElement.length,2);
 assert.equal(items.itemListElement[0].url,'https://redlibertad.com/marketplace/p/7/sofa-usado-en-valencia');
 const escaped=marketplace.jsonLd(data);
 assert.doesNotMatch(escaped,/<script>|<\/script>/);
 assert.equal(JSON.parse(escaped)['@graph'][2].itemListElement[1].name,'</script><script>alert(1)</script>');
 assert.doesNotMatch(escaped,/"@type":"Offer"|aggregateRating/);
});
test('Express SSR routes, meta robots, sitemap, and mobile discovery are wired into production',()=>{
 const source=read('src/routes/marketplace-seo-v3251.js');
 const server=read('server.js');
 assert.match(source,/for\(const categoryDef of marketplaceCategorySeoV32112\.LANDINGS\)/);
 assert.match(source,/router\.get\(categoryDef\.path,async/);
 assert.match(source,/marketplaceCategorySeoV32112\.canIndex\(counts,categoryDef\)/);
 assert.match(source,/if\(!indexable\)res\.setHeader\('X-Robots-Tag','noindex, follow'\)/);
 assert.match(source,/robots:indexable\?'index,follow,max-image-preview:large':'noindex,follow'/);
 assert.match(source,/schema:indexable\?marketplaceCategorySeoV32112\.structuredData\(categoryDef,listings,\{page\}\):null/);
 assert.match(source,/marketplaceCategorySeoV32112\.navigation\(categoryCounts\)/);
 assert.match(source,/marketplaceCategorySeoV32112\.sitemapXml/);
 assert.match(source,/router\.get\('\/sitemap-marketplace-categorias\.xml'/);
 assert.match(source,/marketplace-category-seo-v32112\.css\?v=3\.2\.112/);
 assert.match(server,/sitemap-marketplace-categorias\.xml/);
 assert.match(server,/Allow: \/marketplace\//);
 assert.match(source,/WHERE l\.status='active' AND l\.moderation_status='published'/);
 assert.match(source,/robots:searching\?'noindex,follow':'index,follow,max-image-preview:large'/);
});
test('mobile layout keeps a clear CTA, focus styles, and no fixed floating overlays',()=>{
 const css=read('public/marketplace-category-seo-v32112.css');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
