'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {createRuntimeMonitor,classifyApiPath,excludeTelemetry,WINDOW_MINUTES}=require('../src/services/runtime-monitor-v213');
const root=path.resolve(__dirname,'..');

function harness(){
  let time=Date.UTC(2026,9,8,12,0,0),tick=0;
  const monitor=createRuntimeMonitor({
    now:()=>time,monotonicMs:()=>tick,
    getMemory:()=>({rss:104857600}),getUptime:()=>150
  });
  const shift=ms=>{time+=ms};
  const elapsed=ms=>{tick+=ms};
  return {monitor,shift,elapsed};
}
function request({path='/api/posts/feed',status=200,duration=30,header='',disconnect=false},ctx){
  const response=new EventEmitter();
  response.statusCode=status;
  response.writableEnded=!disconnect;
  response.getHeader=()=>header;
  let nextCount=0;
  ctx.monitor.middleware({path,method:'GET'},response,()=>{nextCount++;});
  ctx.elapsed(duration);
  response.emit(disconnect?'close':'finish');
  response.emit('close');
  return nextCount;
}
test('categorizes requests with fixed labels without dynamic IDs',()=>{
  assert.equal(classifyApiPath('/api/posts/987/comments'),'posts');
  assert.equal(classifyApiPath('/api/messages/conversations/7/messages'),'messages');
  assert.equal(classifyApiPath('/api/relationships/suggestions'),'profiles');
  assert.equal(classifyApiPath('/api/secret-account/123'),'other');
  assert.equal(excludeTelemetry({path:'/uploads/private.jpg'}),true);
  assert.equal(excludeTelemetry({path:'/api/admin/ops/runtime'}),true);
});
test('records successful, failed, limited and slow API requests',()=>{
  const ctx=harness();
  request({path:'/api/posts/17/comments',status:201,duration:90},ctx);
  request({path:'/api/posts/22/like',status:429,duration:130},ctx);
  request({path:'/api/posts/23/comments',status:503,duration:1700},ctx);
  let s=ctx.monitor.snapshot();
  assert.equal(s.overall.requests,3);
  assert.equal(s.overall.serverErrors,1);
  assert.equal(s.overall.clientErrors,1);
  assert.equal(s.overall.rateLimited,1);
  assert.equal(s.overall.slow,1);
  assert.equal(s.groups[0].category,'posts');
  assert.equal(s.groups[0].requests,3);
  assert.equal(s.overall.p95UpperBoundMs,3000);
  assert.equal(s.overall.errorRatePct,33.3);
});
test('retains no sensitive request material or route identifiers',()=>{
  const ctx=harness();
  ctx.monitor.record({path:'/api/messages/conversations/912345/messages?access=secret',status:500,durationMs:80});
  let rendered=JSON.stringify(ctx.monitor.snapshot());
  for(const secret of ['912345','secret','access=','user_id','ip_address','requestBody']){
    assert.equal(rendered.includes(secret),false,'must not expose '+secret);
  }
});
test('window evicts old minutes, including idle buckets',()=>{
  const ctx=harness();
  ctx.monitor.record({path:'/api/posts',status:200});
  assert.equal(ctx.monitor.snapshot().overall.requests,1);
  ctx.shift(WINDOW_MINUTES*60*1000);
  assert.equal(ctx.monitor.snapshot().overall.requests,0);
  assert.equal(ctx.monitor.debugBucketCount(),0);
});
test('bounded cardinality despite arbitrary user paths',()=>{
  const ctx=harness();
  for(let i=0;i<5000;i++)ctx.monitor.record({path:'/api/posts/'+i+'/comments',status:200,durationMs:30});
  assert.equal(ctx.monitor.debugBucketCount(),1);
  assert.equal(ctx.monitor.snapshot().overall.requests,5000);
});
test('response close after finish is counted once',()=>{
  const ctx=harness();
  request({path:'/api/auth/login',status:401},ctx);
  assert.equal(ctx.monitor.snapshot().overall.requests,1);
  assert.equal(ctx.monitor.snapshot().groups[0].clientErrors,1);
});
test('aborted HTTP requests count as client disconnects without leaking path',()=>{
  const ctx=harness();
  request({path:'/api/media/upload?token=private',disconnect:true,duration:150},ctx);
  let s=ctx.monitor.snapshot();
  assert.equal(s.groups[0].category,'media');
  assert.equal(s.overall.requests,1);
  assert.equal(s.overall.clientErrors,1);
});
test('SSE and health checks do not distort latency counts',()=>{
  const ctx=harness();
  request({path:'/api/live/stream',duration:200000,header:'text/event-stream; charset=utf-8'},ctx);
  request({path:'/api/health',status:200,duration:40},ctx);
  request({path:'/api/admin/ops/runtime',status:200,duration:40},ctx);
  assert.equal(ctx.monitor.snapshot().overall.requests,0);
});
test('status signals require material request samples or multiple errors',()=>{
  const ctx=harness();
  ctx.monitor.record({path:'/api/posts',status:503,durationMs:70});
  assert.equal(ctx.monitor.snapshot().level,'ok');
  ctx.monitor.record({path:'/api/posts',status:503,durationMs:70});
  ctx.monitor.record({path:'/api/posts',status:503,durationMs:70});
  assert.equal(ctx.monitor.snapshot().level,'warning');
  for(let i=0;i<17;i++)ctx.monitor.record({path:'/api/posts',status:503,durationMs:70});
  assert.equal(ctx.monitor.snapshot().level,'critical');
});
test('endpoint is admin protected, read-only and mounted before admin routes',()=>{
  const source=fs.readFileSync(path.join(root,'src/routes/admin-runtime-v213.js'),'utf8');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(source,/router\.use\(requireAdmin\)/);
  assert.match(source,/router\.get\('\/ops\/runtime'/);
  assert.doesNotMatch(source,/router\.(?:post|patch|delete|put)\(/);
  assert.match(server,/app\.use\(runtimeMonitor\.middleware\)/);
  assert.match(server,/app\.use\('\/api\/admin', createRuntimeAdminRoutes\(runtimeMonitor\)\)/);
});
test('mobile admin page renders runtime state and exposes refresh action',()=>{
  const html=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'public/admin.js'),'utf8');
  assert.match(html,/id="runtimeOpsSummary"/);
  assert.match(html,/id="runtimeOpsGroups"/);
  assert.match(html,/id="reloadRuntimeOps"/);
  assert.match(js,/api\('\/api\/admin\/ops\/runtime'\)/);
  assert.match(js,/function runtimeLatencyLabel\(/);
  assert.match(js,/runtimeOps\(\), securityOverview\(\)/);
});
test('monitoring is memory only and needs no database migration',()=>{
  const code=fs.readFileSync(path.join(root,'src/services/runtime-monitor-v213.js'),'utf8');
  assert.doesNotMatch(code,/\b(?:db\.query|pool\.query|INSERT INTO|ALTER TABLE)\b/);
  assert.equal(harness().monitor.snapshot().scope,'single_instance');
});
