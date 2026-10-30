'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Resuelve V3.5.1: conexiones visibles y compartición opt-in',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.js'),'utf8');
 assert.match(js,/function connectedActions\(q\)/);
 assert.match(js,/extras\.append\(connectedActions\(q\)\)/);
 assert.match(js,/\/marketplace\/explorar/);
 assert.match(js,/\/comunidades/);
 assert.match(js,/navigator\.share/);
 assert.match(js,/navigator\.clipboard\.writeText/);
 assert.match(js,/window\.prompt/);
 assert.doesNotMatch(js,/autoShare|autoPost|autoPublish/);
});
