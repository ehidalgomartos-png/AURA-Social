'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const css=read('public/social.css');
const html=read('public/app.html');

test('push checkboxes override the generic modal input width, padding and flex sizing',()=>{
  const generic='.modal-card label input{width:100%;';
  const specific='.account-modal-card .push-preference-options > label > input[type="checkbox"]{';
  const before=css.indexOf(generic),start=css.indexOf(specific);
  assert.ok(before>=0,'shared text input styles still exist');
  assert.ok(start>before,'specific checkbox override should follow generic rule');
  const rule=css.slice(start,css.indexOf('}',start));
  for(const declaration of ['width:19px;','min-width:19px;','max-width:19px;',
    'height:19px;','flex:0 0 19px;','padding:0;','margin:0;','appearance:auto;']){
    assert.ok(rule.includes(declaration),declaration);
  }
  assert.match(rule,/accent-color:var\(--teal\)/);
});

test('labels and text shrink within each card without clipping on mobile',()=>{
  assert.match(css,/\.account-modal-card \.push-preference-options > label\{\s*width:100%;\s*min-width:0;\s*max-width:100%/);
  assert.match(css,/\.account-modal-card \.push-preference-options > label > span\{\s*min-width:0;\s*flex:1 1 auto;\s*overflow-wrap:anywhere/);
  assert.match(css,/\.account-modal-card \.push-preference-options\{\s*grid-template-columns:minmax\(0,1fr\);/);
  assert.match(css,/\.account-modal-card \.push-preference-options > label\{\s*min-height:64px/);
  assert.match(css,/\.push-preference-options input:focus-visible/);
});

test('six existing push categories remain operable and only Account modal styling changes',()=>{
  const start=html.indexOf('<form id="pushPreferencesForm"');
  const end=html.indexOf('</form>',start);
  assert.ok(start>=0 && end>start);
  const form=html.slice(start,end);
  for(const name of ['messages','mentions','interactions','community','consents','system']){
    assert.match(form,new RegExp('<label><input type="checkbox" name="'+name+'" checked>'));
  }
  assert.match(form,/id="pushPreferencesSave"/);
  assert.match(form,/type="submit"/);
});

test('hotfix has a new release version and busts social CSS cache without changing PWA assets',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.75');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.75'/);
  assert.match(html,/\/social\.css\?v=3\.2\.75/);
  assert.match(html,/\/social\.js\?v=3\.2\.75/);
  assert.match(html,/\/pwa\.js\?v=3\.2\.39/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:push-settings-mobile/);
});
