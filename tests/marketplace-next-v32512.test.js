'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {marketplaceSchemaMiddleware}=require('../src/routes/marketplace-v3250');

test('schema middleware advances the request exactly once after successful initialization',async()=>{
 let checked=false,calls=0;
 const middleware=marketplaceSchemaMiddleware(async()=>{await Promise.resolve();checked=true;});
 const err=await new Promise(resolve=>{
   middleware({}, {}, error=>{calls++;assert.equal(checked,true);resolve(error);});
 });
 assert.equal(err,undefined);
 assert.equal(calls,1);
});

test('schema middleware waits for readiness before calling next',async()=>{
 let ready;
 const blocker=new Promise(resolve=>{ready=resolve;});
 let advanced=false;
 const middleware=marketplaceSchemaMiddleware(()=>blocker);
 const done=new Promise(resolve=>middleware({}, {},()=>{advanced=true;resolve();}));
 await Promise.resolve();
 assert.equal(advanced,false);
 ready();
 await done;
 assert.equal(advanced,true);
});

test('schema failures propagate to Express error handling instead of hanging',async()=>{
 const expected=new Error('database_lock_timeout');
 const middleware=marketplaceSchemaMiddleware(async()=>{throw expected;});
 const result=await new Promise(resolve=>middleware({}, {},resolve));
 assert.equal(result,expected);
});

test('Marketplace requests route through middleware to existing CRUD handlers',()=>{
 const api=read('src/routes/marketplace-v3250.js');
 assert.match(api,/router\.use\(requireAuth\)/);
 assert.match(api,/router\.use\(marketplaceSchemaMiddleware\(\)\)/);
 assert.doesNotMatch(api,/router\.use\(wrap\(async\(\)=>\{await ensureMarketplaceSchema\(\);\}\)\)/);
 for(const route of [
  "router.get('/',","router.get('/mine',","router.get('/favorites',",
  "router.post('/',rateLimit","router.patch('/:id',","router.delete('/:id',"
 ])assert.ok(api.includes(route),route);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.64');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.64'/);
});
