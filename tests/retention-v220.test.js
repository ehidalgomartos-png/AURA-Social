'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {createRetentionRouter,SUGGESTIONS_SQL,safeCommunityReturn,MAX_ITEMS,SNOOZE_DAYS}=require('../src/routes/retention-v220');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function dbHarness({rows=[],snoozeRows=[{community_id:12,hidden_until:'2026-10-15T12:00:00Z'}],fail=false}={}){
  const calls=[];
  return {
    calls,
    db:{query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(fail)throw Error('private_connection_credential');
      if(sql===SUGGESTIONS_SQL)return {rows,rowCount:rows.length};
      if(sql.includes('INSERT INTO community_return_snoozes'))return {rows:snoozeRows,rowCount:snoozeRows.length};
      return {rows:[],rowCount:0};
    }}
  };
}
async function serve({auth=true,...opts},fn){
  const h=dbHarness(opts),app=express();
  app.use(express.json());
  const guard=auth?(req,_res,next)=>{req.user={id:81};next();}:
    (_req,res)=>res.status(401).json({error:'authentication_required'});
  app.use('/api/growth',createRetentionRouter({database:h.db,auth:guard}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{return await fn('http://127.0.0.1:'+server.address().port,h);}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test('new community return feature uses only joined communities and bounded candidate set',()=>{
  assert.match(SUGGESTIONS_SQL,/FROM community_members cm/);
  assert.match(SUGGESTIONS_SQL,/cm\.user_id=\$1/);
  assert.match(SUGGESTIONS_SQL,/JOIN communities c/);
  assert.match(SUGGESTIONS_SQL,/LIMIT 40/);
  assert.match(SUGGESTIONS_SQL,/LIMIT 3/);
  assert.equal(MAX_ITEMS,3);
});
test('only published normal posts from active other members contribute to counts',()=>{
  for(const term of ["cp.moderation_status='published'","cp.content_level='normal'","author.status='active'","cp.user_id<>$1"])
    assert.ok(SUGGESTIONS_SQL.includes(term),term);
  assert.match(SUGGESTIONS_SQL,/cp\.created_at>=now\(\)-interval '7 days'/);
  assert.match(SUGGESTIONS_SQL,/LIMIT 10/);
});
test('muted and blocked owners and authors are excluded',()=>{
  assert.match(SUGGESTIONS_SQL,/b\.blocked_id=c\.owner_id/);
  assert.match(SUGGESTIONS_SQL,/m\.muted_id=c\.owner_id/);
  assert.match(SUGGESTIONS_SQL,/b\.blocked_id=cp\.user_id/);
  assert.match(SUGGESTIONS_SQL,/m\.muted_id=cp\.user_id/);
});
test('private groups cannot leak to outsiders and archived snoozes are excluded',()=>{
  assert.match(SUGGESTIONS_SQL,/cm\.user_id=\$1/);
  assert.match(SUGGESTIONS_SQL,/h\.hidden_until>now\(\)/);
  assert.doesNotMatch(SUGGESTIONS_SQL,/c\.privacy='public' OR/);
});
test('only safe summary fields are emitted and counts capped',()=>{
  const s=safeCommunityReturn({id:12,name:'Una comunidad',recent_count:200,last_post_at:'2026-10-08',body:'private text',user_id:81,email:'private@example.com'});
  assert.deepEqual(s,{communityId:'12',name:'Una comunidad',recentCount:10,lastPostAt:'2026-10-08'});
  assert.ok(!JSON.stringify(s).includes('private text'));
  assert.ok(!JSON.stringify(s).includes('private@example.com'));
  assert.equal(safeCommunityReturn({id:3,recent_count:-8}).recentCount,0);
});
test('unauthed requests are rejected without touching storage',()=>serve({auth:false},async(base,h)=>{
  const get=await fetch(base+'/api/growth/retention/communities');
  const post=await fetch(base+'/api/growth/retention/communities/12/snooze',{method:'POST'});
  assert.equal(get.status,401);
  assert.equal(post.status,401);
  assert.equal(h.calls.length,0);
}));
test('GET returns only bounded, aggregated community suggestions',()=>serve({
  rows:[{id:12,name:'Arte',recent_count:2,last_post_at:'2026-10-07T10:00:00Z'}]
},async(base,h)=>{
  const response=await fetch(base+'/api/growth/retention/communities');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const json=await response.json();
  assert.equal(json.items.length,1);
  assert.equal(json.items[0].name,'Arte');
  assert.equal(json.items[0].recentCount,2);
  assert.equal(json.scope,'joined_communities_only');
  assert.equal(json.notificationsSent,false);
  assert.equal(json.countIsExact,false);
  const query=h.calls.find(c=>c.sql===SUGGESTIONS_SQL);
  assert.deepEqual(query.params,[81]);
}));
test('joined user can snooze for exactly seven days with server-side user scope',()=>serve({},async(base,h)=>{
  const res=await fetch(base+'/api/growth/retention/communities/12/snooze',{method:'POST'});
  assert.equal(res.status,200);
  const payload=await res.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.snoozeDays,7);
  assert.equal(SNOOZE_DAYS,7);
  const call=h.calls.find(x=>x.sql.includes('INSERT INTO community_return_snoozes'));
  assert.deepEqual(call.params,[81,'12']);
  assert.match(call.sql,/JOIN community_members cm/);
  assert.match(call.sql,/cm\.user_id=\$1/);
  assert.match(call.sql,/ON CONFLICT\(user_id,community_id\) DO UPDATE/);
}));
test('non-member never creates snooze for arbitrary community ID',()=>serve({snoozeRows:[]},async(base)=>{
  const res=await fetch(base+'/api/growth/retention/communities/123/snooze',{method:'POST'});
  assert.equal(res.status,404);
  assert.equal((await res.json()).error,'community_not_joined');
}));
test('invalid or malicious ids return 400 without a database query',()=>serve({},async(base,h)=>{
  for(const id of ['0','-12','abc','99999999999999999999']){
    const res=await fetch(base+'/api/growth/retention/communities/'+id+'/snooze',{method:'POST'});
    assert.equal(res.status,400,id);
  }
  assert.equal(h.calls.length,0);
}));
test('database errors produce sanitized 503 and never leak secrets',()=>serve({fail:true},async(base)=>{
  const res=await fetch(base+'/api/growth/retention/communities');
  assert.equal(res.status,503);
  assert.doesNotMatch(await res.text(),/private_connection_credential/);
}));
test('schema changes only create optional user-specific snooze table',()=>serve({},async(base,h)=>{
  await fetch(base+'/api/growth/retention/communities');
  const sql=h.calls.map(x=>x.sql).join(' ');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS community_return_snoozes_v220/);
  assert.match(sql,/PRIMARY KEY\(user_id,community_id\)/);
  assert.match(sql,/REFERENCES communities\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|TRUNCATE|ALTER TABLE users|UPDATE posts/);
}));
test('home contains accessible voluntary community return section',()=>{
  const html=read('public/app.html');
  for(const id of ['communityReturn','communityReturnTitle','communityReturnList','communityReturnRefresh'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/No recibirás recordatorios/);
  assert.match(read('public/social.js'),/Ocultar 7 días/);
});
test('client shows a maximum of three items, opens community and supports 7-day snooze',()=>{
  const js=read('public/social.js');
  assert.match(js,/async function loadCommunityReturn/);
  assert.match(js,/d\.items\.slice\(0,3\)/);
  assert.match(js,/showView\('communities'\)/);
  assert.match(js,/await openCommunityDetail\(id\)/);
  assert.match(js,/data-community-return-snooze/);
  assert.match(js,/method:'POST'/);
  assert.match(js,/toast\('No te mostraremos esta comunidad aquí durante 7 días\.'/);
  assert.match(js,/section\.classList\.toggle\('hidden',!list\.children\.length\)/);
});
test('mobile UI provides large touch targets and reduced-motion support',()=>{
  const css=read('public/social.css');
  assert.match(css,/\.community-return-list/);
  assert.match(css,/@media\(max-width:580px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
});
test('feature mounts before growth routes, leaves notifications and monetization untouched',()=>{
  const server=read('server.js');
  assert.match(server,new RegExp("const APP_VERSION='"+require('../package.json').version.replace(/\./g,'\\.')+"'"));
  assert.match(server,/app\.use\('\/api\/growth', retentionV220Routes\)/);
  const before=server.indexOf("app.use('/api/growth', retentionV220Routes)");
  const after=server.indexOf("app.use('/api/growth', growthRoutes)");
  assert.ok(before>=0 && after>before);
  const routes=read('src/routes/retention-v220.js');
  assert.doesNotMatch(routes,/web-push|sendMail|sendPush|INSERT INTO notifications|DELETE FROM users/);
});
