'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

// Stub only the authentication middleware in this test process to exercise
// authorized and forbidden HTTP responses without generating JWT secrets.
const authPath=require.resolve('../src/middleware/auth');
const routePath=require.resolve('../src/routes/admin-activity-v3317');
const previousAuth=require.cache[authPath];
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{
  requireAdmin:(req,res,next)=>req.headers['x-test-admin']==='true'?next():res.status(403).json({error:'admin_required'})
}};
const {createAdminActivityRouter,normalizedOptions,METRICS_SQL,ACTIVITY_SQL,PAGE_SIZE}=require(routePath);
if(previousAuth)require.cache[authPath]=previousAuth;else delete require.cache[authPath];

function fakeDb(){
 const queries=[];
 const db={query:async(sql,params)=>{
   queries.push({sql,params});
   if(sql===METRICS_SQL)return {rows:[{
     registrations:3,posts:8,reels:2,stories:1,comments:9,messages:15,
     conversations:4,follows:3,likes:4,reports:0,open_reports:1,active_members:20
   }]};
   if(sql===ACTIVITY_SQL)return {rows:[{
     kind:'post',event_id:12,occurred_at:'2026-10-27T10:00:00Z',
     actor_username:'public_user',excerpt:'Visible publicación',post_id:12,
     recipient_email:'secret@example.com',conversation_id:7,body:'NEVER EXPOSE'
   }],rowCount:1};
   throw Error('unexpected_sql');
 }};
 return {db,queries};
}
async function runServer(db,work){
 const app=express();app.use('/api/admin/activity',createAdminActivityRouter({db}));
 const http=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 try{await work('http://127.0.0.1:'+http.address().port);}
 finally{await new Promise(resolve=>http.close(resolve));}
}
test('admin authorization is mandatory before any query',async()=>{
 const {db,queries}=fakeDb();
 await runServer(db,async origin=>{
   const result=await fetch(origin+'/api/admin/activity');
   assert.equal(result.status,403);
   assert.equal(queries.length,0);
 });
 assert.match(read('src/routes/admin-activity-v3317.js'),/const \{requireAdmin\}=require\('\.\.\/middleware\/auth'\)/);
 assert.match(read('src/routes/admin-activity-v3317.js'),/router\.use\(requireAdmin\)/);
});
test('filters bound to strict options, never SQL user fragments',()=>{
 for(const days of [1,7,30])assert.deepEqual(normalizedOptions({days:String(days),type:'all',page:'0'}),{days,type:'all',page:0});
 for(const query of [
   {days:'0'},{days:'90'},{days:'7 OR 1=1'},
   {type:'messages'},{type:"post'; DROP TABLE messages;--"},
   {page:'-1'},{page:'21'},{page:'1.2'}
 ])assert.equal(normalizedOptions(query),null);
 assert.equal(PAGE_SIZE,30);
});
test('privacy-safe result fields and metric counts for admins',async()=>{
 const {db,queries}=fakeDb();
 await runServer(db,async origin=>{
   const res=await fetch(origin+'/api/admin/activity?days=7&type=post&page=2',{headers:{'x-test-admin':'true'}});
   assert.equal(res.status,200);
   assert.equal(res.headers.get('cache-control'),'no-store');
   const data=await res.json();
   assert.equal(data.metrics.messages,15);
   assert.equal(data.metrics.conversations,4);
   assert.equal(data.items.length,1);
   assert.deepEqual(Object.keys(data.items[0]),['kind','eventId','occurredAt','username','excerpt','postId']);
   assert.equal(data.items[0].postId,'12');
   assert.doesNotMatch(JSON.stringify(data),/NEVER EXPOSE|secret@example.com|conversation_id|recipient_email/);
   assert.deepEqual(queries[0].params,[7]);
   assert.deepEqual(queries[1].params,[7,'post',60]);
 });
});
test('only normal public, opted-in activity enters timeline; private messages/report details never selected',()=>{
 assert.match(ACTIVITY_SQL,/p\.moderation_status='published' AND p\.audience='public'/);
 assert.match(ACTIVITY_SQL,/p\.content_level='normal'/);
 assert.match(ACTIVITY_SQL,/s\.expires_at>now\(\)/);
 assert.match(ACTIVITY_SQL,/s\.audience='public'/);
 assert.match(ACTIVITY_SQL,/s\.content_level='normal'/);
 assert.match(ACTIVITY_SQL,/u\.status='active' AND u\.discoverable=true AND u\.show_activity=true/);
 assert.doesNotMatch(ACTIVITY_SQL,/\bmessages\b|\bconversations\b|\breports\b|\bblocks\b/);
 assert.match(METRICS_SQL,/count\(\*\)::int FROM messages WHERE created_at/);
 assert.match(METRICS_SQL,/count\(DISTINCT conversation_id\)::int FROM messages/);
 assert.doesNotMatch(METRICS_SQL,/\bbody\b|\bsender_id\b|\brecipient_id\b/);
});
test('standalone page is mobile-first, private, linked and does not use HTML injection',()=>{
 const html=read('src/views/admin-activity-v3317.html');
 const admin=read('public/admin.html');
 const js=read('public/admin-activity-v3317.js');
 const css=read('public/admin-activity-v3317.css');
 const server=read('server.js');
 assert.match(server,/app\.use\('\/api\/admin\/activity',createAdminActivityRouter\(\{db\}\)\)/);
 assert.match(server,/app\.get\('\/admin\/actividad',requireAdmin/);
 assert.match(server,/res\.sendFile\(path\.join\(__dirname,'src','views','admin-activity-v3317\.html'\)\)/);
 assert.doesNotMatch(server,/path\.join\(__dirname,'public','admin-activity-v3317\.html'\)/);
 assert.match(html,/content="noindex,nofollow"/);
 assert.match(html,/id="activityStats"/);
 assert.match(html,/id="activityFeed"/);
 assert.match(html,/id="activityType"/);
 assert.match(html,/id="activityDays"/);
 assert.match(html,/id="activityAuto"/);
 assert.match(html,/mensajes, destinatarios ni conversaciones/);
 assert.match(admin,/href="\/admin\/actividad"/);
 assert.match(js,/node\.textContent=String\(text\)/);
 assert.match(js,/root\.replaceChildren\(\.\.\.nodes\)/);
 assert.doesNotMatch(js,/innerHTML|localStorage|cookie|messageBody|senderId/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/admin-activity-v3317\.test\.js/);
});
