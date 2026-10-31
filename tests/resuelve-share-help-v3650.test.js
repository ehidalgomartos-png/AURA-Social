'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('public/resuelve.html'),js=read('public/resuelve-v350.js');
const css=read('public/resuelve-share-help-v3650.css');
const share='https://redlibertad.com/resuelve?sin_respuestas=1#questions';

test('V3.6.50: invitación de primera ayuda solo dentro del bloque real de peticiones',()=>{
 const start=html.indexOf('id="firstHelpSpotlightV36411"');
 const end=html.indexOf('id="firstHelpListV36411"');
 assert.ok(start>0&&end>start);
 const spotlight=html.slice(start,end);
 assert.match(spotlight,/id="firstHelpShareV3650" class="resuelve-share-help-v3650"/);
 assert.match(spotlight,/<summary>Invitar a alguien a ayudar<\/summary>/);
 assert.match(spotlight,/no incluye datos privados/);
 assert.match(spotlight,/id="firstHelpCopyV3650"/);
 assert.match(spotlight,/id="firstHelpCopyStatusV3650" role="status" aria-live="polite"/);
 assert.match(spotlight,/id="firstHelpLinkV3650"[^>]*readonly hidden/);
 assert.match(spotlight,/rel="noopener noreferrer"/);
 assert.match(spotlight,/href="mailto:\?subject=/);
 assert.match(html,/resuelve-share-help-v3650\.css\?v=3\.6\.50/);
 assert.doesNotMatch(spotlight,/\/api\/|id=\d+|\buserId\b|\bemailAddress\b/);
});

test('V3.6.50: WhatsApp y correo solo comparten el enlace público y genérico',()=>{
 const w=html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1];
 const m=html.match(/href="(mailto:\?subject=[^"]+)"/)?.[1];
 assert.ok(w&&m);
 const whatsappText=new URL(w).searchParams.get('text');
 assert.ok(whatsappText.includes(share));
 assert.ok(!whatsappText.includes('/api/'));
 const emailBody=new URL(m.replaceAll('&amp;','&')).searchParams.get('body');
 assert.ok(emailBody.includes(share));
 assert.ok(!emailBody.includes('token='));
 assert.ok(html.includes('value="'+share+'"'));
});

test('V3.6.50: el enlace abre solo el filtro público de peticiones sin respuestas',()=>{
 assert.match(js,/get\('sin_respuestas'\)===\x271\x27/);
 assert.match(js,/state\.filter=\x27unanswered\x27/);
 assert.match(js,/tab\.dataset\.filter===\x27unanswered\x27/);
 assert.match(js,/tab\.setAttribute\(\x27aria-pressed\x27/);
 assert.match(js,/params\.set\(\x27sin_respuestas\x27,\x27si\x27\)/);
 assert.match(js,/el\(\x27firstHelpCopyV3650\x27\)\.addEventListener\(\x27click\x27/);
 assert.match(js,/navigator\.clipboard\.writeText\(link\.value\)/);
 assert.match(js,/if\(!navigator\.clipboard\?\.writeText\)/);
 assert.match(js,/link\.select\(\)/);
 assert.doesNotMatch(js,/fetch\(\x27https:\/\/wa\.me/);
});

test('V3.6.50: diseño móvil, foco accesible y controles sin superposición',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css, /#firstHelpShareV3650 summary\{[^}]*min-height:46px/);
 assert.match(css, /\.resuelve-share-help-actions-v3650 :is\(a,button\)\{[^}]*min-height:44px/);
 assert.match(css, /#firstHelpShareV3650 :is\(a,button,summary,input\):focus-visible/);
 assert.doesNotMatch(css,/position:fixed|display:none!important/);
});
