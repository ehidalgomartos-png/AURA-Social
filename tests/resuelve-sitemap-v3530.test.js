'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.30: sitemap only selects fully approved and voluntarily public solutions',()=>{
 const sql=read('src/services/resuelve-v350.js');
 const block=sql.slice(sql.indexOf('async function sitemapSeoSolutions('),sql.indexOf('async function reopen('));
 assert.match(block,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(block,/q\.status='resolved' AND q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(block,/a\.status='visible'/);
 assert.match(block,/author.status='active'/);
 assert.match(block,/respondent.status='active'/);
 assert.match(block,/char_length\(trim\(split_part\(a\.body/);
 assert.match(block,/char_length\(trim\(q\.body\)\)>=50/);
 assert.match(block,/LIMIT 2000/);
 assert.doesNotMatch(block,/password|email|reporter_id|UPDATE|DELETE|INSERT/);
 const server=read('server.js');
 assert.match(server,/app\.get\('\/sitemap-resuelve\.xml',resuelveSitemapHandler\)/);
 assert.match(server,/Sitemap: \$\{origin\}\/sitemap-resuelve\.xml/);
 assert.match(server,/escapeHtml\(origin\+'\/sitemap-resuelve\.xml'\)/);
});

test('V3.5.30: sitemap XML only contains validated identifiers and stable canonical links',()=>{
 const {xmlSitemap,xmlText}=require('../src/routes/resuelve-sitemap-v3530');
 const xml=xmlSitemap([
  {id:'4',lastmod:'2026-10-29T10:00:00.000Z'},
  {id:'1<script>',lastmod:'2026-10-29T10:00:00.000Z'},
  {id:'9',lastmod:'not a date'}
 ]);
 assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 assert.match(xml,/https:\/\/redlibertad.com\/resuelve\/solucion\/4/);
 assert.match(xml,/<lastmod>2026-10-29<\/lastmod>/);
 assert.match(xml,/https:\/\/redlibertad.com\/resuelve\/solucion\/9/);
 assert.doesNotMatch(xml,/solucion\/1|script/);
 assert.equal(xmlText('<&>'),'&lt;&amp;&gt;');
});

test('V3.5.30: Article schema cannot inject scripts or manufacture ratings',()=>{
 const {renderApprovedSolution}=require('../src/routes/resuelve-public-seo-v3529');
 const page=renderApprovedSolution({
  id:'48',category:'consejo',
  title:'Prueba </script><script>alert(1)</script>',
  solution:'Texto </script><script>malicioso</script> sobre problemas y experiencias útiles.'
 });
 assert.match(page,/<script type="application\/ld\+json">/);
 assert.match(page,/\\u003c\/script>/);
 assert.doesNotMatch(page,/<script>alert\(1\)<\/script>/);
 assert.doesNotMatch(page,/"aggregateRating"|"ratingValue"/);
 assert.match(page,/"@type":"Article"/);
 assert.match(page,/"mainEntityOfPage":"https:\/\/redlibertad.com\/resuelve\/solucion\/48"/);
 const js=read('public/resuelve-v350.js');
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/q\.seo_public_opt_in,split_part\(a\.body/);
 assert.match(js,/if\(q\.seo_public_opt_in===true\)/);
 assert.match(js,/\/resuelve\/solucion\/'\+encodeURIComponent\(q\.id\)/);
 assert.doesNotThrow(()=>new Function(js));
});