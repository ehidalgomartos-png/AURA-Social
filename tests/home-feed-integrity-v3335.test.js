'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
function createHarness(){
 const start=social.indexOf('async function loadFeed(');
 const end=social.indexOf('function renderStoryViewer()',start);
 assert.ok(start>=0 && end>start);
 const pending=[],toasts=[],events=[],bound=[],tabs=[];
 for(const name of ['foryou','following','latest','close','vip']){
  const classes=new Set();
  tabs.push({dataset:{mode:name},classList:{
   toggle:(x,yes)=>yes?classes.add(x):classes.delete(x),
   contains:x=>classes.has(x)
  }});
 }
 const attrs=new Map();
 let markup='';
 const feed={setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),
   get children(){return markup?[{}]:[];},
   get innerHTML(){return markup;},
   set innerHTML(v){markup=v;}
 };
 const ctx={String,Number,Array,me:{id:7},
  feedRequestSequence:0,currentMode:'latest',
  lastRenderedFeedModeV3335:null,lastRenderedFeedOwnerV3335:null,
  $:q=>q==='#feed'?feed:null,all:()=>tabs,
  api:url=>new Promise(resolve=>pending.push({url,resolve})),
  navigator:{onLine:true},
  uiStateHTML:({title})=>'<section>'+title+'</section>',
  toast:t=>toasts.push(t),
  postHTML:p=>'<article>'+p.caption+'</article>',
  bindPostActions:()=>bound.push('bound'),
  document:{dispatchEvent:event=>events.push(event.detail)},
  CustomEvent:class{constructor(name,args){this.detail=args.detail;}},
  markVipSeen:()=>{}
 };
 vm.runInNewContext(social.slice(start,end)+'\nthis.load=loadFeed;',ctx);
 const reply=(index,{ok=true,posts=[],error='network_error'}={})=>
  pending[index].resolve({r:{ok},d:{posts,error}});
 return {ctx,feed,tabs,pending,toasts,events,bound,reply,load:ctx.load,
  active:()=>tabs.filter(x=>x.classList.contains('active')).map(x=>x.dataset.mode)};
}
test('a failed move from Nuevo to Siguiendo keeps real Nuevo content and its selected tab',async()=>{
 const h=createHarness();
 const initial=h.load('latest');h.reply(0,{posts:[{caption:'Real post'}]});await initial;
 const failed=h.load('following');h.reply(1,{ok:false});await failed;
 assert.match(h.feed.innerHTML,/Real post/);
 assert.deepEqual(h.active(),['latest']);
 assert.equal(h.ctx.currentMode,'latest');
 assert.deepEqual(h.events.map(x=>x.mode),['latest']);
 assert.match(h.toasts[0],/Seguimos mostrando el filtro anterior/);
 assert.equal(h.feed.getAttribute('aria-busy'),'false');
});
test('a failed refresh of the same tab preserves its posts without inventing another mode',async()=>{
 const h=createHarness();const a=h.load('foryou');
 h.reply(0,{posts:[{caption:'Real community post'}]});await a;
 const b=h.load('foryou');h.reply(1,{ok:false});await b;
 assert.deepEqual(h.active(),['foryou']);
 assert.equal(h.ctx.currentMode,'foryou');
 assert.match(h.feed.innerHTML,/Real community post/);
 assert.equal(h.events.length,1);
});
test('a confirmed switch replaces the feed and sends the event only after rendering',async()=>{
 const h=createHarness();const a=h.load('latest');
 h.reply(0,{posts:[{caption:'Older real post'}]});await a;
 const b=h.load('following');h.reply(1,{posts:[{caption:'Following post'}]});await b;
 assert.deepEqual(h.active(),['following']);
 assert.doesNotMatch(h.feed.innerHTML,/Older real post/);
 assert.match(h.feed.innerHTML,/Following post/);
 assert.deepEqual(h.events.map(x=>x.mode),['latest','following']);
 assert.equal(h.ctx.lastRenderedFeedOwnerV3335,'7');
});
test('late responses cannot overwrite a newer mode, including after a different account signs in',async()=>{
 const h=createHarness();
 const older=h.load('latest'),newer=h.load('following');
 h.reply(1,{posts:[{caption:'New filter'}]});await newer;
 h.reply(0,{posts:[{caption:'Stale post'}]});await older;
 assert.deepEqual(h.active(),['following']);
 assert.match(h.feed.innerHTML,/New filter/);
 const crossing=h.load('vip');h.ctx.me={id:8};
 h.reply(2,{posts:[{caption:'Former user secret'}]});await crossing;
 assert.equal(h.feed.innerHTML,'');
 assert.equal(h.ctx.lastRenderedFeedModeV3335,null);
 const failed=h.load('vip');h.reply(3,{ok:false});await failed;
 assert.doesNotMatch(h.feed.innerHTML,/Former user secret|New filter/);
 assert.match(h.feed.innerHTML,/No se pudo actualizar el feed/);
});
test('no change to chronological Nuevo, server privacy or reviewed editorial rules',()=>{
 const route=read('src/routes/posts.js');
 const start=route.indexOf("router.get('/feed'");
 const end=route.indexOf("router.get('/new-activity'",start);
 const feed=route.slice(start,end);
 assert.match(feed,/p\.created_at DESC,p\.id DESC/);
 assert.match(feed,/postAudienceWhere\('\$1','p'\)/);
 assert.match(feed,/blocked_id FROM blocks/);
 assert.match(feed,/muted_id FROM mutes/);
 assert.match(read('public/editorial-interleave-v3224.js'),/mode==='foryou'\|\|mode==='latest'/);
 assert.match(read('public/editorial-home-v324.js'),/posts\[insertAt\[i\]-1\]\.after\(card\)/);
 assert.match(social,/No hay nuevas sugerencias ahora/);
 assert.equal(read('public/app.html').split('feedmode=3.3.35').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/home-feed-integrity-v3335\.test\.js/);
});
