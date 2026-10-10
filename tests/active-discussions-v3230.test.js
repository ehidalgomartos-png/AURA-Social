'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const code=read('public/social.js');
const html=read('public/app.html');
const route=read('src/routes/posts.js');

test('active discussions are based only on real recent comments and public normal posts',()=>{
 const start=route.indexOf("router.get('/trending'");
 const end=route.indexOf("router.get('/trends'",start);
 assert.ok(start>0&&end>start);
 const sql=route.slice(start,end);
 assert.match(sql,/\['score','likes','comments','active'\]/);
 assert.match(sql,/const isActive=sort==='active'/);
 assert.match(sql,/recent_comment_count DESC, last_comment_at DESC/);
 assert.match(sql,/p\.audience='public' AND p\.content_level='normal'/);
 assert.match(sql,/EXISTS \(\s*SELECT 1 FROM comments recent WHERE recent\.post_id=p\.id/);
 assert.match(sql,/recent\.created_at >= now\(\)-interval '7 days'/);
 assert.match(sql,/recent_comment_count/);
 assert.match(sql,/last_comment_at/);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE posts|DELETE FROM/);
});
test('discovery keeps block, mute, hidden, age and audience protections',()=>{
 const start=route.indexOf("router.get('/trending'");
 const end=route.indexOf("router.get('/trends'",start);
 const sql=route.slice(start,end);
 for(const rule of ["requireAuth","postAudienceWhere('$1','p')","moderation_status='published'","u.status='active'","u.discoverable=true","blocked_id FROM blocks","blocker_id FROM blocks","muted_id FROM mutes","discovery_hidden_items","gateRows","attachCommentPreviews","LIMIT 40"]){
   assert.ok(sql.includes(rule),'Missing '+rule);
 }
 const original=read('public/editorial-home-v324.js');
 assert.ok(original.includes('posts[insertAt[i]-1].after(card)'));
});
function activityHarness(mode,posts){
 const allBtns=['foryou','trending','liked','commented','active','latest','saved'].map(mode=>({dataset:{contentMode:mode},classList:{toggle(){}}}));
 const hint={classList:{hidden:true,toggle(_class,value){this.hidden=value}}};
 const title={textContent:''},root={innerHTML:''};
 let endpoint='',renderCalls=[];
 const sandbox={
   activeContentMode:'foryou',
   activePostSearch:'',
   '$':selector=>({
     '#contentDiscoveryTitle':title,'#discoveryFeed':root,'#activeDiscussionsHintV3230':hint
   })[selector]||null,
   all:selector=>selector==='[data-content-mode]'?allBtns:[],
   api:async url=>{endpoint=url;return {r:{ok:true},d:{posts}}},
   renderDiscoveryPosts:(...args)=>{renderCalls.push(args)}
 };
 const start=code.indexOf('async function loadDiscoveryContent(');
 const end=code.indexOf('async function searchPosts(',start);
 assert.ok(start>0&&end>start);
 vm.runInNewContext(code.slice(start,end)+'\nthis.load=loadDiscoveryContent',sandbox);
 return {load:()=>sandbox.load(mode),hint,title,root,renderCalls,endpoint:()=>endpoint};
}
test('Explore renders active discussions, routes to the real endpoint and exposes context',async()=>{
 const sample=[{id:12,recent_comment_count:3}];
 const h=activityHarness('active',sample);
 await h.load();
 assert.equal(h.endpoint(),'/api/posts/trending?sort=active');
 assert.equal(h.title.textContent,'Conversaciones activas');
 assert.equal(h.hint.classList.hidden,false);
 assert.equal(h.renderCalls.length,1);
 assert.equal(h.renderCalls[0][0],sample);
 assert.equal(h.renderCalls[0][3].conversationMode,true);
});
test('other Explore tabs stay unchanged, no active label on normal discovery',async()=>{
 for(const [mode,endpoint] of [['trending','/api/posts/trending?sort=score'],['commented','/api/posts/trending?sort=comments'],['liked','/api/posts/trending?sort=likes'],['latest','/api/posts/feed?mode=latest']]){
   const h=activityHarness(mode,[]);
   await h.load();
   assert.equal(h.endpoint(),endpoint);
   assert.equal(h.hint.classList.hidden,true);
   assert.equal(h.renderCalls[0][3].conversationMode,false);
 }
});
test('empty results explain the absence of activity without inventing posts',async()=>{
 const h=activityHarness('active',[]);
 await h.load();
 assert.match(h.renderCalls[0][1],/Aún no hay conversaciones activas/);
 assert.match(h.renderCalls[0][2],/comentarios recientes/);
 assert.equal(h.renderCalls[0][0].length,0);
});
test('only the authentic comments button gets a readable recent count',()=>{
 const start=code.indexOf('function renderDiscoveryPosts(');
 const end=code.indexOf('async function loadTrendChips(',start);
 assert.ok(start>0&&end>start);
 const source=code.slice(start,end);
 const buttons=[],root={
   _html:'',
   set innerHTML(value){this._html=value},
   get innerHTML(){return this._html},
   querySelectorAll:selector=>{
     assert.equal(selector,'article.post');
     return [3,1].map(()=>{
       const b={textContent:'',attrs:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=v}};
       buttons.push(b);return {querySelector:key=>key==='[data-comments]'?b:null};
     });
   }
 };
 let bound=0;
 const sandbox={
   '$':selector=>selector==='#discoveryFeed'?root:null,
   postHTML:post=>'<article class="post" data-id="'+post.id+'"></article>',
   bindPostActions:()=>{bound++},
   Number,Math
 };
 vm.runInNewContext(source+'\nthis.render=renderDiscoveryPosts',sandbox);
 sandbox.render([{id:5,recent_comment_count:3},{id:6,recent_comment_count:1}], '','', {conversationMode:true});
 assert.equal(bound,1);
 assert.match(buttons[0].textContent,/3 comentarios esta semana/);
 assert.match(buttons[1].textContent,/1 comentario esta semana/);
 assert.match(buttons[0].attrs['aria-label'],/Entrar en la conversación/);
});
test('mobile filter stays inside Explore with touch targets and no Inicio blocks',()=>{
 assert.match(html,/data-content-mode="active">Conversaciones activas/);
 assert.match(html,/id="activeDiscussionsHintV3230"/);
 const css=read('public/social.css');
 assert.match(css,/#discoveryFeed \.discovery-discussion-cta-v3230/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.30');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.30'"));
 assert.ok(html.includes('/social.js?v=3.2.30'));
 assert.ok(html.includes('/social.css?v=3.2.30'));
});
