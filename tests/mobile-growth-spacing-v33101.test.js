'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('public/social.css'),html=read('public/app.html');
const mobileBlock=css.slice(css.indexOf('/* V3.2.151 —'),css.indexOf('/* V3.2.152 —'));
test('opening first steps no longer reserves an entire mobile dock as a bottom gap',()=>{
  assert.match(mobileBlock,/@media\(max-width:760px\)/);
  assert.match(mobileBlock,/#feedView \.home-growth-details-v3224\[open\]\s*\{\s*margin-bottom:10px;\s*\}/);
  assert.doesNotMatch(css,/#feedView \.home-growth-details-v3224\[open\]\s*\{\s*margin-bottom:\s*calc\(var\(--mobile-dock-space/);
  assert.match(css,/#feedView \.home-growth-details-v3224\{margin-bottom:10px;border-radius:13px\}/);
});
test('focused steps remain safely scrollable above fixed bottom navigation',()=>{
  assert.match(css,/--mobile-dock-space:112px/);
  assert.match(css,/\.social-main\{padding-bottom:calc\(var\(--mobile-dock-space\) \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css,/#feedView \.home-growth-details-v3224 \.growth-step,[\s\S]*?scroll-margin-bottom:calc\(var\(--mobile-dock-space,112px\) \+ 12px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/#feedView \.home-growth-details-v3224\[open\] \.growth-panel\{[\s\S]*?padding-bottom:calc\(26px \+ env\(safe-area-inset-bottom\)\)/);
});
test('the same collapsible growth section still leads directly into actual feed posts',()=>{
  const start=html.indexOf('<details id="homeGrowthDetailsV3224"');
  const end=html.indexOf('<div class="content-layout">',start);
  assert.ok(start>=0&&end>start);
  const section=html.slice(start,end);
  assert.match(section,/id="growthPanel"/);
  assert.match(section,/id="growthNextStep"/);
  assert.match(section,/id="growthStarterPeople"/);
  assert.match(section,/id="growthStarterCommunities"/);
  assert.match(section,/class="growth-invite"/);
  assert.match(section,/<\/section>\s*<\/details>\s*$/);
  assert.match(html.slice(end,end+600),/id="feed"/);
});
test('stylesheet URL changes for existing PWA/browser caches, without duplicating onboarding',()=>{
  assert.match(html,/\/social\.css\?v=(?:3\.2\.75&amp;growth-gap-fix=3\.3\.10\.1|3\.3\.11)/);
  assert.equal((html.match(/id="homeGrowthDetailsV3224"/g)||[]).length,1);
  assert.equal((html.match(/class="growth-invite"/g)||[]).length,1);
  const workflow=read('.github/workflows/validate-js.yml');
  assert.match(workflow,/node --test tests\/mobile-growth-spacing-v33101\.test\.js/);
});
