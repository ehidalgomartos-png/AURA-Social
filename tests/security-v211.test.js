'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
// A dedicated non-production key for deterministic CI hashes; never used by the application.
process.env.JWT_SECRET='v211-test-key-not-for-production-0000000000000000';
const {matchPolicy,actorHash,createAbuseGuard,POLICIES}=require('../src/services/abuse-guard');

function makeHarness({ip='198.51.100.3',user={id:42},now=()=>1_800_000_000_000}={}){
  const counts=new Map(),events=[];
  const db={query:async(sql,params=[])=>{
    if(sql.startsWith('INSERT INTO abuse_rate_buckets(')){
      const key=params.slice(0,4).join(':');const hits=(counts.get(key)||0)+1;counts.set(key,hits);return {rows:[{hits}]};
    }
    if(sql.startsWith('INSERT INTO abuse_events('))events.push(params);
    return {rows:[],rowCount:0};
  }};
  const guard=createAbuseGuard({db,requireAuth:(_req,_res,next)=>next(),now});
  async function request(method,url,person=user){
    let nextCalled=false,status=200,body=null;
    const req={method,path:url,ip,user:person};
    const res={setHeader(){},status(v){status=v;return this;},json(v){body=v;return this;}};
    await guard(req,res,()=>{nextCalled=true;});
    return {status,body,nextCalled};
  }
  return {request,counts,events};
}
test('read-only and unlisted requests bypass security guard',async()=>{
  const h=makeHarness();
  assert.equal((await h.request('GET','/api/posts')).nextCalled,true);
  assert.equal((await h.request('DELETE','/api/posts/4/like')).nextCalled,true);
  assert.equal(h.counts.size,0);
});
test('all key write categories are limited and differentiated',()=>{
  for(const category of ['registration','login','publishing','comments','messages','follows','reactions','reports','password','broadcasts'])assert.ok(POLICIES.some(p=>p.category===category),category);
  assert.equal(matchPolicy('POST','/api/posts/12/comments').category,'comments');
  assert.equal(matchPolicy('POST','/api/messages/conversations/12/messages').category,'messages');
  assert.equal(matchPolicy('POST','/api/posts/12/like').category,'reactions');
  assert.equal(matchPolicy('POST','/api/posts/12/reel-view'),null);
});
test('limits allow normal users, block excess, then reset next window',async()=>{
  let time=1_800_000_000_000;
  const h=makeHarness({now:()=>time});
  for(let i=0;i<90;i++)assert.equal((await h.request('POST','/api/posts/5/comments')).status,200);
  const blocked=await h.request('POST','/api/posts/5/comments');
  assert.equal(blocked.status,429);
  assert.equal(blocked.body.error,'action_rate_limited');
  assert.ok(blocked.body.retryAfterSeconds>0);
  assert.equal(h.events.length,1);
  time+=600_000;
  assert.equal((await h.request('POST','/api/posts/5/comments')).status,200);
});
test('per-account buckets keep distinct users independent',async()=>{
  const h=makeHarness();
  for(let i=0;i<90;i++)await h.request('POST','/api/posts/5/comments',{id:42});
  assert.equal((await h.request('POST','/api/posts/5/comments',{id:43})).status,200);
  assert.equal((await h.request('POST','/api/posts/5/comments',{id:42})).status,429);
});
test('hashed actors do not contain plaintext identities',()=>{
  const a=actorHash('network','198.51.100.1','x'.repeat(32));
  assert.match(a,/^[a-f0-9]{64}$/);
  assert.ok(!a.includes('198.51.100.1'));
  assert.notEqual(a,actorHash('network','198.51.100.2','x'.repeat(32)));
  assert.notEqual(a,actorHash('user','198.51.100.1','x'.repeat(32)));
});
test('errors fail closed for protected writes, not for public reads',async()=>{
  const db={query:async()=>{throw Error('offline')}};
  const guard=createAbuseGuard({db,requireAuth:(_req,_res,next)=>next()});
  const res={status(s){this.code=s;return this},json(o){this.body=o;return this},setHeader(){}};
  let skipped=false;
  guard({method:'GET',path:'/api/posts'},res,()=>{skipped=true;});
  assert.ok(skipped);
  await guard({method:'POST',path:'/api/posts/4/comments',user:{id:1}},res,()=>{});
  assert.equal(res.code,503);
  assert.equal(res.body.error,'security_guard_unavailable');
});
test('security route is protected and server mounts guard before social routes',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const admin=fs.readFileSync(path.join(__dirname,'../src/routes/admin-security-v211.js'),'utf8');
  assert.ok(server.indexOf('app.use(createAbuseGuard')<server.indexOf("app.use('/api/posts'"));
  assert.match(admin,/router.use\(requireAdmin\)/);
  assert.match(admin,/abuse_admin_audit/);
});
test('mobile-first moderation UI includes review action and refresh',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/admin.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../public/admin.js'),'utf8');
  assert.match(html,/id="securityEvents"/);
  assert.match(html,/id="reloadSecurity"/);
  assert.match(ui,/securityOverview/);
  assert.match(ui,/data-security-review/);
});
