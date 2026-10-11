'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/app.html');
const js=read('public/social.js');
const css=read('public/social.css');
function node(){
 const attributes={};
 const classSet=new Set();
 return {
   hidden:false,tabIndex:0,dataset:{},textContent:'',scrollTop:40,
   classList:{toggle:(name,on)=>{if(on)classSet.add(name);else classSet.delete(name)},contains:name=>classSet.has(name)},
   setAttribute:(k,v)=>{attributes[k]=v},
   getAttribute:k=>attributes[k],
   focus(){this.focused=true},
   querySelector(sel){return sel==='.composer-card-v3227'?this.card:null},
   card:null,
   addEventListener(type,callback){this.listeners[type]=callback},
   listeners:{}
 };
}
function controller(){
 const post=node(),story=node(),postTab=node(),storyTab=node(),heading=node(),modal=node(),createMessage=node(),storyMessage=node();
 const card=node();
 modal.card=card;
 const mapping={
   '#modal':modal,'#createForm':post,'#storyForm':story,
   '#composerPostTabV3227':postTab,'#composerStoryTabV3227':storyTab,
   '#composerHeadingV3227':heading,'#createMessage':createMessage,'#storyMessage':storyMessage
 };
 postTab.dataset.composerTab='post';
 storyTab.dataset.composerTab='story';
 const start=js.indexOf('function selectComposerModeV3227(');
 const end=js.indexOf('async function openModal(',start);
 assert.ok(start>=0&&end>start,'Composer mode controller available');
 const sandbox={
   '$':sel=>mapping[sel]||null,
   all:sel=>sel==='[data-composer-tab]'?[postTab,storyTab]:[]
 };
 vm.runInNewContext(js.slice(start,end)+'\nthis.select=selectComposerModeV3227',sandbox);
 return {select:sandbox.select,post,story,postTab,storyTab,heading,modal,card,createMessage,storyMessage};
}
test('composer has three accessible tabs and one shared media input outside both forms',()=>{
 const modal=html.slice(html.indexOf('<div id="modal"'),html.indexOf('<div id="profileModal"'));
 const upload=modal.indexOf('id="mediaFile"');
 const post=modal.indexOf('<form id="createForm"');
 const story=modal.indexOf('<form id="storyForm"');
 assert.ok(upload>0&&upload<post&&post<story);
 assert.match(modal,/role="tablist"/);
 assert.match(modal,/id="composerPostTabV3227"[^>]*aria-selected="true"/);
 assert.match(modal,/id="composerStoryTabV3227"[^>]*aria-selected="false"/);
 assert.match(modal,/id="composerReelTabV3228"[^>]*aria-selected="false"/);
 assert.match(modal,/id="storyForm"[^>]*hidden/);
 assert.match(modal,/id="preview"/);
});
test('switch to Story hides post content and switches semantics without clearing the media',()=>{
 const h=controller();
 h.select('story');
 assert.equal(h.post.hidden,true);
 assert.equal(h.story.hidden,false);
 assert.equal(h.postTab.getAttribute('aria-selected'),'false');
 assert.equal(h.storyTab.getAttribute('aria-selected'),'true');
 assert.equal(h.storyTab.tabIndex,0);
 assert.equal(h.heading.textContent,'Crear Story');
 assert.equal(h.modal.dataset.composerMode,'story');
 assert.equal(h.card.scrollTop,0);
 h.select('post',{focus:true});
 assert.equal(h.post.hidden,false);
 assert.equal(h.story.hidden,true);
 assert.equal(h.postTab.focused,true);
 assert.equal(h.heading.textContent,'Crear publicación');
});
test('post advanced settings hide complexity but preserve all workflow inputs',()=>{
 const modal=html.slice(html.indexOf('<div id="modal"'),html.indexOf('<div id="profileModal"'));
 const adv=modal.slice(modal.indexOf('<details id="composerAdvancedV3227"'),modal.indexOf('class="composer-actions-v3227"'));
 assert.match(adv,/Más opciones/);
 for(const field of ['name="participants"','name="collaborators"','name="editorialDate"','name="editorialLabel"','name="scheduledFor"','name="communityType"','name="communityPrompt"','name="pollOption1"','id="postCircleMentionOptions"']){
   assert.ok(adv.includes(field),'Missing '+field);
 }
 assert.match(modal,/id="composerDraftV3227"[^>]*data-publish-mode="draft"/);
 assert.match(modal,/id="composerKindV3228" name="kind" value="post"/);
 assert.match(modal,/id="composerPostLevelV3228" name="contentLevel"/);
 assert.doesNotMatch(adv,/Formato<select|name="contentLevel"/);
 assert.match(modal,/data-publish-mode="now"/);
 assert.match(adv,/data-publish-mode="scheduled"/);
 assert.ok(js.includes("'#composerDraftV3227')?.classList.toggle('hidden',!me?.creator_verified)"));
});
test('Story has independent classification; clears file after successful publishing',()=>{
 const story=html.slice(html.indexOf('<form id="storyForm"'),html.indexOf('<div id="profileModal"'));
 assert.match(story,/name="audience"/);
 assert.match(story,/id="storyContentLevelV3227" name="contentLevel"/);
 assert.match(story,/id="storyCircleAudience"/);
 assert.doesNotMatch(story,/name="participants"|name="scheduledFor"/);
 assert.ok(js.includes("const level = $('#storyContentLevelV3227').value;"));
 assert.ok(js.includes("$('#modal').classList.add('hidden'); clearPostMedia(); await loadStories();"));
 assert.ok(js.includes("await ensureUpload()"));
});
test('mobile is compact with sticky actions, minimum touch size and reduced motion',()=>{
 assert.match(css,/#modal \.composer-actions-v3227\{/);
 assert.match(css,/position:sticky;bottom:-1px/);
 assert.match(css,/#modal \.composer-actions-v3227 button\{[^}]*min-height:48px/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/#modal \.composer-media-v3227 \.upload-drop\{min-height:111px\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/#modal #createForm\.hidden,#modal #storyForm\.hidden/);
});
test('session/permission, server endpoints and previous Inicio feed remain unchanged',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.37');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.37'"));
 assert.ok(html.includes('/social.js?v=3.2.37'));
 assert.ok(html.includes('/social.css?v=3.2.37'));
 assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
 assert.match(js,/runSocialSubmitOnce\(e.currentTarget/);
 assert.match(js,/verified_creator_required_for_nudity/);
 assert.match(js,/verified_creator_required_for_vip_content/);
});
