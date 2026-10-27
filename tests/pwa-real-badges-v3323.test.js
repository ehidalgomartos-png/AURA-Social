'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {BADGE_UNREAD_SQL_V3323,combineUnreadV3323,getBadgeCountsV3323}=require('../src/services/app-badge-v3323');
const script=read('public/pwa-badges-v3323.js'),sw=read('public/sw.js');
const live=read('src/routes/live.js'),push=read('src/services/push.js'),html=read('public/app.html');
test('correct unread items are scoped to one member and chat notifications are not counted twice',async()=>{
 assert.match(BADGE_UNREAD_SQL_V3323,/n\.user_id=\$1 AND n\.read_at IS NULL AND n\.type<>'message'/);
 assert.match(BADGE_UNREAD_SQL_V3323,/mute\.muter_id=\$1/);
 assert.match(BADGE_UNREAD_SQL_V3323,/cm\.user_id=\$1 AND cm\.is_archived=false/);
 assert.match(BADGE_UNREAD_SQL_V3323,/m\.sender_id<>\$1/);
 assert.match(BADGE_UNREAD_SQL_V3323,/m\.created_at>COALESCE\(cm\.last_read_at,to_timestamp\(0\)\)/);
 assert.equal(combineUnreadV3323(2,3),5);
 assert.equal(combineUnreadV3323(0,0),0);
 assert.equal(combineUnreadV3323(9999,9999),9999);
 assert.equal(combineUnreadV3323(-1,NaN),0);
 const calls=[];
 const result=await getBadgeCountsV3323(7,{database:{query:async(sql,args)=>{
  calls.push(args);return {rows:[{message_unread:2,notification_unread:3}]};
 }}});
 assert.deepEqual(calls,[[7]]);
 assert.deepEqual(result,{unreadMessages:2,unreadNotifications:3,badgeUnread:5});
});
test('SSE and private read-only badge endpoint reuse the current authenticated activity',()=>{
 assert.match(live,/router\.get\('\/badge',requireAuth/);
 assert.match(live,/getBadgeCountsV3323\(req\.user\.id\)/);
 assert.match(live,/badgeUnread:combineUnreadV3323/);
 assert.match(live,/badgeUnread:payload\.badgeUnread/);
 assert.match(live,/Cache-Control','no-store'/);
 assert.match(read('public/social.js'),/RedLibertadPwaBadgeV3323\?\.sync\(me\?\.id,payload\.badgeUnread\)/);
 assert.match(read('public/social.js'),/RedLibertadPwaBadgeV3323\?\.clear\(\)/);
 assert.doesNotMatch(script,/setInterval|setTimeout|localStorage|sessionStorage|requestPermission|sendBeacon/);
});
function browser({installed=true,online=true,visibility='visible'}={}){
 const calls=[],events={},clock={now:100000},pending=[];
 const navigator={standalone:installed,onLine:online,
  setAppBadge:async n=>calls.push(['set',n]),
  clearAppBadge:async()=>calls.push(['clear'])};
 const document={visibilityState:visibility,addEventListener:(k,f)=>{events[k]=f;}};
 const window={matchMedia:()=>({matches:installed}),addEventListener:(k,f)=>{events[k]=f;}};
 const DateStub=class extends Date{static now(){return clock.now;}};
 const ctx={navigator,document,window,Date:DateStub,Number,String,Promise,
  fetch:async(url,opts)=>{
   calls.push(['fetch',url,opts.cache]);
   return new Promise(resolve=>pending.push(resolve));
  }};
 vm.runInNewContext(script,ctx);
 return {api:window.RedLibertadPwaBadgeV3323,calls,clock,document,navigator,pending,
  flush:async()=>{for(let i=0;i<12;i++)await Promise.resolve();}};
}
test('installed app shows one, two, three and clears zero without a permission popup',async()=>{
 const h=browser();
 for(const n of [1,2,3,0]){h.api.sync(7,n);await h.flush();}
 assert.deepEqual(h.calls,[['set',1],['set',2],['set',3],['clear']]);
});
test('unsupported/uninstalled platform fails silently and account switch clears the former number',async()=>{
 const a=browser({installed:false});a.api.sync(7,3);await a.flush();assert.deepEqual(a.calls,[]);
 const h=browser();h.api.sync(7,4);await h.flush();
 h.api.setUser(8);await h.flush();
 h.api.sync(8,1);await h.flush();
 await h.api.clear();
 assert.deepEqual(h.calls,[['set',4],['clear'],['set',1],['clear']]);
});
test('foreground refresh is bounded and ignores stale same-user and cross-account data',async()=>{
 const h=browser();h.api.setUser(8);await h.flush();
 const a=h.api.refresh(),b=h.api.refresh();
 assert.equal(h.calls.filter(x=>x[0]==='fetch').length,1);
 h.api.sync(8,5);await h.flush();
 h.pending[0]({ok:true,json:async()=>({badgeUnread:9})});
 assert.equal(await a,false);assert.equal(await b,false);
 assert.equal(h.calls.some(x=>x[0]==='set'&&x[1]===9),false);
 assert.equal(await h.api.refresh(),false);
 h.clock.now+=21000;
 const next=h.api.refresh();h.pending[1]({ok:true,json:async()=>({badgeUnread:2})});
 assert.equal(await next,true);await h.flush();
 assert.equal(h.calls.at(-1)[1],2);
 h.document.visibilityState='hidden';h.clock.now+=21000;
 assert.equal(await h.api.refresh(),false);
 h.document.visibilityState='visible';h.navigator.onLine=false;
 assert.equal(await h.api.refresh(),false);
});
test('real push can update iOS icon but does not break Android notifications',async()=>{
 const from=sw.indexOf('async function updatePushIconBadgeV3323(');
 const to=sw.indexOf("self.addEventListener('push'",from);
 assert.ok(from>0&&to>from);
 const calls=[],ctx={self:{navigator:{
  setAppBadge:async n=>calls.push(['set',n]),
  clearAppBadge:async()=>calls.push(['clear'])
 }}};
 vm.runInNewContext(sw.slice(from,to)+'\nthis.apply=updatePushIconBadgeV3323;',ctx);
 assert.equal(await ctx.apply(3),true);
 assert.equal(await ctx.apply(0),true);
 assert.equal(await ctx.apply(null),false);
 assert.deepEqual(calls,[['set',3],['clear']]);
 assert.match(sw,/typeof value==='number'&&Number\.isSafeInteger\(value\)/);
 assert.match(sw,/self\.registration\.showNotification\(title,options\)/);
 assert.match(sw,/updatePushIconBadgeV3323\(badge\)/);
 assert.match(push,/shouldDeliverPush\(job\.type,preferencesByUser\.get\(userKey\)\)/);
 assert.match(push,/getBadgeCountsV3323\(job\.user_id\)/);
});
test('PWA versioned resources, safe navigation, mobile performance and CI are retained',()=>{
 assert.equal((html.match(/pwa-badges-v3323\.js\?v=3\.3\.23/g)||[]).length,1);
 assert.ok(html.indexOf('pwa-badges-v3323.js')<html.indexOf('social.js?v='));
 assert.match(html,/social\.js\?[^"]*pwa=3\.3\.23/);
 assert.match(sw,/const SHELL_CACHE='redlibertad-v3323-shell'/);
 assert.ok(sw.includes("'/pwa-badges-v3323.js'"));
 assert.match(sw,/url\.pathname==='\/api'/);
 assert.match(sw,/safeNotificationTarget\(event\.notification\.data\?\.url\)/);
 assert.match(read('public/pwa.js'),/SW_UPDATE_INTERVAL_V336=60\*60\*1000/);
 assert.match(read('public/social.js'),/function showView\(/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/pwa-real-badges-v3323\.test\.js/);
});
