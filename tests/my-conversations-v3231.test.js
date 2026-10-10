'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js');
const html=read('public/app.html');
const route=read('src/routes/posts.js');
const css=read('public/social.css');
const trending=route.slice(route.indexOf("router.get('/trending'"),route.indexOf("router.get('/trends'"));

test('my conversations are opted into only by the active discovery filter',()=>{
  assert.match(trending,/const myConversations=isActive && String\(req\.query\.scope\|\|''\)==='mine'/);
  assert.match(trending,/p\.user_id=\$1 OR EXISTS \(\s*SELECT 1 FROM comments mine WHERE mine\.post_id=p\.id AND mine\.user_id=\$1/);
  assert.match(trending,/last_comment_at DESC, recent_comment_count DESC/);
  assert.match(trending,/recent_comment_count DESC, last_comment_at DESC/);
  assert.match(trending,/scope:myConversations\?'mine':'all'/);
  assert.match(trending,/LIMIT 40/);
  assert.doesNotMatch(trending,/INSERT INTO|UPDATE posts|DELETE FROM/);
});
test('the existing privacy and recency gates also apply to personal conversations',()=>{
  for(const rule of ["requireAuth","postAudienceWhere('$1','p')","p.audience='public' AND p.content_level='normal'","moderation_status='published'","u.status='active'","u.discoverable=true","interval '7 days'","blocked_id FROM blocks","blocker_id FROM blocks","muted_id FROM mutes","discovery_hidden_items","gateRows"]){
    assert.ok(trending.includes(rule),'Missing privacy rule: '+rule);
  }
});
test('contextual mobile controls are accessible and only inside active discussions',()=>{
  assert.match(html,/id="activeDiscussionScopeV3231"/);
  assert.match(html,/role="group" aria-label="Filtrar conversaciones activas"/);
  assert.match(html,/data-discussion-scope="all"/);
  assert.match(html,/data-discussion-scope="mine"/);
  assert.match(js,/activeDiscussionScopeV3231'\)\?\.classList\.toggle\('hidden',mode!=='active'\)/);
  assert.match(js,/all\('\[data-discussion-scope\]'\)\.forEach\(button=>\{/);
  assert.match(js,/button\.setAttribute\?\.\('aria-pressed',String\(selected\)\)/);
  assert.match(css,/\.discussion-scope-v3231 button\{/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.ok(html.indexOf('data-discussion-scope="mine"') > html.indexOf('<section class="content-discovery">'));
});
function harness(scope,posts){
  const title={textContent:''},root={innerHTML:''};
  const hint={classList:{toggle() {}}};
  const scopeGroup={hidden:true,classList:{toggle(_,flag){this.hidden=flag}}};
  const scopeButtons=['all','mine'].map(value=>({
    dataset:{discussionScope:value},active:false,pressed:null,
    classList:{toggle(_cls,flag){this.active=flag}},
    setAttribute(key,value){if(key==='aria-pressed')this.pressed=value}
  }));
  const contentButtons=['foryou','active','saved'].map(value=>({dataset:{contentMode:value},classList:{toggle(){}}}));
  let endpoint='',rendered;
  const sandbox={
    activeContentMode:'foryou',activePostSearch:'',
    discussionScope:scope,discoveryRequestSequence:0,
    '$':selector=>({
      '#contentDiscoveryTitle':title,'#discoveryFeed':root,
      '#activeDiscussionsHintV3230':hint,
      '#activeDiscussionScopeV3231':scopeGroup
    })[selector]||null,
    all:selector=>selector==='[data-discussion-scope]'?scopeButtons:selector==='[data-content-mode]'?contentButtons:[],
    api:async url=>{endpoint=url;return {r:{ok:true},d:{posts}}},
    renderDiscoveryPosts:(...args)=>{rendered=args}
  };
  const start=js.indexOf('async function loadDiscoveryContent(');
  const end=js.indexOf('async function searchPosts(',start);
  vm.runInNewContext(js.slice(start,end)+'\nthis.load=loadDiscoveryContent',sandbox);
  return {load:mode=>sandbox.load(mode),endpoint:()=>endpoint,rendered:()=>rendered,scopeGroup,title,sandbox};
}
test('mine returns actual participating conversations; normal trends remain unchanged',async()=>{
  const mine=harness('mine',[{id:4,recent_comment_count:2}]);
  await mine.load('active');
  assert.equal(mine.endpoint(),'/api/posts/trending?sort=active&scope=mine');
  assert.equal(mine.title.textContent,'Conversaciones activas');
  assert.equal(mine.scopeGroup.hidden,false);
  assert.equal(mine.rendered()[3].conversationMode,true);
  const all=harness('all',[]);
  await all.load('active');
  assert.equal(all.endpoint(),'/api/posts/trending?sort=active');
  const saved=harness('mine',[]);
  await saved.load('saved');
  assert.equal(saved.endpoint(),'/api/posts/saved');
  assert.equal(saved.scopeGroup.hidden,true);
});
test('an empty personal filter explains that nobody is inventing activity',async()=>{
  const h=harness('mine',[]);
  await h.load('active');
  assert.match(h.rendered()[1],/Aún no tienes conversaciones activas/);
  assert.match(h.rendered()[2],/tus publicaciones y aquellas en las que hayas comentado/);
});
test('release is versioned and registered for CI',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.31');
  assert.ok(read('server.js').includes("APP_VERSION='3.2.31'"));
  assert.ok(html.includes('/social.js?v=3.2.31'));
  assert.ok(read('.github/workflows/validate-js.yml').includes('npm run test:my-conversations'));
});
