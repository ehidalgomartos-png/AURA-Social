'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const ai=require('../src/routes/admin-editorial-ai-v3242');
const media=require('../src/routes/admin-editorial-media-v3242');

test('startup mounts the actual exported AI router, not its module object',()=>{
  assert.match(server,/const \{router:editorialAiV3242Admin\}=require\('\.\/src\/routes\/admin-editorial-ai-v3242'\)/);
  assert.match(server,/app\.use\('\/api\/admin\/editorial', editorialAiV3242Admin\)/);
  assert.equal(typeof ai.router,'function');
  assert.equal(typeof media,'function');
  const app=express();
  assert.doesNotThrow(()=>app.use('/api/admin/editorial',ai.router));
  assert.doesNotThrow(()=>app.use('/api/admin/editorial',media));
});
test('the problematic former default import would fail Express startup',()=>{
  assert.equal(typeof ai,'object');
  assert.throws(()=>express().use('/api/admin/editorial',ai),/requires a middleware function/);
});
