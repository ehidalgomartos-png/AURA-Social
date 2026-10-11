'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function classes(initial=[]){
 const s=new Set(initial);
 return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)};
}
function harness({count=2,responseOk=true}={}){
 let now=Date.parse('2026-10-10T17:00:00.000Z');
 class Clock extends Date{
   constructor(...args){super(...(args.length?args:[now]))}
   static now(){return now}
 }
 const events={};
 const selectorMap={};
 const activeMode={dataset:{mode:'foryou'}};
 let latestClicks=0,scrolls=0,timer,fetchCalls=[];
 const banner={classList:classes(['hidden'])};
 const button={addEventListener:(_type,handler)=>{events.click=handler}};
 const label={textContent:''};
 const feed={getAttribute:()=>null,scrollIntoView:()=>{scrolls++}};
 const view={
   classList:classes(),
   querySelector:selector=>selector==='[data-mode].active'?activeMode:
      selector==='[data-mode="latest"]'?{click:()=>{latestClicks++}}:null
 };
 const els={
   feedNewActivityV3226:banner,feedNewActivityButtonV3226:button,
   feedNewActivityLabelV3226:label,feed,feedView:view
 };
 const document={
   hidden:false,
   getElementById:key=>els[key]||null,
   addEventListener:(type,handler)=>{events[type]=handler}
 };
 const navigator={onLine:true};
 const window={
   addEventListener:(type,handler)=>{events[type]=handler},
   setInterval:(handler,ms)=>{timer=handler;assert.equal(ms,120000)},
   matchMedia:()=>({matches:true})
 };
 const sandbox={
   document,navigator,window,Date:Clock,
   fetch:async url=>{
     fetchCalls.push(url);
     return {ok:responseOk,json:async()=>({ok:true,count})};
   },
   encodeURIComponent,Number,Math,String,Set
 };
 vm.runInNewContext(read('public/feed-new-activity-v3226.js'),sandbox);
 async function pulse(delta=120000){now+=delta;await timer();await new Promise(resolve=>setImmediate(resolve))}
 return {pulse,banner,label,events,document,navigator,view,activeMode,fetchCalls,
   latestClicks:()=>latestClicks,scrolls:()=>scrolls,timer:()=>timer()};
}
test('new activity never polls immediately and displays only factual counts after two minutes',async()=>{
 const h=harness({count:2});
 await h.pulse(30000);
 assert.equal(h.fetchCalls.length,0);
 await h.pulse(90000);
 assert.equal(h.fetchCalls.length,1);
 assert.match(h.fetchCalls[0],/^\/api\/posts\/new-activity\?since=/);
 assert.equal(h.label.textContent,'2 publicaciones nuevas · Ver');
 assert.equal(h.banner.classList.contains('hidden'),false);
});
test('activity is opt-in: no silent feed replacement; tapping loads existing Nuevo tab',async()=>{
 const h=harness({count:1});
 await h.pulse();
 assert.equal(h.label.textContent,'1 publicación nueva · Ver');
 assert.equal(h.latestClicks(),0);
 h.events.click();
 assert.equal(h.latestClicks(),1);
 assert.equal(h.scrolls(),1);
 assert.equal(h.banner.classList.contains('hidden'),true);
});
test('no request while hidden, offline, busy or on private feed modes',async()=>{
 const h=harness();
 h.document.hidden=true;await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.document.hidden=false;h.activeMode.dataset.mode='following';
 await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.activeMode.dataset.mode='vip';await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.activeMode.dataset.mode='close';await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.activeMode.dataset.mode='latest';h.navigator.onLine=false;
 await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.navigator.onLine=true;h.view.classList.add('hidden');
 await h.pulse();assert.equal(h.fetchCalls.length,0);
 h.view.classList.remove('hidden');
 await h.pulse();assert.equal(h.fetchCalls.length,1);
});
test('feed-updated hides old notice and resets baseline; 0 count stays hidden',async()=>{
 const h=harness({count:0});
 await h.pulse();assert.equal(h.banner.classList.contains('hidden'),true);
 await h.events['redlibertad:feed-updated']({detail:{mode:'latest'}});
 await h.pulse(30000);assert.equal(h.fetchCalls.length,1);
 await h.pulse(90000);assert.equal(h.fetchCalls.length,2);
 assert.equal(h.banner.classList.contains('hidden'),true);
});
test('server checks auth and exactly the same audience and anti-abuse restrictions as feed',()=>{
 const s=read('src/routes/posts.js');
 const start=s.indexOf("router.get('/new-activity'");
 const end=s.indexOf("router.get('/momentum'",start);
 assert.ok(start>0&&end>start);
 const sub=s.slice(start,end);
 assert.match(sub,/router\.get\('\/new-activity',requireAuth/);
 assert.match(sub,/invalid_since/);
 assert.match(sub,/postAudienceWhere\('\$1','p'\)/);
 assert.match(sub,/moderation_status='published'/);
 assert.match(sub,/u\.status='active'/);
 assert.match(sub,/blocked_id FROM blocks/);
 assert.match(sub,/blocker_id FROM blocks/);
 assert.match(sub,/muted_id FROM mutes/);
 assert.match(sub,/p\.user_id<>\$1/);
 assert.match(sub,/p\.created_at>\$2::timestamptz/);
 assert.match(sub,/LIMIT 10/);
 assert.match(sub,/Cache-Control','private, no-store'/);
 assert.doesNotMatch(sub,/INSERT INTO|UPDATE posts|DELETE FROM/);
});
test('mobile layout and original feed/news functionality remain intact',()=>{
 const html=read('public/app.html');
 const css=read('public/social.css');
 assert.ok(html.includes('id="feedNewActivityV3226"'));
 assert.ok(html.includes('/feed-new-activity-v3226.js?v=3.2.26'));
 assert.ok(html.includes('id="feed" class="feed"'));
 assert.ok(css.includes('#feedView .feed-column-v3226'));
 assert.ok(css.includes('min-height:44px'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
 assert.ok(read('public/editorial-interleave-v3224.js').includes("mode==='foryou'||mode==='latest'"));
 assert.equal(JSON.parse(read('package.json')).version,'3.2.35');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.35'"));
});
