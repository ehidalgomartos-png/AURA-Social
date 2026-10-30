'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('V3.6.7: tarjetas y bloques públicos tienen radios homogéneos y diseño móvil',()=>{
 const css=read('public/resuelve-v350.css');
 const html=read('public/resuelve.html');
 const section=css.slice(css.indexOf('/* V3.6.7'));
 assert.ok(section.startsWith('/* V3.6.7'), 'Existe bloque de estilos');
 for(const selector of ['.hero','.panel','.question-card','.solution-card','.answer','.resuelve-help-suggestion','.resuelve-pending-card','.resuelve-saved-item','.resuelve-similar-panel']){
  assert.ok(section.includes(selector), selector);
 }
 assert.match(section,/--resuelve-radius-panel:24px/);
 assert.match(section,/--resuelve-radius-card:21px/);
 assert.match(section,/@media\(max-width:650px\)/);
 assert.match(section,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(section,/\[hidden\]|display:none|overflow:hidden/);
 assert.match(html,/id="questionList" class="cards"/);
 assert.match(html,/id="solutions" class="section"/);
});

test('V3.6.7: panel privado y moderación general conservan su estructura y límites',()=>{
 const admin=read('src/views/resuelve-admin-v3519.html');
 const css=read('public/resuelve-admin-v3519.css');
 const general=read('public/admin.css');
 const block=css.slice(css.indexOf('/* V3.6.7'));
 assert.match(admin,/noindex,nofollow,noarchive/);
 assert.match(admin,/id="resuelveAdminContent" hidden/);
 assert.match(admin,/class="resuelve-admin-work-card"/);
 assert.match(block,/\.resuelve-admin-wrap \.panel/);
 assert.match(block,/\.resuelve-admin-wrap \.review-item/);
 assert.match(block,/\.resuelve-admin-work-card/);
 assert.match(block,/@media\(max-width:650px\)/);
 assert.match(block,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(general,/\/\* V3\.6\.7[\s\S]*main>\.panel,\.metrics \.metric\{border-radius:22px\}/);
});
