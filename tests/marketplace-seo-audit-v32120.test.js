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
 assert.match(audit.metricsSql,/char_length\(btrim\(l.description\)\) < 35/);
 assert.match(audit.metricsSql,/char_length\(btrim\(l.title\)\) < 10/);
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
  'fotografias_duplicadas'
 ]);
 assert.deepEqual(audit.photosStatus(broken.image_urls),{valid:2,invalid:1,duplicates:1});
 const missing=sample({image_urls:['https://outside.example/img.jpg']});
 assert.ok(audit.issueCodes(missing).includes('sin_fotos_publicas'));
 assert.ok(audit.issueCodes(missing).includes('referencias_imagen_invalidas'));
 assert.ok(!audit.issueCodes({...broken,kind:'service',deal:'offer'}).includes('estado_no_indicado'));
 assert.ok(!audit.issueCodes({...broken,kind:'property',deal:'rent'}).includes('estado_no_indicado'));
});
test('V3.2.120.2: distinctive short WooCommerce names are not falsely marked as SEO problems',()=>{
 const names=[
  'Taza Canción','Taza Stitch&Angel Te Amo','Taza Cuphead',
  'Taza Bob Esponja','Taza Mickey&Minnie','Taza Lucas 21:33',
  'Taza Spiderman'
 ];
 for(const name of names){
  const ad=sample({title:name,description:'Taza con diseño personalizado de catálogo, con el motivo indicado en el nombre de la ficha.'});
  assert.ok(!audit.issueCodes(ad).includes('titulo_corto'),name);
 }
 const short=sample({title:'Taza',description:'Regalo'});
 assert.ok(audit.issueCodes(short).includes('titulo_corto'));
 assert.ok(audit.issueCodes(short).includes('descripcion_breve'));
 const relevant=sample({title:'Taza Cuphead',description:'Taza con diseño Cuphead para regalo.'});
 assert.ok(!audit.issueCodes(relevant).includes('descripcion_breve'));
 const slightlyShort=sample({title:'Taza Spiderman',description:'Taza de cerámica con motivo de Spiderman.'});
 assert.deepEqual(audit.issueCodes(slightlyShort),[]);
});
test('V3.2.120.2: CSV title and description checks do not override the existing generated SEO metadata',()=>{
 const original=sample({
  title:'Taza Cuphead',description:'Taza de cerámica con personaje Cuphead.',
  category:'Dibujos Animados',city:'España',details:{province:'España',saleScope:'national'}
 });
 const before=JSON.parse(JSON.stringify(original));
 assert.deepEqual(audit.issueCodes(original),[]);
 const meta=require('../src/services/marketplace-product-meta-v32118').forListing(original);
 assert.match(meta.title,/Taza Cuphead/);
 assert.match(meta.title,/RedLibertad/);
 assert.match(meta.description,/Taza Cuphead/);
 assert.match(meta.description,/contacta con el vendedor/);
 assert.deepEqual(original,before);
 const auditReport=audit.report({rows:[original],metrics:{public_total:1},categories:[],
  isCategoryIndexable:()=>false,listingPath:seo.listingPath});
 assert.equal(auditReport.examples.length,0);
 assert.equal(auditReport.checks.find(x=>x.id==='short_titles').count,0);
 assert.match(auditReport.checks.find(x=>x.id==='short_descriptions').note,/La descripción SEO del producto se genera por separado/);
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
 assert.equal(out.checks.some(x=>x.id==='condition_unset'),false);
 assert.equal(out.informational.find(x=>x.id==='condition_unset').count,18);
 assert.match(out.informational[0].note,/no es un error SEO/i);
 assert.equal(out.issueLabels.estado_no_indicado,undefined);
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
test('WooCommerce CSV products without condition stay in the audit without triggering one misleading warning per item',()=>{
 const {csvRecords,parseProduct}=require('../src/services/marketplace-woocommerce-csv-v3260');
 const csv=[
  'ID,Type,SKU,Name,Published,In stock?,Description,Regular price,Categories,Images',
  '1,simple,ARM-1,"Armario Turín blanco de tres puertas",1,1,"Armario blanco de tres puertas con cajones, almacenamiento, medidas y características originales.",235.00,"Armarios Puertas Batientes",https://shop.example.com/arm-1.jpg',
  '2,simple,SOF-2,"Sofá chaiselongue gris de tres plazas",1,1,"Sofá con chaiselongue, tapizado gris y tres plazas, con características y medidas para consultar.",499.00,"Sofás",https://shop.example.com/sof-2.jpg'
 ].join('\n');
 const parsed=csvRecords(csv).map(item=>parseProduct(item,{city:'Valencia',province:'Valencia'}));
 assert.ok(parsed.every(x=>x.state==='pending'));
 assert.ok(parsed.every(x=>x.listing.details.condition===undefined));
 const rows=parsed.map((p,i)=>({
  id:i+1,title:p.listing.title,description:p.listing.description,
  kind:p.listing.kind,deal:p.listing.deal,category:p.listing.category,
  image_urls:['/uploads/imported-'+i+'.webp'],details:p.listing.details
 }));
 assert.ok(rows.every(r=>audit.issueCodes(r).length===0));
 const out=audit.report({
  rows,metrics:{public_total:2,products:2,condition_unset:2},categories:[],
  isCategoryIndexable:()=>false,listingPath:seo.listingPath
 });
 assert.equal(out.examples.length,0);
 assert.equal(out.informational[0].count,2);
 assert.equal(out.checks.some(x=>x.id==='condition_unset'),false);
 assert.doesNotMatch(JSON.stringify(out.issueLabels),/Estado nuevo\/usado no indicado/);
 assert.deepEqual(rows.map(r=>r.details.condition),[undefined,undefined]);
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
 assert.match(html,/id="auditOptional"/);
 assert.match(html,/no es un error SEO/);
 assert.match(js,/for\(const item of data.informational\|\|\[\]\)/);
 assert.match(js,/optional\.append\(box\)/);
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
