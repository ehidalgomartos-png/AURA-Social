'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');

test('server imports requireAdmin before registering the admin dashboard route',()=>{
 const importStatement=server.match(/^const\s+\{\s*requireAuth\s*,\s*requireAdmin\s*\}\s*=\s*require\('\.\/src\/middleware\/auth'\);$/m)?.[0];
 assert.ok(importStatement,'requireAdmin must be imported explicitly at server boot');
 const routeStatement=server.match(/^app\.get\('\/admin\/actividad',requireAdmin,\(req,res\)=>\{[\s\S]*?\n\}\);/m)?.[0];
 assert.ok(routeStatement,'admin page must be protected by requireAdmin');
 let called=false;
 const guard=()=>{};
 const app={get:(url,...handlers)=>{
   called=true;
   assert.equal(url,'/admin/actividad');
   assert.equal(handlers[0],guard);
   assert.equal(typeof handlers[1],'function');
 }};
 vm.runInNewContext(importStatement+'\n'+routeStatement,{
   require(name){
     assert.equal(name,'./src/middleware/auth');
     return {requireAuth:()=>{},requireAdmin:guard};
   },app,path, __dirname:'/'});
 assert.equal(called,true);
});

test('admin shell is not publicly served as a static document',()=>{
 assert.match(server,/app\.use\(express\.static\(path\.join\(__dirname, 'public'\)/);
 assert.match(server,/path\.join\(__dirname,'src','views','admin-activity-v3317\.html'\)/);
 assert.ok(fs.existsSync(path.join(__dirname,'../src/views/admin-activity-v3317.html')));
 assert.equal(fs.existsSync(path.join(__dirname,'../public/admin-activity-v3317.html')),false);
});

test('API remains behind requireAdmin and does not expose private conversations',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../src/routes/admin-activity-v3317.js'),'utf8');
 assert.match(api,/router\.use\(requireAdmin\)/);
 assert.match(api,/SELECT count\(\*\)::int FROM messages WHERE created_at/);
 const timeline=api.slice(api.indexOf('const ACTIVITY_SQL='),api.indexOf('function normalizedOptions('));
 assert.doesNotMatch(timeline,/FROM messages|JOIN messages|SELECT .*body.*FROM messages/);
 assert.match(api,/items:feed\.rows\.slice\(0,PAGE_SIZE\)\.map/);
});
