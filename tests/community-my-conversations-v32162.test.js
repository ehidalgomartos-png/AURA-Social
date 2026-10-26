'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const routes=read('src/routes/communities.js'),client=read('public/social.js');
const html=read('public/app.html'),css=read('public/social.css');
function routeHarness(allowed=true){
  const start=routes.indexOf("router.get('/:id/posts',async(req,res)=>{");
  const end=routes.indexOf('const communityPostSchema=',start);
  assert.ok(start>0&&end>start);
  let handler=null;
  const calls=[];
  const router={get:(name,fn)=>{assert.equal(name,'/:id/posts');handler=fn}};
  const state=allowed?{id:34,owner_id:5,can_view_content:true,is_member:true,can_manage:false,can_moderate:false}:null;
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}};
  new Function('router','communityState','blockedBetween','viewerRow','db','canViewerSee',
    routes.slice(start,end))(router,async()=>state,async()=>false,async()=>({id:9}),db,()=>({allowed:true}));
  return {calls,async request(query={}){
    let statusCode=200,body=null;
    await handler({params:{id:'34'},user:{id:9},query},{
      status(code){statusCode=code;return this;},
      json(obj){body=obj;return this;}
    });
    return {statusCode,body};
  }};
}
test('the real authenticated community route filters only posts authored or commented by the viewer',async()=>{
  const h=routeHarness();
  const answer=await h.request({focus:'mine'});
  assert.equal(answer.statusCode,200);
  assert.equal(answer.body.focus,'mine');
  const {sql,params}=h.calls[0];
  assert.deepEqual(params,[34,9,'mine']);
  assert.match(sql,/\(\$3<>'mine' OR cp\.user_id=\$2 OR EXISTS\s*\(/);
  assert.match(sql,/FROM community_comments own_comment/);
  assert.match(sql,/own_comment\.community_post_id=cp\.id/);
  assert.match(sql,/own_comment\.user_id=\$2/);
  assert.match(sql,/cp\.moderation_status='published'/);
  assert.match(sql,/u\.status='active'/);
  assert.match(sql,/LIMIT 100/);
});
test('invalid focus falls back to all; existing block/mute and shared-post gates remain in force',async()=>{
  const h=routeHarness();
  const reply=await h.request({focus:'stranger'});
  assert.equal(reply.body.focus,'all');
  assert.deepEqual(h.calls[0].params,[34,9,'all']);
  const sql=h.calls[0].sql;
  assert.match(sql,/blocked_id=cp\.user_id/);
  assert.match(sql,/muted_post\.muted_id=cp\.user_id/);
  assert.match(sql,/shared_post_blocked/);
  assert.match(sql,/shared_post_muted/);
  assert.match(sql,/ORDER BY cp\.created_at DESC,cp\.id DESC/);
  assert.doesNotMatch(sql,/\bINSERT INTO\b|\bUPDATE\b|\bDELETE FROM\b/i);
});
test('members-only content remains inaccessible before any post or comment query',async()=>{
  const h=routeHarness(false);
  const result=await h.request({focus:'mine'});
  assert.equal(result.statusCode,404);
  assert.equal(result.body.error,'community_not_found');
  assert.equal(h.calls.length,0);
});
function uiHarness(opts={}){
  const buttons=['all','mine'].map(mode=>({
    dataset:{communityPostFocus:mode},
    attrs:{},classList:{active:false,toggle(k,b){if(k==='active')this.active=b}},
    setAttribute(k,v){this.attrs[k]=v}
  }));
  const filters={hidden:false,classList:{toggle(k,b){if(k==='hidden')filters.hidden=b}}};
  const list={innerHTML:''},count={textContent:''};
  const calls=[];
  const ctx={
    String,Array,
    communityPostFocusV32162:opts.focus||'all',
    communityPostRequestSequenceV32162:0,
    activeCommunityId:34,
    activeCommunityData:{can_view_content:opts.allowed!==false,community:{is_member:true}},
    '$':selector=>({
      '#communityPosts':list,'#communityPostCount':count,'#communityPostFiltersV32162':filters
    })[selector]||null,
    all:(_q,_r)=>buttons,
    api:async(url)=>{calls.push(url);return {r:{ok:true},d:{posts:opts.posts||[]}};},
    communityPostHTML:post=>'<article data-community-post="'+post.id+'"></article>'
  };
  const start=client.indexOf('async function loadCommunityPosts(){');
  const end=client.indexOf("$('#communityPostFiltersV32162')?.addEventListener",start);
  assert.ok(start>0&&end>start);
  vm.runInNewContext(client.slice(start,end)+'\nthis.load=loadCommunityPosts;',ctx);
  return {ctx,list,count,filters,buttons,calls,load:()=>ctx.load()};
}
test('personal filter uses authorized endpoint, shows real posts and an honest empty state',async()=>{
  const h=uiHarness({focus:'mine',posts:[{id:9}]});
  await h.load();
  assert.deepEqual(h.calls,['/api/communities/34/posts?focus=mine']);
  assert.match(h.list.innerHTML,/data-community-post="9"/);
  assert.equal(h.count.textContent,'1 conversaciones');
  assert.equal(h.buttons[1].attrs['aria-pressed'],'true');
  assert.equal(h.buttons[0].attrs['aria-pressed'],'false');
  const empty=uiHarness({focus:'mine'});await empty.load();
  assert.match(empty.list.innerHTML,/Aún no has participado en conversaciones aquí/);
  assert.doesNotMatch(empty.list.innerHTML,/Ya has comentado|Nuevas respuestas/);
});
test('default filter keeps existing endpoint and no private content is requested',async()=>{
  const normal=uiHarness();await normal.load();
  assert.deepEqual(normal.calls,['/api/communities/34/posts']);
  const privateGate=uiHarness({allowed:false,focus:'mine'});
  await privateGate.load();
  assert.equal(privateGate.calls.length,0);
  assert.equal(privateGate.filters.hidden,true);
  assert.match(privateGate.list.innerHTML,/Contenido privado/);
});
test('all focus controls are opt-in, accessible and scoped to existing community detail',()=>{
  const detail=html.slice(html.indexOf('id="communityDetail"'),html.indexOf('id="eventsView"'));
  assert.match(detail,/id="communityPostFiltersV32162"/);
  assert.match(detail,/data-community-post-focus="all" aria-pressed="true"/);
  assert.match(detail,/data-community-post-focus="mine" aria-pressed="false"/);
  assert.match(css,/\.community-post-filters-v32162 button\{min-height:44px/);
  assert.match(css,/\.community-post-filters-v32162\.hidden\{display:none!important\}/);
  const script=client.slice(client.indexOf("$('#communityPostFiltersV32162')?.addEventListener"),
    client.indexOf('async function loadCommunityAdminData()'));
  assert.match(script,/if\(next===communityPostFocusV32162\)return/);
  assert.match(script,/communityPostFocusV32162=next/);
  assert.doesNotMatch(script,/method:'POST'|requestSubmit\(|localStorage/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/community-my-conversations-v32162\.test\.js/);
});
