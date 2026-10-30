'use strict';
// V3.6.0: invariants across Resuelve flows. No user data, external network, or fake activity.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Resuelve 2.0: public similar search has safe per-IP limits and bounded input',()=>{
 const api=read('src/routes/resuelve-v350.js');
 assert.match(api,/const publicSimilarityLimiter=rateLimit\(\{/);
 assert.match(api,/windowMs:60\*1000,limit:120/);
 assert.match(api,/message:\{error:'demasiadas_busquedas'\}/);
 const block=api.slice(api.indexOf('const publicSimilarityLimiter'),api.indexOf('function checkOrigin'));
 assert.doesNotMatch(block,/req\.user|keyGenerator/);
 assert.match(api,/router\.get\('\/questions\/similar',publicSimilarityLimiter,wrap/);
 assert.match(api,/typeof title!=='string'\|\|title\.length>125\|\|title\.trim\(\)\.length<8/);
 const source=read('src/services/resuelve-v350.js');
 assert.match(source,/ORDER BY reviewed_solution DESC/);
 assert.match(source,/LIMIT 5/);
});

test('Resuelve 2.0: volunteer suggestion data is private and discarded on account change',()=>{
 const client=read('public/resuelve-v350.js'),service=read('src/services/resuelve-v350.js');
 const block=client.slice(client.indexOf('async function loadHelpSuggestions()'),client.indexOf('async function loadHelpAlerts()'));
 assert.match(block,/if\(!state\.user\)return/);
 assert.match(block,/const currentUserId=String\(state\.user\.id\?\?''\)/);
 const checks=block.match(/String\(state\.user\.id\?\?''\)!==currentUserId/g)||[];
 assert.equal(checks.length,2);
 assert.match(block,/request\('\/api\/resuelve\/questions\/for-me'\)/);
 assert.match(block,/selected\.includes\(q\.category\)/);
 assert.match(block,/matches\.slice\(0,3\)/);
 assert.doesNotMatch(block,/write\(|notify|sendEmail|auto.?publish/i);
 assert.match(service,/WHERE q\.status='open' AND q\.author_id<>\$1/);
});

test('Resuelve 2.0: admin statistics are read-only and require permissions',()=>{
 const api=read('src/routes/resuelve-v350.js'),service=read('src/services/resuelve-v350.js');
 assert.match(api,/router\.get\('\/admin\/activity-7d',requireAuth/);
 assert.match(api,/if\(!req\.user\.isAdmin\)return fail\(res,403,'administrador_requerido'\)/);
 const b=service.slice(service.indexOf('async function adminActivity7d()'),service.indexOf('// V3.5.18 — impacto'));
 assert.match(b,/generate_series\(0,6\)/);
 assert.match(b,/a\.status='visible'/);
 assert.match(b,/author\.status='active'/);
 assert.doesNotMatch(b,/email|password|phone|a\.body|q\.body|INSERT|UPDATE|DELETE/);
});

test('Resuelve 2.0: direct signup, indexing consent and mobile-first UX remain separate',()=>{
 const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js'),
  seo=read('src/services/resuelve-v350.js'),css=read('public/resuelve-v350.css');
 assert.match(js,/get\('registro'\)==='1'\)openAuth\('register'\)/);
 assert.match(js,/authSubmit\('\/api\/auth\/register'/);
 assert.match(seo,/seo_public_opt_in BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(seo,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(html,/id="askSimilarPanel"/);
 assert.match(html,/id="helpSuggestions"[^>]*hidden/);
 assert.match(css,/#questionSearchForm #questionSearch/);
 assert.match(css,/#solutionFilterForm #solutionSearch/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotThrow(()=>new Function(js));
});

test('Resuelve 2.0: public article indexing and topic hub eligibility are review-gated',()=>{
 const topic=read('src/services/resuelve-topics-v3531.js'),
  page=read('src/routes/resuelve-topics-v3531.js'),
  resuelveSeo=read('src/routes/resuelve-public-seo-v3529.js');
 assert.match(topic,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
 assert.match(topic,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(page,/items\.length>=3&&counts\[topic\]>=3/);
 assert.match(page,/noindex,follow/);
 assert.match(resuelveSeo,/if\(!item\)return res\.status\(404\)/);
 assert.match(resuelveSeo,/res\.set\('X-Robots-Tag','noindex,nofollow'\)/);
});

test('Resuelve 2.0: help-first content never requires commercial purchase',()=>{
 const intro=read('public/resuelve-como-funciona-v3533.html');
 assert.match(intro,/Sin presión para comprar, contratar o vender/);
 assert.match(intro,/no equivale a tener una acreditación verificada/);
 assert.match(intro,/No por defecto/);
});
