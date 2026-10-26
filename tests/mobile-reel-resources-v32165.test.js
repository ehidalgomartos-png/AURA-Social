'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const social=read('public/social.js');

function harness(opts={}){
 const events={},videos=[],observers=[],calls={play:0,pause:0,fetch:0};
 let feedResponse=opts.response || {r:{ok:true},d:{posts:[{id:5}]}};
 const video={
  paused:false,muted:false,playsInline:false,
  pause(){this.paused=true;calls.pause++},
  play(){calls.play++;this.paused=false;return Promise.resolve()}
 };
 videos.push(video);
 const card={dataset:{reelObserve:'5'},classList:{add(){},remove(){}},
  querySelector:()=>video};
 const root={innerHTML:'',scrollTop:0};
 class Observer {
  constructor(callback,settings){this.callback=callback;this.settings=settings;this.targets=[];this.disconnected=false;observers.push(this)}
  observe(target){this.targets.push(target)}
  unobserve(target){this.targets=this.targets.filter(x=>x!==target)}
  disconnect(){this.disconnected=true;this.targets=[]}
  fire(ratio){this.callback([{target:card,isIntersecting:ratio>0,intersectionRatio:ratio}])}
 }
 const window={
  IntersectionObserver:Observer,
  navigator:{connection:{saveData:opts.saveData||false}},
  matchMedia:()=>({matches:opts.reducedMotion||false}),
  addEventListener:(name,fn)=>{events['window-'+name]=fn}
 };
 const document={visibilityState:opts.hidden?'hidden':'visible',
  addEventListener:(name,fn)=>{events[name]=fn}};
 const ctx={
  window,document,IntersectionObserver:Observer,
  activeViewName:opts.view||'reels',
  recordedReelViews:new Set(),
  postHTML:()=>'<article></article>',
  bindPostActions:()=>{},
  '$':q=>q==='#reelsFeed'?root:null,
  all:q=>q==='[data-reel-observe]'?[card]:q==='#reelsFeed video'?videos:[],
  api:async uri=>{calls.fetch++;if(uri==='/api/posts/reels')return await feedResponse;return {r:{ok:true},d:{}}},
 };
 const first=social.indexOf('let reelLoadSequenceV32165=0;');
 const last=social.indexOf('function profileTilesHTML(',first);
 assert.ok(first>0&&last>first);
 vm.runInNewContext(social.slice(first,last)+
 '\nthis.start=loadReels;this.stop=releaseReelObserversV32165;this.next=()=>++reelLoadSequenceV32165;',ctx);
 return {ctx,video,root,observers,events,calls,start:()=>ctx.start(),stop:()=>ctx.stop()};
}
test('Reel observers are disconnected when the feed is reloaded, not accumulated',async()=>{
 const h=harness();
 await h.start();
 assert.equal(h.observers.length,2);
 await h.start();
 assert.equal(h.observers.length,4);
 assert.equal(h.observers[0].disconnected,true);
 assert.equal(h.observers[1].disconnected,true);
 assert.equal(h.observers[2].disconnected,false);
 assert.equal(h.observers[3].disconnected,false);
 h.stop();
 assert.equal(h.observers[2].disconnected,true);
 assert.equal(h.observers[3].disconnected,true);
});
test('data-saver and reduced-motion suppress automatic playback while controls remain enabled',async()=>{
 for(const opts of [{saveData:true},{reducedMotion:true},{hidden:true}]){
   const h=harness(opts);
   await h.start();
   h.observers[1].fire(.90);
   assert.equal(h.calls.play,0,JSON.stringify(opts));
   assert.equal(h.video.muted,true);
   assert.equal(h.video.playsInline,true);
   assert.match(social,/controls playsinline preload=/);
 }
 const regular=harness();
 await regular.start();
 regular.observers[1].fire(.90);
 assert.equal(regular.calls.play,1);
 regular.observers[1].fire(0);
 assert.equal(regular.video.paused,true);
});
test('backgrounding or pagehide immediately pauses playback without a forced resume',async()=>{
 const h=harness();
 await h.start();
 h.observers[1].fire(.9);
 assert.equal(h.video.paused,false);
 h.ctx.document.visibilityState='hidden';
 h.events.visibilitychange();
 assert.equal(h.video.paused,true);
 const before=h.calls.play;
 h.ctx.document.visibilityState='visible';
 h.events.visibilitychange();
 assert.equal(h.calls.play,before);
 h.video.paused=false;
 h.events['window-pagehide']();
 assert.equal(h.video.paused,true);
});
test('late network responses do not repaint a view the visitor already left',async()=>{
 let resolve;
 const promised=new Promise(fn=>resolve=fn);
 const h=harness({response:promised});
 const pending=h.start();
 h.ctx.activeViewName='feed';
 h.ctx.next();
 resolve({r:{ok:true},d:{posts:[{id:9}]}});
 await pending;
 assert.equal(h.root.innerHTML,'');
 assert.equal(h.observers.length,0);
});
test('navigation releases playback and invalidates in-flight requests',()=>{
 const begin=social.indexOf('function showView(name) {');
 const end=social.indexOf("all('[data-view]').forEach(b => b.onclick",begin);
 const code=social.slice(begin,end);
 assert.match(code,/if\(name!=='reels'\)\{\s*\+\+reelLoadSequenceV32165;\s*releaseReelObserversV32165\(\)/);
 assert.match(code,/if \(name === 'reels'\) loadReels\(\)/);
 assert.match(social,/reelViewObserverV32165\?\.disconnect\(\)/);
 assert.match(social,/reelPlaybackObserverV32165\?\.disconnect\(\)/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/mobile-reel-resources-v32165\.test\.js/);
});
