'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/app.html');
const css=read('public/social.css');
const js=read('public/social.js');

const ownStart=js.indexOf('function renderOwnProfilePostFeed(root,posts,emptyText){');
const ownEnd=js.indexOf('async function loadProfile(mode = ownProfileMode)',ownStart);
assert.ok(ownStart>=0 && ownEnd>ownStart,'own profile renderer exists');
const rendererSource=js.slice(ownStart,ownEnd);
function renderer(){
  const calls=[];
  const context={
    postHTML:post=>{calls.push(['postHTML',post.id]);return '<article class="post" data-id="'+post.id+'"><div class="post-caption">Texto e imagen</div><button data-comments="'+post.id+'">💬</button></article>';},
    bindPostActions:node=>calls.push(['bindPostActions',node.innerHTML.length]),
    esc:text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  };
  const fn=vm.runInNewContext(rendererSource+'\nrenderOwnProfilePostFeed',context);
  return {fn,calls};
}

test('own profile uses a feed container, not the explore thumbnail grid',()=>{
  assert.match(html,/id="profilePosts" class="own-profile-feed"/);
  assert.doesNotMatch(html,/id="profilePosts" class="explore-grid/);
  assert.match(html,/aria-label="Publicaciones completas de tu perfil"/);
});
test('first-party and visited profile both use full article markup',()=>{
  assert.match(js,/items\.map\(post=>postHTML\(post\)\)\.join\(''\)/);
  assert.match(js,/posts\.map\(post=>postHTML\(post\)\)\.join\(''\)/);
});
test('renderer outputs complete post articles in original API order',()=>{
  const x=renderer(),root={innerHTML:''};
  x.fn(root,[{id:11},{id:12}],'Sin publicaciones');
  assert.equal((root.innerHTML.match(/class="post"/g)||[]).length,2);
  assert.ok(root.innerHTML.indexOf('data-id="11"')<root.innerHTML.indexOf('data-id="12"'));
  assert.ok(root.innerHTML.includes('data-comments="12"'));
  assert.deepEqual(x.calls,[['postHTML',11],['postHTML',12],['bindPostActions',root.innerHTML.length]]);
});
test('renderer binds all existing post interactions to the newly inserted cards',()=>{
  const x=renderer(),root={innerHTML:''};
  x.fn(root,[{id:12}],'Vacío');
  assert.equal(x.calls.filter(call=>call[0]==='bindPostActions').length,1);
  assert.match(js,/function bindPostActions\(root\)/);
  for(const attr of ['data-like','data-comments','data-repost','data-share','data-manage-post']){
    assert.ok(js.includes(attr),attr);
  }
});
test('reposts and media remain independent modes with the existing endpoint',()=>{
  assert.match(js,/setOwnProfileMode\(mode\)/);
  assert.match(js,/const selectedMode=ownProfileMode/);
  assert.match(js,/api\/posts\/user\/\$\{encodeURIComponent\(username\)\}\?mode=\$\{encodeURIComponent\(selectedMode\)\}/);
  for(const mode of ['posts','reposts','media'])assert.ok(html.includes('data-own-profile-mode="'+mode+'"'));
});
test('empty posts show a proper empty state instead of a blank grid',()=>{
  const x=renderer(),root={innerHTML:''};
  x.fn(root,[], 'Todavía no tienes publicaciones.');
  assert.match(root.innerHTML,/profile-content-empty/);
  assert.match(root.innerHTML,/Todavía no tienes publicaciones/);
  assert.equal(x.calls.length,0);
});
test('empty state safely escapes user-visible messages',()=>{
  const x=renderer(),root={innerHTML:''};
  x.fn(root,null,'<script>alert(1)</script>');
  assert.doesNotMatch(root.innerHTML,/<script>/);
  assert.match(root.innerHTML,/&lt;script>/);
});
test('missing feed target is tolerated for delayed navigation',()=>{
  const x=renderer();
  assert.doesNotThrow(()=>x.fn(null,[{id:12}],'Vacío'));
  assert.equal(x.calls.length,0);
});
test('error state reports failed API, not a fabricated empty feed',()=>{
  const source=js.slice(js.indexOf('async function loadProfile('),js.indexOf('function shareProfile(profile) {'));
  assert.ok(source.includes("if(!r?.ok)"));
  assert.ok(source.includes('No se pudo cargar el contenido.'));
  assert.match(source,/renderOwnProfilePostFeed\(ownPostsRoot,d\?\.posts,emptyText\)/);
});
test('rapid tab changes cannot let stale requests replace the latest result',()=>{
  assert.match(js,/let ownProfileRequestSequence=0/);
  assert.match(js,/const sequence=\+\+ownProfileRequestSequence/);
  assert.match(js,/sequence!==ownProfileRequestSequence/);
  assert.match(js,/ownProfileMode!==selectedMode/);
  assert.match(js,/String\(me\?\.username\)!==username/);
});
test('own profile still provides editing, sharing, verification and Creator Center',()=>{
  const source=js.slice(js.indexOf('async function loadProfile('),js.indexOf('function shareProfile(profile) {'));
  for(const id of ['editProfile','shareOwnProfile','creatorCenter','profileMoreToggle','privacySettings','trustSettings','sensitiveToggle'])
    assert.ok(source.includes(id),id);
  assert.match(html,/id="profileFull"/);
  assert.match(html,/id="consentRequests"/);
});
test('CSS displays complete large media, never fixed thumbnail crops',()=>{
  assert.match(css,/#profileView #profilePosts\.own-profile-feed\{[\s\S]*?flex-direction:column/);
  assert.match(css,/#profileView #profilePosts\.own-profile-feed \.post-media img,/);
  assert.match(css,/max-height:min\(90vh,1000px\)/);
  assert.match(css,/object-fit:contain/);
  assert.doesNotMatch(html,/id="profilePosts" class=".*profile-grid/);
});
test('mobile feed is one-column with safe bottom navigation spacing',()=>{
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?#profileView #profilePosts\.own-profile-feed\{/);
  assert.match(css,/padding:0 0 calc\(80px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/#profileView #profilePosts\.own-profile-feed>\.post\{border-radius:14px\}/);
});
test('current version is V3.0.5 and the new tests are part of CI',()=>{
  const pkg=require('../package.json');
  assert.equal(pkg.version,'3.0.5');
  assert.match(read('server.js'),/const APP_VERSION='3\.0\.5'/);
  assert.match(pkg.scripts['test:own-profile'],/own-profile-full-posts-v305/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:own-profile/);
});
