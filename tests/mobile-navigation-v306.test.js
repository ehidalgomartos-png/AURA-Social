'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/app.html'),css=read('public/social.css'),js=read('public/social.js');
const nav=html.slice(html.indexOf('<nav class="bottom-nav"'),html.indexOf('</nav>',html.indexOf('<nav class="bottom-nav"'))+6);
const styles=css.slice(css.indexOf('/* V3.0.6 — expressive mobile navigation'));

test('mobile dock retains exactly 5 tabs with existing navigation actions',()=>{
  assert.equal((nav.match(/<button\b/g)||[]).length,5);
  for(const key of ['data-view="feed"','data-view="explore"','data-action="create"','data-view="messages"','data-view="profile"']){
    assert.ok(nav.includes(key),key);
  }
});
test('four destination icons use SVG not font-dependent text glyphs',()=>{
  assert.equal((nav.match(/class="bottom-nav-icon"/g)||[]).length,4);
  assert.equal((nav.match(/<svg\b/g)||[]).length,5);
  assert.doesNotMatch(nav,/<b>[⌂⌕✉○]<\/b>/);
  for(const glyph of ['Inicio','Explorar','Crear','Mensajes','Perfil'])assert.ok(nav.includes('<small>'+glyph+'</small>'));
});
test('accessible icons are decorative and leave readable labels',()=>{
  assert.equal((nav.match(/aria-hidden="true"/g)||[]).length,5);
  assert.equal((nav.match(/focusable="false"/g)||[]).length,5);
  assert.equal((nav.match(/type="button"/g)||[]).length,5);
  assert.match(nav,/aria-label="Navegación principal móvil"/);
});
test('new message icon preserves badge and notification behavior',()=>{
  assert.match(nav,/id="messageBadgeMobile" class="mobile-nav-badge hidden"/);
  assert.match(nav,/class="bottom-icon-wrap"/);
  assert.match(js,/messageBadgeMobile/);
});
test('active destination remains synchronized with existing view switching',()=>{
  assert.match(js,/b\.classList\.toggle\('active',current\)/);
  assert.match(js,/b\.setAttribute\('aria-current','page'\)/);
  assert.match(nav,/data-view="feed" class="active"/);
});
test('brand uses thicker outlined icons and visible active state',()=>{
  assert.match(styles,/\.bottom-nav-icon\{[\s\S]*?stroke-width:2\.2/);
  assert.match(styles,/\.bottom-nav button\.active \.bottom-nav-icon\{stroke-width:2\.6/);
  assert.match(styles,/\.bottom-nav button\.active\{[\s\S]*?background:#e7f7f4/);
  assert.match(styles,/\.bottom-nav button\{[\s\S]*?color:#425569/);
});
test('opaque dock prevents images appearing through navigation surface',()=>{
  assert.match(styles,/\.bottom-nav\{[\s\S]*?background:#fffdf9/);
  assert.match(styles,/\.bottom-nav\{[\s\S]*?backdrop-filter:none/);
  assert.match(styles,/\.bottom-nav\{[\s\S]*?isolation:isolate/);
});
test('Create remains central brand action with a distinct SVG plus',()=>{
  assert.match(nav,/data-action="create" class="create-mobile"/);
  assert.match(nav,/bottom-nav-create-icon/);
  assert.match(styles,/\.bottom-nav \.create-mobile b\{[\s\S]*?border-radius:50%/);
  assert.match(styles,/\.bottom-nav-create-icon\{[\s\S]*?stroke:#fff/);
  assert.match(js,/data-action/);
});
test('buttons have accessible focus treatment and mobile tap targets',()=>{
  assert.match(styles,/min-height:60px/);
  assert.match(styles,/\.bottom-nav button:focus-visible\{outline:3px/);
  assert.match(styles,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
test('post feed clears floating dock when scrolling to bottom',()=>{
  assert.match(styles,/--mobile-dock-space:112px/);
  assert.match(styles,/\.social-main\{padding-bottom:calc\(var\(--mobile-dock-space\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles,/#profileView #profilePosts\.own-profile-feed\{[\s\S]*?padding-bottom:calc\(var\(--mobile-dock-space\) \+ env\(safe-area-inset-bottom\)\)/);
});
test('narrow phones and reduced motion remain supported',()=>{
  assert.match(styles,/@media\(max-width:380px\)/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles,/\.bottom-nav-icon\{transition:none!important\}/);
});
test('dock is mobile-only and keyboard-open safeguards remain',()=>{
  assert.match(styles,/@media\(max-width:760px\)/);
  assert.match(css,/body\.keyboard-open \.bottom-nav\{/);
  assert.match(css,/body\.keyboard-open \.social-main\{/);
  assert.match(css,/\.bottom-nav\{\s*left:max\(6px,env\(safe-area-inset-left\)\)/);
});
test('release and CI contain navigation polish regression check',()=>{
  const pkg=require('../package.json');
  assert.equal(pkg.version,'3.0.6');
  assert.match(read('server.js'),/const APP_VERSION='3\.0\.6'/);
  assert.match(pkg.scripts['test:mobile-nav'],/mobile-navigation-v306\.test\.js/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:mobile-nav/);
});
