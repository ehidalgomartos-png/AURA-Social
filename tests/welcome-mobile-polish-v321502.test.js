'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html');
const css=read('public/social.css');
const js=read('public/social.js');
const mobilePatch=css.slice(css.indexOf('/* V3.2.150.2'));

test('opciones de bienvenida agrupadas sin duplicados ni renglón solitario',()=>{
  const start=html.indexOf('<div class="home-welcome-actions-v32150">');
  const end=html.indexOf('</section>',start);
  assert.ok(start>=0&&end>start);
  const actions=html.slice(start,end);
  assert.match(actions,/<div class="home-welcome-dismiss-v321502" role="group" aria-label="Opciones de la bienvenida">/);
  assert.match(actions,/data-welcome-preference="later">Ahora no<\/button>/);
  assert.match(actions,/data-welcome-preference="dismiss">No mostrar<\/button>/);
  assert.equal(actions.match(/data-welcome-preference=/g).length,2);
  assert.equal(actions.match(/home-welcome-dismiss-v321502/g).length,1);
  assert.match(actions,/id="homeWelcomeActionV32150"/);
  assert.match(actions,/id="homeWelcomeMoreV32150"/);
});

test('la tarjeta móvil tiene CTA más Ver mis pasos y una fila de opciones de cierre',()=>{
  assert.match(mobilePatch,/@media\(max-width:760px\)/);
  assert.match(mobilePatch,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(mobilePatch,/\.home-welcome-actions-v32150 \.primary\{[\s\S]*?grid-column:1;/);
  assert.match(mobilePatch,/\.home-welcome-actions-v32150 \.home-welcome-more-v32150\{[\s\S]*?grid-column:2;/);
  assert.match(mobilePatch,/\.home-welcome-dismiss-v321502\{[\s\S]*?grid-column:1 \/ -1;/);
  assert.match(mobilePatch,/\.home-welcome-dismiss-v321502 \.home-welcome-later-v32150\{[\s\S]*?min-height:35px/);
  assert.match(mobilePatch,/@media\(max-width:350px\)/);
  assert.match(mobilePatch,/white-space:nowrap/);
});

test('los pasos se pueden desplazar y enfocar sin quedar debajo del dock de navegación',()=>{
  assert.match(mobilePatch,/\.home-growth-details-v3224\{[\s\S]*?scroll-margin-top:calc\(82px \+ env\(safe-area-inset-top\)\)/);
  assert.match(mobilePatch,/\.home-growth-details-v3224\[open\] \.growth-panel\{[\s\S]*?padding-bottom:calc\(26px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mobilePatch,/\.home-growth-details-v3224 \.growth-step,[\s\S]*?scroll-margin-bottom:calc\(var\(--mobile-dock-space,112px\) \+ 12px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/--mobile-dock-space:112px/);
  assert.match(css,/\.social-main\{padding-bottom:calc\(var\(--mobile-dock-space\) \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css,/\.hidden\{display:none!important\}/);
});

test('no se cambian los botones ni las preferencias de servidor de la bienvenida',()=>{
  assert.match(js,/await saveWelcomePreferenceV32150\(welcomePreference\.dataset\.welcomePreference\)/);
  assert.match(js,/api\('\/api\/growth\/welcome\/preference'/);
  assert.match(js,/details\.dataset\.welcomeExpanded='1'/);
  assert.match(js,/details\.classList\.remove\('hidden'\)/);
  assert.match(html,/id="homeGrowthDetailsV3224"/);
  assert.match(html,/id="growthSteps"/);
  assert.match(html,/data-growth-action="profile"/);
});
