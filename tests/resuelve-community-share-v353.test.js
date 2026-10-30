'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('V3.5.3: comparte solo en comunidades propias tras confirmación expresa',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.css'),'utf8');
 assert.match(js,/function communitySharePanel\(q\)/);
 assert.match(js,/if\(state\.user\)host\.append\(communitySharePanel\(q\)\)/);
 assert.match(js,/\/api\/communities\?scope=joined/);
 assert.match(js,/c\.is_member/);
 assert.match(js,/if\(!confirm\('¿Quieres publicar esta petición/);
 assert.match(js,/method:'POST'/);
 assert.match(js,/contentLevel:'normal'/);
 assert.match(js,/if\(submit\.disabled\)return/);
 assert.match(js,/form\.reset\(\);form\.hidden=true;submit\.disabled=false/);
 assert.match(css,/resuelve-community-form/);
});
