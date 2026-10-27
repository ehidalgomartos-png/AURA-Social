'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const css=read('public/social.css');
const html=read('public/app.html');
const js=read('public/social.js');
const start=css.indexOf('/* V3.3.13.1 — Inicio escritorio:');
assert.ok(start>0,'Desktop home fix must exist');
const end=css.indexOf('/* V3.3.14 — Explorar',start);
assert.ok(end>start,'Desktop regression checks only V3.3.13.1 rules');
const desktop=css.slice(start,end);

test('desktop cards reserve a separate grid row for the Follow button',()=>{
  assert.match(desktop,/@media\(min-width:761px\)/);
  assert.match(desktop,/#feedView \.home-momentum \.active-person-card\s*\{[^}]*grid-template-columns:44px minmax\(0,1fr\);[^}]*grid-template-rows:auto auto;/s);
  assert.match(desktop,/#feedView \.home-momentum \.active-person-copy\s*\{[^}]*grid-column:2;[^}]*grid-row:1;/s);
  assert.match(desktop,/#feedView \.home-momentum \.active-person-card>\.person-follow\s*\{[^}]*grid-column:2;[^}]*grid-row:2;/s);
  assert.match(desktop,/#feedView \.home-momentum \.active-person-card>\.active-person-profile\s*\{[^}]*grid-column:1;[^}]*grid-row:1 \/ 3;/s);
});

test('long names wrap within their own cell and cannot cover actions',()=>{
  assert.match(desktop,/#feedView \.home-momentum \.active-person-name\s*\{[^}]*display:block;[^}]*max-width:100%;[^}]*min-width:0;/s);
  assert.match(desktop,/#feedView \.home-momentum \.active-person-copy b\s*\{[^}]*-webkit-line-clamp:2;[^}]*white-space:normal;[^}]*overflow:hidden;[^}]*overflow-wrap:anywhere;/s);
  assert.match(desktop,/\.active-person-card>\.person-follow\s*\{[^}]*min-height:36px;[^}]*max-width:100%;/s);
});

test('existing two-profile mobile swipe remains unchanged',()=>{
  const mobile=css.slice(css.indexOf('/* V3.2.149.1 — Tarjetas completas'));
  assert.match(mobile,/@media\(max-width:760px\)/);
  assert.match(mobile,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile,/grid-auto-columns:100%/);
  assert.match(desktop,/@media\(min-width:761px\)/);
  assert.doesNotMatch(desktop,/@media\(max-width:760px\)/);
});

test('existing real profile links and follow action remain wired',()=>{
  const begin=js.indexOf('function activePersonHTML(user)');
  const end=js.indexOf('function readLastHomeVisit()',begin);
  const render=js.slice(begin,end);
  assert.match(render,/class="active-person-card"/);
  assert.match(render,/active-person-profile/);
  assert.match(render,/active-person-name/);
  assert.match(render,/class="person-follow/);
  assert.match(render,/data-suggest-follow="/);
  assert.match(html,/id="activePeople" class="active-people-strip"/);
  assert.match(html,/home-cards=3\.3\.13\.1/);
  assert.doesNotMatch(desktop,/localStorage|fetch\(|api\(|tracking|animation|position:absolute/);
});
