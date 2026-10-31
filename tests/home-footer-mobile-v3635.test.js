'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('public/styles.css'),html=read('public/index.html'),consent=read('public/meta-pixel-consent.js');
const section=css.slice(css.indexOf('/* V3.6.35 — Pie legal móvil'));

test('V3.6.35: pie de página conserva marca, enlaces legales y ajustes de cookies',()=>{
  assert.match(html,/<footer class="site-footer">/);
  assert.match(html,/<nav class="site-footer-legal" aria-label="Información legal">/);
  for(const url of ['/guias','/marketplace/explorar','/legal/','/privacy/','/cookies/','/terms/','/community-guidelines/','/moderation/']){
    assert.ok(html.includes('href="'+url+'"'),url);
  }
  assert.match(html,/id="metaCookieSettings"/);
  assert.match(consent,/getElementById\('metaCookieSettings'\)/);
  assert.match(consent,/manage.addEventListener\('click', showPreferences\)/);
});
test('V3.6.35: cuadrícula móvil accesible y sin huecos irregulares',()=>{
  assert.ok(section.startsWith('/* V3.6.35'));
  assert.match(section,/@media\(max-width:639px\)/);
  assert.match(section,/\.site-footer-legal\{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(section,/min-height:44px/);
  assert.match(section,/overflow-wrap:break-word/);
  assert.match(section,/#metaCookieSettings/);
  assert.match(section,/:focus-visible/);
  assert.match(section,/safe-area-inset-bottom/);
  assert.match(section,/@media\(max-width:339px\)/);
  assert.match(section,/grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(section,/display:none|visibility:hidden|position:fixed/);
});
test('V3.6.35: CSS versionado y escritorio intacto',()=>{
  assert.match(html,/\/styles\.css\?v=3\.6\.\d+/);
  assert.match(css,/@media\(min-width:640px\)/);
  assert.ok(css.indexOf('/* V3.6.35')>css.indexOf('/* V3.6.9'));
  assert.match(html,/id="loginForm"/);
  assert.match(html,/id="registerForm"/);
});
