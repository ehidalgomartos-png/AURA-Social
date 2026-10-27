'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('public/home-growth-desktop-v33242.css');
const html=read('public/app.html');
const sw=read('public/sw.js');
const social=read('public/social.js');
const workflow=read('.github/workflows/validate-js.yml');
test('desktop-specific stylesheet loaded after existing social.css and versioned for PWA',()=>{
  assert.equal(html.split('home-growth-desktop-v33242.css?v=3.3.24.2').length-1,1);
  assert.ok(html.indexOf('home-growth-desktop-v33242.css')>html.indexOf('/social.css?v='));
  assert.ok(sw.includes("'/home-growth-desktop-v33242.css'"));
  assert.ok(workflow.includes('node --test tests/home-growth-desktop-v33242.test.js'));
});
test('desktop only: no mobile layout modifications or new JavaScript handlers',()=>{
  assert.match(css,/@media\(min-width:761px\)/);
  assert.match(css,/@media\(min-width:1180px\)/);
  assert.doesNotMatch(css,/@media\(max-width|@media\s*\(width|@media\s*\(min-width:\s*[0-6][0-9]{0,2}px/);
  assert.doesNotMatch(css,/!important|display:none|position:absolute|pointer-events:none|overflow-x:auto|localStorage|fetch\(/);
  assert.match(html,/<details id="homeGrowthDetailsV3224"/);
  assert.match(html,/id="growthStarterPeople"/);
  assert.match(html,/id="growthStarterCommunityList"/);
  assert.match(html,/id="growthInviteNative"/);
});
test('expands 700px desktop panel, prevents invite from stretching and keeps narrow desktop safe',()=>{
  assert.match(read('public/social.css'),/overflow:hidden;max-width:700px/);
  assert.match(css,/#feedView #homeGrowthDetailsV3224\s*\{[^}]*width:100%;[^}]*max-width:none;/s);
  assert.match(css,/#feedView #homeGrowthDetailsV3224 \.growth-panel\s*\{[^}]*grid-template-columns:minmax\(0,1fr\);[^}]*align-items:start;/s);
  assert.match(css,/#feedView #homeGrowthDetailsV3224 \.growth-invite\s*\{[^}]*min-width:0;[^}]*align-self:start;/s);
  assert.match(css,/grid-template-columns:minmax\(0,2\.2fr\) minmax\(300px,\.95fr\)/);
});
test('names and Follow buttons occupy separate rows even with long user names',()=>{
  assert.match(css,/\.growth-starter-list \.person-card\.compact\s*\{[^}]*grid-template-columns:42px minmax\(0,1fr\);[^}]*grid-template-rows:auto auto;/s);
  assert.match(css,/\.growth-starter-list \.person-copy\s*\{[^}]*grid-column:2;[^}]*grid-row:1;[^}]*overflow:hidden;/s);
  assert.match(css,/\.growth-starter-list \.person-copy b\s*\{[^}]*-webkit-line-clamp:2;[^}]*overflow-wrap:anywhere;/s);
  assert.match(css,/\.growth-starter-list \.person-card-actions\s*\{[^}]*grid-column:2;[^}]*grid-row:2;/s);
  assert.match(social,/function personCardHTML\(/);
  assert.match(social,/data-suggest-follow=/);
});
test('top steps and genuine recommendations use available room on wide desktop',()=>{
  assert.match(css,/#feedView #homeGrowthDetailsV3224 \.growth-onboarding\s*\{[^}]*display:grid;[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/s);
  assert.match(css,/\.growth-next-step\s*\{[^}]*grid-column:1;[^}]*grid-row:3;/s);
  assert.match(css,/\.growth-steps\s*\{[^}]*grid-column:2;[^}]*grid-row:3;/s);
  assert.match(css,/\.growth-starter\s*\{[^}]*grid-column:1\/-1;[^}]*grid-row:4;/s);
  assert.match(css,/\.growth-community-starter\s*\{[^}]*grid-column:1\/-1;[^}]*grid-row:5;/s);
});
