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
function element(){
  const attrs={};
  const classes=new Set();
  return {dataset:{},listeners:{},value:'',textContent:'',hidden:false,tabIndex:-1,scrollTop:50,
    setAttribute(key,value){attrs[key]=value},
    getAttribute(key){return attrs[key]},
    classList:{toggle(key,yes){if(yes)classes.add(key);else classes.delete(key)},contains(key){return classes.has(key)}},
    focus(){this.focused=true},
    addEventListener(key,listener){this.listeners[key]=listener},
    querySelector(selector){return selector==='.composer-card-v3227'?this.card:null},
    card:null
  };
}
function fixture(){
 const keys=['#modal','#createForm','#storyForm','#composerPostTabV3227','#composerStoryTabV3227','#composerReelTabV3228','#composerKindV3228','#composerHeadingV3227','#composerPublishButtonV3228','#composerReelHintV3228','#uploadText','#createMessage','#storyMessage'];
 const fields=Object.fromEntries(keys.map(key=>[key,element()]));
 const tabs=['#composerPostTabV3227','#composerStoryTabV3227','#composerReelTabV3228'].map((key,i)=>{
   const tab=fields[key];tab.dataset.composerTab=['post','story','reel'][i];return tab;
 });
 const card=element();fields['#modal'].card=card;
 const start=js.indexOf('function selectComposerModeV3227(');
 const end=js.indexOf('async function openModal(',start);
 assert.ok(start>0&&end>start);
 const context={
   '$':selector=>fields[selector]||null,
   all:selector=>selector==='[data-composer-tab]'?tabs:[]
 };
 vm.runInNewContext(js.slice(start,end)+'\nthis.select=selectComposerModeV3227',context);
 return {fields,tabs,card,select:context.select};
}
test('three distinct modes preserve same selected media, changing the hidden post type',()=>{
 const f=fixture(),fields=f.fields;
 const selectedMedia={name:'vacaciones.mp4'};
 fields['#mediaFile']={files:[selectedMedia]};
 f.select('post');
 assert.equal(fields['#composerKindV3228'].value,'post');
 assert.equal(fields['#createForm'].hidden,false);
 assert.equal(fields['#storyForm'].hidden,true);
 f.select('reel');
 assert.equal(fields['#composerKindV3228'].value,'reel');
 assert.equal(fields['#createForm'].hidden,false);
 assert.equal(fields['#storyForm'].hidden,true);
 assert.equal(fields['#createForm'].getAttribute('aria-labelledby'),'composerReelTabV3228');
 assert.equal(fields['#composerPublishButtonV3228'].textContent,'Publicar Reel');
 assert.equal(fields['#composerReelHintV3228'].hidden,false);
 assert.match(fields['#uploadText'].textContent,/obligatorio/);
 assert.equal(fields['#mediaFile'].files[0],selectedMedia);
 f.select('story');
 assert.equal(fields['#createForm'].hidden,true);
 assert.equal(fields['#storyForm'].hidden,false);
 assert.equal(fields['#composerKindV3228'].value,'post');
 assert.equal(fields['#composerHeadingV3227'].textContent,'Crear Story');
 assert.equal(fields['#mediaFile'].files[0],selectedMedia);
 f.select('post');
 assert.equal(fields['#composerPublishButtonV3228'].textContent,'Publicar ahora');
 assert.match(fields['#uploadText'].textContent,/opcional/);
});
test('three keyboard-navigable tabs wrap safely and update selected semantics',()=>{
 const f=fixture();f.select('post');
 const [post,story,reel]=f.tabs;
 let prevented=0;
 post.listeners.keydown({key:'ArrowRight',preventDefault(){prevented++}});
 assert.equal(story.getAttribute('aria-selected'),'true');
 assert.equal(story.focused,true);
 story.listeners.keydown({key:'ArrowRight',preventDefault(){prevented++}});
 assert.equal(reel.getAttribute('aria-selected'),'true');
 reel.listeners.keydown({key:'ArrowRight',preventDefault(){prevented++}});
 assert.equal(post.getAttribute('aria-selected'),'true');
 post.listeners.keydown({key:'End',preventDefault(){prevented++}});
 assert.equal(reel.getAttribute('aria-selected'),'true');
 reel.listeners.keydown({key:'Home',preventDefault(){prevented++}});
 assert.equal(post.getAttribute('aria-selected'),'true');
 assert.equal(prevented,5);
 assert.deepEqual(f.tabs.map(t=>t.tabIndex),[0,-1,-1]);
});
test('classification is on the first page for Publication/Reel and Story, never hidden under Más opciones',()=>{
 const modal=html.slice(html.indexOf('<div id="modal"'),html.indexOf('<div id="profileModal"'));
 const post=modal.slice(modal.indexOf('<form id="createForm"'),modal.indexOf('<form id="storyForm"'));
 const story=modal.slice(modal.indexOf('<form id="storyForm"'));
 const advancedStart=post.indexOf('<details id="composerAdvancedV3227"');
 assert.ok(advancedStart>0);
 assert.ok(post.indexOf('id="composerPostLevelV3228"')<advancedStart);
 assert.ok(story.indexOf('id="storyContentLevelV3227"')>0);
 assert.doesNotMatch(post.slice(advancedStart),/Formato<select|name="kind"|name="contentLevel"/);
 assert.doesNotMatch(story,/<details[^>]+composer-story-options/);
 assert.match(modal,/id="composerKindV3228" name="kind" value="post"/);
 for(const name of ['Publicación','Story','Reel'])assert.ok(modal.includes('>'+name+'</button>'));
});
test('media required for Story/Reel, optional for text posts, classification sent to original endpoints',()=>{
 const post=js.slice(js.indexOf("$('#createForm').addEventListener('submit'"),js.indexOf("$('#storyForm').addEventListener('submit'"));
 const story=js.slice(js.indexOf("$('#storyForm').addEventListener('submit'"),js.indexOf("$('#shareInternalForm')"));
 assert.match(post,/new FormData\(e.target\)/);
 assert.match(post,/const kind = String\(fd.get\('kind'\)/);
 assert.match(post,/kind === 'reel' && !file/);
 assert.match(post,/if \(!file && !caption && communityType==='none'\)/);
 assert.match(post,/contentLevel: fd.get\('contentLevel'\)/);
 assert.match(post,/api\('\/api\/posts'/);
 assert.match(story,/await ensureUpload\(\)/);
 assert.match(story,/storyContentLevelV3227/);
 assert.match(story,/api\('\/api\/stories'/);
 assert.match(js,/b\.closest\('#stories'\)\?'story':'post'/);
});
test('three responsive tabs fit small phones without changing the published feed',()=>{
 assert.match(css,/#modal \.composer-tabs-v3227\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/\.composer-classification-v3228/);
 assert.match(css,/#modal \.composer-actions-v3227\{/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.33');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.33'"));
 assert.ok(html.includes('/social.js?v=3.2.33'));
 assert.ok(html.includes('/social.css?v=3.2.33'));
 assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
});
