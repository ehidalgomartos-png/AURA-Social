'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.25: public helper profiles are always opt-in, never identity-guessable',()=>{
 const service=read('src/services/resuelve-v350.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(service,/CREATE TABLE IF NOT EXISTS resuelve_helper_profiles_v3525/);
 assert.match(service,/enabled BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(service,/p\.enabled=true/);
 assert.match(service,/LOWER\(u\.username\)=LOWER\(\$1\) AND u\.status='active'/);
 assert.match(service,/a\.status='visible'/);
 assert.match(service,/q\.status<>'hidden'/);
 assert.match(service,/count\(DISTINCT q\.id\)::int/);
 assert.doesNotMatch(service.slice(service.indexOf('async function publicHelperProfile('),service.indexOf('async function getHelpAlertPreference(')),/u\.email|u\.password|u\.phone|u\.birth/i);
 assert.match(routes,/router\.get\('\/helper-profile\/preference',requireAuth/);
 assert.match(routes,/router\.post\('\/helper-profile\/preference',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(routes,/router\.get\('\/helpers\/:username'/);
 assert.match(routes,/if\(!item\)return fail\(res,404,'perfil_no_disponible'\)/);
 assert.match(routes,/req\.user\.id,req\.body\.enabled/);
});

test('V3.5.25: consent is separate from category or email preferences',()=>{
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/async function setHelperProfilePreference\(userId,enabled\)/);
 assert.match(service,/if\(typeof enabled!=='boolean'\)return null/);
 const choices=service.slice(service.indexOf('async function setHelpTopics'),service.indexOf('async function getHelpAlertPreference'));
 assert.doesNotMatch(choices,/setHelperProfilePreference\(/);
 const html=read('public/resuelve.html');
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/id="helperProfileSettings"[^>]*hidden/);
 assert.match(html,/id="helperProfileToggle" type="checkbox" disabled/);
 assert.match(html,/id="helperPublicPanel"[^>]*hidden/);
 assert.match(html,/id="helperProfileShare" href="#" hidden/);
});

test('V3.5.25: rendered opt-in public profile uses only safe text, realistic stats',()=>{
 const js=read('public/resuelve-v350.js');
 const css=read('public/resuelve-v350.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/request\('\/api\/resuelve\/helper-profile\/preference'\)/);
 assert.match(js,/write\('\/api\/resuelve\/helper-profile\/preference',\{enabled:toggle\.checked\}\)/);
 assert.match(js,/\/resuelve\?colaborador=/);
 assert.match(js,/request\('\/api\/resuelve\/helpers\/'\+encodeURIComponent\(username\)\)/);
 assert.match(js,/Number\.isSafeInteger\(value\)/);
 assert.match(js,/el\('helperProfileSettings'\)\.hidden=guest/);
 assert.match(js,/Este perfil no está disponible o su propietario ha desactivado la visibilidad/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(css,/\.helper-public-panel/);
});