'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const plan=require('../src/services/marketplace-sitemap-plan-v32122');
const categories=require('../src/marketplace-category-seo-v32112');
const seo=require('../src/routes/marketplace-seo-v3251');

test('V3.2.122 root sitemap index points at complete Marketplace sitemap index, not only first page',()=>{
 const server=fs.readFileSync('server.js','utf8');
 const start=server.indexOf("app.get('/sitemap-index.xml'");
 const end=server.indexOf("app.get('/robots.txt'",start);
 assert.ok(start>0&&end>start);
 const rootIndex=server.slice(start,end);
 assert.match(rootIndex,/origin\+'\/sitemap-marketplace\.xml'/);
 assert.doesNotMatch(rootIndex,/origin\+'\/sitemap-marketplace-1\.xml'/);
 const robots=server.slice(end,server.indexOf("app.get('/sitemap.xml'",end));
 assert.match(robots,/origin}\/sitemap-marketplace\.xml/);
 assert.match(robots,/origin}\/sitemap-marketplace-productos\.xml/);
 assert.match(robots,/origin}\/sitemap-marketplace-servicios\.xml/);
 assert.match(robots,/origin}\/sitemap-marketplace-inmuebles\.xml/);
 assert.match(robots,/origin}\/sitemap-marketplace-categorias\.xml/);
 const route=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 assert.match(route,/router.get\('\/sitemap-marketplace\.xml'/);
 assert.match(route,/router.get\('\/sitemap-marketplace-:page\.xml'/);
 assert.match(route,/router.get\('\/sitemap-marketplace-'+label+'\.xml'/);
 assert.match(route,/router.get\('\/sitemap-marketplace-'+label+'-:page\.xml'/);
 assert.match(route,/const PAGE_SIZE=marketplaceSitemapPlanV32122\.PAGE_SIZE/);
 assert.equal(plan.PAGE_SIZE,2000);
 assert.equal(plan.ROOT,'/sitemap-index.xml');
 assert.equal(plan.MARKET,'/sitemap-marketplace.xml');
});
test('V3.2.122 expected public page count boundary 0, 2000, 2001 and 4001',()=>{
 for(const [count,pages] of [[0,1],[1,1],[1999,1],[2000,1],[2001,2],[4000,2],[4001,3]]){
  assert.equal(plan.pageCount(count),pages);
 }
 for(const bad of [-1,NaN,Infinity,'not-valid']){
  assert.equal(plan.safeCount(bad),0);
  assert.equal(plan.pageCount(bad),1);
 }
 const s=plan.summary({public_total:4001,products:2001,services:0,properties:17}, {},[],()=>false);
 assert.equal(s.kind,'expected_sitemap_structure');
 assert.equal(s.entries.length,5);
 assert.deepEqual(s.entries.map(x=>x.pages),[3,2,1,1,1]);
 assert.deepEqual(s.entries.map(x=>x.count),[4001,2001,0,17,0]);
 assert.equal(s.entries[0].path,'/sitemap-marketplace.xml');
 assert.equal(s.entries[0].firstPage,'/sitemap-marketplace-1.xml');
 assert.equal(s.entries[0].lastPage,'/sitemap-marketplace-3.xml');
 assert.equal(s.entries[1].path,'/sitemap-marketplace-productos.xml');
 assert.equal(s.entries[1].lastPage,'/sitemap-marketplace-productos-2.xml');
 assert.equal(s.entries[2].lastPage,'/sitemap-marketplace-servicios-1.xml');
 assert.equal(s.entries[4].path,'/sitemap-marketplace-categorias.xml');
 assert.equal(s.entries[4].type,'urlset');
 assert.match(s.note,/No comprueba HTTP en producción/);
 assert.doesNotMatch(JSON.stringify(s),/GoogleIndexed|indexedByGoogle|positions:|clicks:|impressions:/);
});
test('V3.2.122 category sitemap estimate uses the same real category eligibility gate as its generator',()=>{
 const counts={muebles_catalogo:16,armarios:9,sofas:2,dormitorios:0,muebles:0,
  segunda_mano:0,used_category_diversity:0};
 const s=plan.summary({public_total:16,products:16},counts,categories.LANDINGS,categories.canIndex);
 const actual=categories.qualified(counts);
 assert.deepEqual(actual.map(d=>d.slug),['muebles','armarios']);
 assert.equal(s.entries.find(x=>x.id==='categorias').count,actual.length);
 assert.equal(s.entries.find(x=>x.id==='categorias').pages,1);
 assert.equal(s.entries.find(x=>x.id==='productos').count,16);
 assert.equal(s.entries.find(x=>x.id==='general').pages,1);
 // This is just a local expected structure; no new indexable category page.
 assert.doesNotMatch(fs.readFileSync('src/services/marketplace-sitemap-plan-v32122.js','utf8'),/INSERT INTO|UPDATE marketplace_listings|DELETE FROM|sk_live_/i);
});
test('V3.2.122 the admin API uses only strict public counts and is private, read-only and noindex',()=>{
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=src.indexOf("router.get('/api/admin/marketplace/seo/auditoria'");
 const end=src.indexOf("router.get('/marketplace/mi-tienda'",start);
 assert.ok(start>0&&end>start);
 const api=src.slice(start,end);
 assert.match(api,/requireAdmin/);
 assert.match(api,/marketplaceSeoAuditV32120\.metricsSql/);
 assert.match(api,/marketplaceCategorySeoV32112\.countQuery/);
 assert.match(api,/marketplaceSitemapPlanV32122\.summary/);
 assert.match(api,/Cache-Control','private,no-store'/);
 assert.match(api,/X-Robots-Tag','noindex,nofollow'/);
 assert.doesNotMatch(api,/\.post\(|\.put\(|INSERT INTO|UPDATE marketplace_listings|DELETE FROM/);
 const old=require('../src/services/marketplace-seo-audit-v32120');
 for(const predicate of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true"]){
  assert.ok(old.metricsSql.includes(predicate));
 }
});
test('V3.2.122 private mobile sitemap summary allows only safe local paths without XSS',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 for(const name of ['auditSitemapPlan','auditSitemapNote','auditRootSitemap','auditRobots'])
  assert.ok(html.includes('id="'+name+'"'));
 assert.match(html,/No confirma que Google haya rastreado o indexado/);
 assert.match(html,/3\.2\.122/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/renderSitemaps\(data\)/);
 assert.match(js,/sitemapLinkPath/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\.innerHTML\s*=|insertAdjacentHTML|eval\(/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/audit-sitemap-list/);
});
test('V3.2.122 keeps original public listing canonical URLs and photo index intact',()=>{
 const listing={id:33,title:'Taza Cuphead',updated_at:'2026-10-19T12:00:00Z',image_urls:['/uploads/cuphead-33-a.webp','/uploads/cuphead-33-b.jpg']};
 const xml=seo.sitemapListingEntry(listing);
 assert.match(xml,/<loc>https:\/\/redlibertad\.com\/marketplace\/p\/33\/taza-cuphead<\/loc>/);
 assert.equal((xml.match(/<image:image>/g)||[]).length,2);
 assert.equal((xml.match(/<url>/g)||[]).length,1);
 assert.equal(plan.ORIGIN,'https://redlibertad.com');
});
