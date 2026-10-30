'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.23: alerts default off and use separate explicit user consent',()=>{
 const service=read('src/services/resuelve-v350.js');
 const routes=read('src/routes/resuelve-v350.js');
 assert.match(service,/ADD COLUMN IF NOT EXISTS notify_new_questions BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.match(service,/async function getHelpAlertPreference\(userId\)/);
 assert.match(service,/async function setHelpAlertPreference\(userId,enabled\)/);
 assert.match(service,/if\(typeof enabled!=='boolean'\)return null/);
 assert.match(service,/p\.notify_new_questions=true/);
 assert.match(routes,/router\.get\('\/help-alerts\/preference',requireAuth/);
 assert.match(routes,/router\.post\('\/help-alerts\/preference',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(routes,/typeof req\.body\?\.enabled!=='boolean'/);
 assert.match(routes,/service\.setHelpAlertPreference\(req\.user\.id,req\.body\.enabled\)/);
});

test('V3.5.23: new question alerts are bounded, private and exclude spam and self',()=>{
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/async function notifyVolunteers\(questionId,authorId,category\)/);
 assert.match(service,/if\(!validId\(questionId\)\|\|!validId\(authorId\)\|\|!CATEGORIES\.includes\(category\)\)return/);
 assert.match(service,/p\.notify_new_questions=true AND \$3=ANY\(p\.categories\)/);
 assert.match(service,/p\.user_id<>\$2/);
 assert.match(service,/u\.status='active'/);
 assert.match(service,/NOT EXISTS\(SELECT 1 FROM blocks/);
 assert.match(service,/NOT EXISTS\(SELECT 1 FROM mutes/);
 assert.match(service,/n\.created_at>=now\(\)-interval '24 hours'/);
 assert.match(service,/ORDER BY p\.user_id LIMIT 20/);
 assert.match(service,/if\(row\)await notifyVolunteers\(row\.id,userId,data\.category\)/);
 assert.match(service,/console\.warn\('Resuelve: avisos voluntarios no disponibles'/);
 assert.doesNotMatch(service,/auto.?answer|virtual.?profile/i);
});

test('V3.5.23: selection of categories alone never enables alerts',()=>{
 const html=read('public/resuelve.html');
 const js=read('public/resuelve-v350.js');
 assert.match(html,/id="helpAlertsToggle" disabled/);
 assert.match(html,/máximo un aviso al día/);
 assert.match(js,/async function loadHelpAlerts\(\)/);
 assert.match(js,/\/api\/resuelve\/help-alerts\/preference/);
 assert.match(js,/write\('\/api\/resuelve\/help-alerts\/preference',\{enabled:toggle\.checked\}\)/);
 const save=js.slice(js.indexOf('async function saveHelpTopics('),js.indexOf('async function loadList('));
 assert.doesNotMatch(save,/help-alerts\/preference/);
 assert.doesNotThrow(()=>new Function(js));
});