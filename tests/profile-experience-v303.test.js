'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {publicProfileSeo}=require('../src/services/public-profile-seo-v302');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');
function sourceBetween(start,end){
 const first=js.indexOf(start),last=js.indexOf(end,first);
 assert.ok(first>=0&&last>first,'Missing source markers '+start+' to '+end);
 return js.slice(first,last);
}
function contentHarness({posts=[],status=200}={}){
 let bound=0;
 const requests=[],rootNode={innerHTML:''};
 const context={
  $:selector=>selector==='#publicProfilePosts'?rootNode:null,
  all:()=>[],
  publicProfilePostsSequence:0,activePublicProfileUsername:'nanitaES',
  api:async url=>{requests.push(url);return {r:{ok:status===200},d:{posts}};},
  postHTML:p=>'<article class="post" data-id="'+p.id+'">Publicación completa</article>',
  profileTilesHTML:()=>{throw Error('Profile tiles must not be used');},
  bindPostActions:()=>{bound++;},esc:v=>String(v),encodeURIComponent
 };
 const load=vm.runInNewContext(sourceBetween("async function loadPublicProfileContent(username, mode = 'posts') {",'function leavePublicProfile(){')+'\nloadPublicProfileContent',context);
 return {load,rootNode,requests,context,boundCount:()=>bound};
}
test('foreign profile is an app main section, not a blocking modal',()=>{
 const begin=html.indexOf('<main id="appMain"'),end=html.indexOf('</main>',begin),pos=html.indexOf('id="publicProfileView"');
 assert.ok(begin>=0 && pos>begin && pos<end);
 assert.ok(html.includes('id="publicProfileContent"')&&html.includes('id="backPublicProfile"'));
 assert.ok(!html.includes('id="publicProfileModal"'));
 assert.doesNotMatch(js,/publicProfileModal|closePublicProfileModal/);
});
test('navigation preserves previous section and adds a real back action',()=>{
 const src=sourceBetween('function leavePublicProfile(){','async function openPostFocus(');
 assert.match(src,/showView\('publicProfile'\)/);
 assert.match(src,/publicProfileReturnView=activeViewName\|\|'feed'/);
 assert.match(src,/viewScrollPositions\.set\('publicProfile',0\)/);
 assert.match(src,/showView\(publicProfileReturnView==='publicProfile'\?'feed':publicProfileReturnView\)/);
 assert.match(src,/backPublicProfile/);
});
test('your own username opens the existing own profile',()=>{
 const s=sourceBetween('async function openPublicProfile(username) {','async function openPostFocus(');
 assert.match(s,/if \(me && clean\.toLowerCase\(\) === String\(me\.username\)\.toLowerCase\(\)\)/);
 assert.match(s,/showView\('profile'\)/);
});
test('posts are complete interactive articles, not square thumbnails',async()=>{
 const h=contentHarness({posts:[{id:11},{id:12}]});
 await h.load('nanitaES');
 assert.deepEqual(h.requests,['/api/posts/user/nanitaES?mode=posts']);
 assert.equal(h.boundCount(),1);
 assert.equal((h.rootNode.innerHTML.match(/class="post"/g)||[]).length,2);
 assert.ok(!h.rootNode.innerHTML.includes('profile-content-tile'));
});
test('posts, reposts and media reuse privacy-filtered post endpoint',async()=>{
 const h=contentHarness({posts:[{id:9}]});
 await h.load('nanitaES','reposts');
 await h.load('nanitaES','media');
 assert.deepEqual(h.requests,['/api/posts/user/nanitaES?mode=reposts','/api/posts/user/nanitaES?mode=media']);
 assert.equal(h.boundCount(),2);
 assert.match(sourceBetween('async function loadPublicProfileContent','function leavePublicProfile'),/bindPostActions\(root\)/);
});
test('an empty profile shows a helpful readable state',async()=>{
 const h=contentHarness();await h.load('nanitaES');
 assert.match(h.rootNode.innerHTML,/Todavía no tiene publicaciones visibles/);
});
test('post API errors are shown without fake results',async()=>{
 const h=contentHarness({status:503});await h.load('nanitaES');
 assert.match(h.rootNode.innerHTML,/No se pudo cargar el contenido/);
 assert.equal(h.boundCount(),0);
});
test('late responses cannot overwrite another opened profile',()=>{
 const s=sourceBetween('async function loadPublicProfileContent','function leavePublicProfile');
 assert.match(s,/sequence!==publicProfilePostsSequence/);
 assert.match(s,/activePublicProfileUsername\.toLowerCase\(\)!==String\(username\)\.toLowerCase\(\)/);
 assert.match(sourceBetween('async function openPublicProfile','async function openPostFocus'),/requestSequence!==publicProfileRequestSequence/);
});
test('follow, message, close circle, share, mute and block are preserved',()=>{
 const s=sourceBetween('async function openPublicProfile','async function openPostFocus');
 for(const action of ['data-public-follow','data-message-profile','data-close-connection','data-share-profile','data-mute-profile','data-block-profile'])
   assert.ok(s.includes(action),action);
 assert.match(s,/await loadConversations\(d\.conversationId\)/);
 assert.match(s,/leavePublicProfile\(\)/);
});
test('responsive full feed contains non-cropped media',()=>{
 assert.match(css,/#publicProfileView\{width:100%;max-width:1040px/);
 assert.match(css,/#publicProfileView \.visited-profile-feed\{display:flex;flex-direction:column/);
 assert.match(css,/max-height:min\(90vh,1000px\);object-fit:contain/);
 assert.match(css,/#publicProfileView \.public-profile-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('cover image is complete and avatar stays above the cover',()=>{
 assert.match(css,/#publicProfileView \.public-profile-card>\.cover\{[\s\S]*?background-size:contain/);
 assert.match(css,/#publicProfileView \.public-profile-card \.profile-avatar\{[\s\S]*?z-index:4/);
});
test('public and in-app profiles use correct Spanish singular labels',()=>{
 const server=read('server.js');
 for(const label of ["'publicación pública':'publicaciones públicas'","'seguidor':'seguidores'","'publicación':'publicaciones'"])assert.ok(server.includes(label),label);
 assert.match(js,/profileCountLabel\(profile\.post_count,'publicación','publicaciones'\)/);
 assert.match(js,/Number\(profile\.follower_count\)===1\?'seguidor':'seguidores'/);
 assert.match(js,/Number\(me\.post_count\)===1\?'publicación':'publicaciones'/);
});
test('SEO copy is fluent for one or multiple public posts',()=>{
 const base={username:'nanitaES',display_name:'NanitaES',bio:'',creator_headline:'',discoverable:true};
 const single=publicProfileSeo({...base,public_post_count:1},{url:'https://redlibertad.com/perfil/nanitaES'});
 const many=publicProfileSeo({...base,public_post_count:8},{url:'https://redlibertad.com/perfil/nanitaES'});
 assert.match(single.description,/su publicación y sus ideas/);
 assert.doesNotMatch(single.description,/1 publicaciones/);
 assert.match(many.description,/sus publicaciones/);
 assert.ok(single.description.length<=158 && many.description.length<=158);
});
test('patch version and Actions include the profile regression suite',()=>{
 const pkg=require('../package.json');
 assert.match(pkg.version,/^3\.[0-9]+\.[0-9]+$/);
 assert.match(read('server.js'),new RegExp("const APP_VERSION='"+pkg.version.replace(/\./g,'\\.')+"'"));
 assert.match(pkg.scripts['test:profile-experience'],/profile-experience-v303\.test\.js/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:profile-experience/);
});
