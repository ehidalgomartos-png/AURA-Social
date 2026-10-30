'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('V3.5.17: invitar a ayudar ofrece canales reales y no comparte automáticamente',()=>{
 const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js');
 for(const id of ['inviteHelpSection','inviteHelpToggle','inviteHelpOptions',
  'inviteWhatsApp','inviteTelegram','inviteEmail','inviteNativeShare','inviteCopyLink','inviteHelpStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-expanded="false" aria-controls="inviteHelpOptions"/);
 assert.match(html,/id="inviteHelpOptions" class="invite-help-options" hidden/);
 assert.match(html,/Ayuda a otras personas/i);
 assert.match(html,/Invita a ayudar/);
 assert.match(js,/https:\/\/api\.whatsapp\.com\/send\?/);
 assert.match(js,/https:\/\/t\.me\/share\/url\?/);
 assert.match(js,/mailto:\?/);
 assert.match(js,/navigator\.share\(\{title:'Ayuda a otras personas en Resuelve',text,url\}\)/);
 assert.match(js,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(js,/bindHelpInvitation\(\)/);
 assert.doesNotMatch(js,/api\/posts.*inviteHelp|inviteHelp.*api\/posts/);
});
test('V3.5.17: publicación solo con borrador editable, sin extraer soluciones ajenas',()=>{
 const js=read('public/resuelve-v350.js');
 const social=read('public/social.js');
 const service=read('src/services/resuelve-v350.js');
 const route=read('src/routes/resuelve-v350.js');
 assert.match(js,/if\(mine&&solved\)\{/);
 assert.match(js,/Publícalo en RedLibertad/);
 assert.match(js,/compartirResuelve=/);
 assert.match(js,/Dar las gracias/);
 assert.match(social,/async function prepareResuelveSolvedPostV3517\(id\)/);
 assert.match(social,/await api\('\/api\/resuelve\/questions\/'\+encodeURIComponent\(id\)\+'\/share-preview'\)/);
 assert.match(social,/await openModal\('post'\)/);
 assert.match(social,/caption\.dispatchEvent\(new Event\('input'/);
 assert.match(social,/params\.delete\('compartirResuelve'\)/);
 assert.match(social,/Revisa el texto y su privacidad antes de publicar/);
 const fn=social.slice(social.indexOf('async function prepareResuelveSolvedPostV3517'),social.indexOf('async function handleInitialDeepLink'));
 assert.doesNotMatch(fn,/api\/posts|\.submit\(|post\('post'/);
 assert.match(service,/async function shareResolvedPreview\(userId,qid\)/);
 assert.match(service,/q\.author_id=\$2 AND q\.status='resolved'/);
 assert.match(service,/SELECT q\.id,q\.title FROM resuelve_questions q/);
 assert.doesNotMatch(service.slice(service.indexOf('async function shareResolvedPreview'),service.indexOf('async function reopen')),/a\.body/);
 assert.match(route,/router\.get\('\/questions\/:id\/share-preview',requireAuth/);
 assert.match(route,/router\.post\('\/questions\/:id\/thank',requireAuth,checkOrigin/);
 assert.match(service,/thanked_at IS NULL/);
});

test('V3.5.17.2: invitación situada al final, por debajo de peticiones, soluciones y detalle',()=>{
 const html=read('public/resuelve.html');
 const invite=html.indexOf('id="inviteHelpSection"');
 const questions=html.indexOf('id="questions"');
 const solutions=html.indexOf('id="solutions"');
 const detail=html.indexOf('id="detailPanel"');
 const mainEnd=html.indexOf('</main>');
 const footer=html.indexOf('<footer class="foot">');
 assert.ok(questions>=0&&solutions>questions&&detail>solutions);
 assert.ok(invite>detail&&invite<mainEnd&&mainEnd<footer,
  'El módulo para invitar debe aparecer al final del contenido, antes del pie.');
 assert.equal(html.match(/id="inviteHelpSection"/g).length,1);
 assert.match(html.slice(invite,mainEnd),/id="inviteHelpToggle"/);
 assert.match(html.slice(invite,mainEnd),/id="inviteHelpOptions"/);
 assert.match(html.slice(invite,mainEnd),/id="inviteWhatsApp"/);
 assert.match(html.slice(invite,mainEnd),/id="inviteCopyLink"/);
});
