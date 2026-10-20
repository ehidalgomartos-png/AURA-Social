'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const discovery=require('../src/services/marketplace-public-discovery-v32130');
const seo=require('../src/routes/marketplace-seo-v3251');
const audit=require('../src/services/marketplace-seo-audit-v32120');

const base={
 id:5,title:'Taza Roblox',description:'Taza de cerámica con decoración inspirada en videojuegos.',
 category:'Video Juegos',city:'Valencia',kind:'product',deal:'sale',
 status:'active',moderation_status:'published',seller_status:'active',seller_discoverable:true,
 price_cents:1299,image_urls:['/uploads/taza-5.webp'],
 seller_username:'publico',seller_name:'Vendedor Público',
 created_at:'2026-10-20T10:00:00Z',updated_at:'2026-10-20T10:00:00Z',details:{}
};
const similar=(id,title,extra={})=>({...base,id,title,...extra});
test('V3.2.130 related SQL recommends same type AND transaction, prefers category, never private products',()=>{
 const sql=discovery.PUBLIC_RELATED_SQL;
 for(const clause of [
  'l.id<>$1','l.kind=$2','l.deal=$3',
  "LOWER(BTRIM(l.category))=LOWER(BTRIM($4::text))",
  "LOWER(BTRIM(l.city))=LOWER(BTRIM($5::text))",
  "l.status='active'","l.moderation_status='published'",
  "u.status='active'","u.discoverable=true",
  "ORDER BY CASE WHEN LOWER(BTRIM(l.category))=LOWER(BTRIM($4::text))",
  'LIMIT 4'
 ])assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(sql,/INSERT INTO|DELETE FROM|UPDATE marketplace_listings|HAVING.*indexado|sk_live_/i);
 assert.deepEqual(discovery.relatedArgs(base),['5','product','sale','Video Juegos','Valencia']);
 assert.deepEqual(discovery.relatedArgs({...base,id:6,kind:'property',deal:'rent'}),
  ['6','property','rent','Video Juegos','Valencia']);
 for(const mod of [{id:'0'},{id:'1 OR true'},{kind:'unknown'},{deal:'auction'},{}]){
  if(Object.keys(mod).length)
   assert.throws(()=>discovery.relatedArgs({...base,...mod}),/invalid_public_related_listing/);
 }
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=src.indexOf("router.get('/marketplace/p/:id/:slug?'");
 const stop=src.indexOf("router.get('/marketplace/imagen/:id/:index'",start);
 const route=src.slice(start,stop);
 assert.match(route,/if\(!eligible\(row\)\)return unavailable/);
 assert.match(route,/marketplaceDiscoveryV32130\.PUBLIC_RELATED_SQL/);
 assert.match(route,/marketplaceDiscoveryV32130\.relatedArgs\(row\)/);
 assert.doesNotMatch(route,/INSERT INTO |UPDATE marketplace_listings|DELETE FROM marketplace_listings/);
});
test('V3.2.130 links preserve exact product SALE vs BUY filters without pretending filtered pages are canonical',()=>{
 assert.equal(discovery.categoryBrowse(base),
  '/marketplace/explorar?tipo=product&operacion=sale&categoria=Video+Juegos');
 assert.equal(discovery.categoryBrowse({...base,deal:'buy'}),
  '/marketplace/explorar?tipo=product&operacion=buy&categoria=Video+Juegos');
 assert.equal(discovery.categoryBrowse({...base,kind:'service',deal:'offer'}),
  '/marketplace/explorar?tipo=service&categoria=Video+Juegos');
 assert.equal(discovery.categoryBrowse({...base,kind:'property',deal:'rent'}),
  '/marketplace/explorar?tipo=property&categoria=Video+Juegos');
 assert.equal(discovery.categoryBrowse({...base,kind:'garbage'}),
  '/marketplace/explorar');
 const html=seo.listingHtml(base,[similar(12,'Taza personalizada elegante')]);
 assert.match(html,/href="\/marketplace\/explorar\?tipo=product&amp;operacion=sale&amp;categoria=Video\+Juegos"/);
 assert.match(html,/market-discovery-more-v32130/);
 assert.match(html,/Otros anuncios públicos de la misma operación/);
 assert.match(html,/href="\/marketplace\/p\/12\/taza-personalizada-elegante"/);
 assert.match(html,/<link rel="canonical" href="https:\/\/redlibertad\.com\/marketplace\/p\/5\/taza-roblox"/);
 assert.equal((html.match(/market-discovery-more-v32130/g)||[]).length,1);
 const buy=seo.listingHtml({...base,deal:'buy'},[]);
 assert.match(buy,/href="\/marketplace\/explorar\?tipo=product&amp;operacion=buy&amp;categoria=Video\+Juegos"/);
 assert.doesNotMatch(buy,/market-discovery-more-v32130/);
 // Older/unknown WooCommerce condition must never imply "used" or "new".
 assert.doesNotMatch(html,/>NUEVO</);
 assert.doesNotMatch(html,/muebles-segunda-mano/);
});
test('V3.2.130 duplicate-title warning uses ONLY bounded public sample; duplicate words do not prove duplicate products',()=>{
 const rows=[
  similar(1,'Taza Roblox'),
  similar(2,'TAZA  róblox ',{category:'Video Juegos'}),
  similar(3,'Taza Roblox',{category:'Regalos'}),
  similar(4,'Taza Roblox',{deal:'buy'}),
  similar(5,'Taza Stitch'),
  similar(6,'Taza Stitch'),
  similar(7,'Taza Navidad'),
  similar(8,'Taza Navidad'),
  similar(9,'Taza Navidad'),
  similar(10,'Taza Navidad'),
  similar(11,'Otro Producto')
 ];
 const result=discovery.duplicateTitleCandidates(rows,{listingPath:seo.listingPath});
 assert.equal(result.source,'recent_public_listing_title_sample');
 assert.equal(result.sampleSize,11);
 assert.equal(result.maximumSample,100);
 assert.equal(result.groupCount,3);
 const mug=result.groups.find(g=>g.title==='Taza Roblox');
 assert.ok(mug);
 assert.equal(mug.count,2);
 assert.deepEqual(mug.items.map(v=>v.id),['1','2']);
 assert.ok(mug.items.every(x=>x.path.startsWith('/marketplace/p/')));
 const christmas=result.groups.find(g=>g.title==='Taza Navidad');
 assert.equal(christmas.count,4);
 assert.equal(christmas.items.length,3);
 assert.ok(result.note.includes('NO duplicados confirmados'));
 assert.equal(rows[0].title,'Taza Roblox');
 const over=discovery.duplicateTitleCandidates(
  Array.from({length:120},(_,i)=>similar(i+1,'Taza Navidad')),{listingPath:seo.listingPath});
 assert.equal(over.sampleSize,100);
 assert.equal(over.groups[0].count,100);
 assert.equal(over.groups[0].items.length,3);
 assert.throws(()=>discovery.duplicateTitleCandidates(rows),/duplicate_sample_path_required/);
 const polluted=[similar(22,'<img src=x onerror=alert(1)>'),similar(23,'<img src=x onerror=alert(1)>')];
 assert.equal(discovery.duplicateTitleCandidates(polluted,{listingPath:seo.listingPath}).groups.length,1);
});
test('V3.2.130 duplicate groups cannot include unrelated operation, category or very short titles',()=>{
 const rows=[
  similar(25,'Mesa',{}),similar(26,'MESA'),
  similar(27,'Taza Roblox',{deal:'sale',category:'Anime'}),
  similar(28,'Taza Roblox',{deal:'buy',category:'Anime'}),
  similar(29,'Taza Roblox',{kind:'service',deal:'offer',category:'Anime'}),
  similar(30,'Taza Roblox',{kind:'product',deal:'sale',category:'Video Juegos'}),
  similar(31,'Taza Roblox',{kind:'product',deal:'sale',category:'Video Juegos'})
 ];
 const res=discovery.duplicateTitleCandidates(rows,{listingPath:seo.listingPath});
 assert.equal(res.groups.length,1);
 assert.equal(res.groups[0].items.length,2);
 assert.equal(res.groups[0].count,2);
});
test('V3.2.130 admin-only read-only duplicate review reuses strict public SQL, no secret or write',()=>{
 const src=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=src.indexOf("router.get('/api/admin/marketplace/seo/auditoria'");
 const end=src.indexOf("router.get('/marketplace/mi-tienda'",start);
 const section=src.slice(start,end);
 assert.match(section,/router.get\('\/api\/admin\/marketplace\/seo\/auditoria',requireAdmin/);
 assert.match(section,/marketplaceDiscoveryV32130\.duplicateTitleCandidates\(sample\.rows,\{listingPath\}\)/);
 assert.match(section,/Cache-Control','private,no-store'/);
 assert.match(section,/X-Robots-Tag','noindex,nofollow'/);
 for(const s of ["l.status='active'","l.moderation_status='published'","u.status='active'","u.discoverable=true"])
  assert.ok(audit.sampleSql.includes(s),s);
 assert.match(audit.sampleSql,/LIMIT 100/);
 assert.doesNotMatch(section,/router\.post|INSERT INTO marketplace_listings|UPDATE marketplace_listings|DELETE FROM marketplace_listings/);
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 assert.match(html,/id="auditDuplicateCandidates"/);
 assert.match(html,/id="auditDuplicateNote"/);
 assert.match(html,/no prueban que los productos sean duplicados/);
 assert.match(html,/v=3\.2\.130/);
 assert.match(js,/renderDuplicateTitles\(data\.duplicateTitleCandidates\)/);
 assert.match(js,/safeUrl\(entry\?\.path\)/);
 assert.match(js,/groups\.slice\(0,5\)/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(/);
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 assert.match(css,/audit-duplicate-groups/);
 assert.match(css,/@media\(max-width:620px\)/);
});
