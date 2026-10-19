'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const audit=require('../src/services/marketplace-seo-audit-v32120');
const cat=require('../src/marketplace-category-seo-v32112');
const seo=require('../src/routes/marketplace-seo-v3251');
const sample=(overrides={})=>({
 id:120,title:'Armario Turín 3 puertas batientes',
 description:'Armario de tres puertas con detalles del tamaño, precio, estado, acabados y recogida anunciados por su vendedor.',
 kind:'product',deal:'sale',city:'Valencia',category:'Armarios Puertas Batientes',
 image_urls:['/uploads/armario-120-a.webp','/uploads/armario-120-b.jpg'],
 details:{condition:'new'},
 updated_at:'2026-10-19T15:00:00.000Z',...overrides
});
test('readiness aggregates and samples always exclude hidden, paused and private seller listings',()=>{
 for(const sql of [audit.metricsSql,audit.sampleSql]){
  assert.match(sql,/l.status='active'/);
  assert.match(sql,/l.moderation_status='published'/);
  assert.match(sql,/u.status='active'/);
  assert.match(sql,/u.discoverable=true/);
  assert.match(sql,/JOIN users u ON u.id=l.seller_id/);
  assert.doesNotMatch(sql,/INSERT INTO |UPDATE marketplace_listings|DELETE FROM/i);
 }
 assert.match(audit.metricsSql,/char_length\(btrim\(l.description\)\) < 70/);
 assert.match(audit.metricsSql,/jsonb_array_length\(l.image_urls\)=0/);
 assert.match(audit.sampleSql,/ORDER BY l.updated_at DESC,l.id DESC LIMIT 100/);
 assert.doesNotMatch(audit.sampleSql,/u.email|u.password|u.phone|stripe|session_token/i);
});
test('advisory SEO heuristics are factual; declared state and public image count are not invented',()=>{
 assert.deepEqual(audit.issueCodes(sample()),[]);
 const broken=sample({
  title:'Sofá',description:'Breve',image_urls:[
   '/uploads/a.webp','/uploads/a.webp','https://external.example/img.jpg','/uploads/b.png'
  ],details:{}
 });
 assert.deepEqual(audit.issueCodes(broken),[
  'titulo_corto','descripcion_breve','referencias_imagen_invalidas',
  'fotografias_duplicadas','estado_no_indicado'
 ]);
 assert.deepEqual(audit.photosStatus(broken.image_urls),{valid:2,invalid:1,duplicates:1});
 const missing=sample({image_urls:['https://outside.example/img.jpg']});
 assert.ok(audit.issueCodes(missing).includes('sin_fotos_publicas'));
 assert.ok(audit.issueCodes(missing).includes('referencias_imagen_invalidas'));
 assert.ok(!audit.issueCodes({...broken,kind:'service',deal:'offer'}).includes('estado_no_indicado'));
 assert.ok(!audit.issueCodes({...broken,kind:'property',deal:'rent'}).includes('estado_no_indicado'));
});
test('report contains only public listing links, optional editorial issues and real category eligibility',()=>{
 const rows=[sample({id:120,title:'Armario',description:'Poca descripción',image_urls:[],details:{}}),sample({id:121})];
 const counts={muebles_catalogo:15,armarios:6,sofas:0,dormitorios:0};
 const out=audit.report({
  metrics:{public_total:82,products:80,services:1,properties:1,short_titles:8,short_descriptions:10,without_images:4,condition_unset:18},
  rows,categoryCounts:counts,categories:[cat.bySlug('muebles'),cat.bySlug('armarios')],
  isCategoryIndexable:cat.canIndex,listingPath:seo.listingPath
 });
 assert.equal(out.ok,true);
 assert.equal(out.mode,'preparacion_tecnica');
 assert.equal(out.readOnly,true);
 assert.equal(out.totals.publicListings,82);
 assert.equal(out.checks.find(x=>x.id==='without_images').count,4);
 assert.equal(out.limits.recentSample,2);
 assert.equal(out.examples.length,1);
 assert.equal(out.examples[0].url,'/marketplace/p/120/armario');
 assert.equal(out.categories[0].indexable,true);
 assert.equal(out.categories[1].indexable,true); // 15 furniture minus 6 armarios => 9 other ads
 assert.match(out.note,/No consulta Google Search Console/);
 assert.equal(out.indexedByGoogle,undefined);
 assert.equal(out.examples[0].seller_email,undefined);
 assert.equal(out.examples[0].description,undefined);
});
test('100-entry bounded sample never invents global Google results',()=>{
 const rows=Array.from({length:160},(_,i)=>sample({id:1000+i,title:'Taza',description:'Breve'}));
 const output=audit.report({
  rows,metrics:{public_total:160},categories:[],
  isCategoryIndexable:()=>false,listingPath:seo.listingPath
 });
 assert.equal(output.limits.maximumSample,100);
 assert.equal(output.limits.recentSample,100);
 assert.equal(output.limits.issueExamples,100);
 assert.equal(output.examples.length,100);
 assert.equal(output.totals.publicListings,160);
 assert.throws(()=>audit.report({rows:[]}),/audit_helpers_required/);
});
test('both admin endpoints require authentication, are uncacheable and not indexable',()=>{
 const source=fs.readFileSync('src/routes/marketplace-seo-v3251.js','utf8');
 const start=source.indexOf("// V3.2.120: private, read-only diagnostic.");
 const end=source.indexOf("router.get('/marketplace/mi-tienda'",start);
 assert.ok(start>=0&&end>start);
 const part=source.slice(start,end);
 assert.match(part,/router.get\('\/marketplace\/seo\/auditoria',requireAdmin/);
 assert.match(part,/router.get\('\/api\/admin\/marketplace\/seo\/auditoria',requireAdmin/);
 assert.equal((part.match(/'Cache-Control','private,no-store'/g)||[]).length,2);
 assert.equal((part.match(/'X-Robots-Tag','noindex,nofollow'/g)||[]).length,2);
 assert.match(part,/await ensureMarketplaceSchema\(\)/);
 assert.match(part,/marketplaceSeoAuditV32120\.metricsSql/);
 assert.match(part,/marketplaceSeoAuditV32120\.sampleSql/);
 assert.match(part,/marketplaceCategorySeoV32112\.countQuery\(\)/);
 assert.doesNotMatch(part,/router.post|router.put|router.delete|INSERT INTO|UPDATE marketplace_listings/);
});
test('private mobile panel escapes all untrusted strings and does not expose user data in static files',()=>{
 const html=fs.readFileSync('src/views/marketplace-seo-audit-v32120.html','utf8');
 const js=fs.readFileSync('public/marketplace-seo-audit-v32120.js','utf8');
 const css=fs.readFileSync('public/marketplace-seo-audit-v32120.css','utf8');
 assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(html,/No representa|No representa el estado|No representa el estado de indexación/);
 assert.match(html,/auditResults" hidden/);
 assert.match(js,/textContent/);
 assert.match(js,/replaceChildren/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(/);
 assert.match(js,/if\(response.status===401\|\|response.status===403\)/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/@media\(max-width:320px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/position:fixed/);
});
