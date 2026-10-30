'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.34: both search fields and both category selects have rounded edges',()=>{
 const css=read('public/resuelve-v350.css');
 const html=read('public/resuelve.html');
 for(const id of ['questionSearch','solutionSearch','solutionCategory','questionCategoryFilter']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.ok(css.includes('#questionSearchForm #'+id)||css.includes('#solutionFilterForm #'+id),id);
 }
 const block=css.slice(css.indexOf('/* V3.5.34'));
 assert.match(block,/border-radius:13px/);
 assert.match(block,/min-height:48px/);
 assert.match(block,/border:1px solid #adbfcd/);
 assert.match(block,/font-size:16px/);
 assert.match(block,/outline:2px solid #12648b/);
 assert.match(block,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(block,/appearance:none|outline:none/);
});

test('V3.5.34: styles do not modify checkbox inputs or hide mobile native select indicator',()=>{
 const css=read('public/resuelve-v350.css');
 const section=css.slice(css.indexOf('/* V3.5.34'));
 assert.match(section,/#questionSearchForm #questionSearch/);
 assert.match(section,/#solutionFilterForm #solutionSearch/);
 assert.match(section,/#solutionFilterForm #solutionCategory/);
 assert.doesNotMatch(section,/input\[type=checkbox\]|select\s*\{|\.editor\s+input/);
 assert.match(section,/border-radius:17px;overflow:visible/);
});
