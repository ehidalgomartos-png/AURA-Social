'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.29: every indexable solution requires explicit opt-in and prior human approval',()=>{
 const code=read('src/services/resuelve-v350.js');
 const query=code.slice(code.indexOf('async function publicSeoSolution('),code.indexOf('async function reopen('));
 assert.match(code,/seo_public_opt_in BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(query,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(query,/q\.status='resolved' AND q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(query,/a\.status='visible'/);
 assert.match(query,/author.status='active'/);
 assert.match(query,/respondent.status='active'/);
 assert.match(query,/char_length\(trim\(split_part\(a\.body/);
 assert.match(query,/char_length\(trim\(q\.body\)\)>=50/);
 assert.doesNotMatch(query,/email|phone|password|moderator|reporter_id/);
 assert.match(code,/seo_public_opt_in=FALSE,solved_at=NULL/);
 assert.match(code,/WHERE id=\$1 AND author_id=\$2 AND status='resolved' AND library_opt_out=FALSE/);
});

test('V3.5.29: permission is owner-only, boolean, origin-protected and revocable',()=>{
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(routes,/router\.get\('\/questions\/:id\/seo-consent',requireAuth/);
 assert.match(routes,/router\.post\('\/questions\/:id\/seo-consent',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(routes,/typeof req\.body\?\.enabled!=='boolean'/);
 assert.match(routes,/service\.setSeoConsent\(req\.user\.id,req\.params\.id,req\.body\.enabled\)/);
 assert.match(routes,/service\.getSeoConsent\(req\.user\.id,req\.params\.id\)/);
 const js=read('public/resuelve-v350.js');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/function seoConsentControls\(q,reviewed\)/);
 assert.match(js,/if\(mine&&solved&&!q\.library_opt_out\)/);
 assert.match(js,/write\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(q\.id\)\+'\/seo-consent',\{enabled\}\)/);
 assert.match(js,/link\.hidden=!enabled\|\|!reviewed/);
 assert.match(js,/Retirar permiso de buscadores/);
});

test('V3.5.29: server-rendered public page is safe, canonical and based on approved content',()=>{
 const {renderApprovedSolution,escapeHtml}=require('../src/routes/resuelve-public-seo-v3529');
 const html=renderApprovedSolution({
  id:'123',title:'Cómo arreglar <script>peligroso</script> "problema"',
  solution:'Consejo con <img src=x onerror=alert(1)> y otra recomendación útil',
  category:'ayuda'
 });
 assert.match(html,/meta name="robots" content="index,follow"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/resuelve\/solucion\/123"/);
 assert.match(html,/&lt;script&gt;peligroso&lt;\/script&gt;/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script>peligroso<\/script>|<img src=x onerror=/);
 assert.match(html,/revisada antes de publicarse/);
 assert.equal(escapeHtml('&'), '&amp;');
 assert.throws(()=>renderApprovedSolution({id:'../456',title:'Test',solution:'test'}),/invalid_id/);
 const source=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(source,/res\.set\('Cache-Control','no-store'\)/);
 assert.match(source,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
 assert.match(source,/if\(!item\)return res\.status\(404\)/);
 assert.match(source,/res\.set\('X-Robots-Tag','index,follow'\)/);
 const server=read('server.js');
 assert.match(server,/app\.use\('\/resuelve',resuelvePublicSeoV3529\)/);
 assert.ok(server.indexOf("app.use('/resuelve',resuelvePublicSeoV3529)")<server.indexOf("app.get('*',"));
});