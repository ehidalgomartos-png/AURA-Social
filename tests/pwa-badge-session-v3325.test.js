'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const code=read('public/pwa-badges-v3323.js');
const html=read('public/app.html');
function browser(){
  const calls=[],pending=[],events={};
  const navigator={standalone:true,onLine:true,
    setAppBadge:async number=>{calls.push(['set',number]);},
    clearAppBadge:async()=>{calls.push(['clear']);}
  };
  const document={visibilityState:'visible',addEventListener:(name,handler)=>{events[name]=handler;}};
  const window={matchMedia:()=>({matches:true}),addEventListener:(name,handler)=>{events[name]=handler;}};
  const clock={now:100000};
  const MockDate=class extends Date{static now(){return clock.now;}};
  const context={window,document,navigator,Date:MockDate,Number,String,Promise,
    fetch:async(url,options)=>{
      calls.push(['fetch',url,options.cache]);
      return new Promise(resolve=>pending.push(resolve));
    }
  };
  vm.runInNewContext(code,context);
  return {api:window.RedLibertadPwaBadgeV3323,document,navigator,clock,calls,pending,
    flush:async()=>{for(let i=0;i<16;i++)await Promise.resolve();}};
}
test('account switch starts a new unread fetch instead of inheriting the previous pending response',async()=>{
  const h=browser();
  h.api.sync(7,4);await h.flush();
  const old=h.api.refresh({force:true});
  assert.equal(h.pending.length,1);
  h.api.setUser(8);await h.flush();
  const current=h.api.refresh({force:true});
  assert.equal(h.pending.length,2,'must fetch the newly authenticated account immediately');
  h.pending[1]({ok:true,json:async()=>({badgeUnread:2})});
  assert.equal(await current,true);await h.flush();
  h.pending[0]({ok:true,json:async()=>({badgeUnread:9})});
  assert.equal(await old,false);await h.flush();
  assert.deepEqual(h.calls.filter(c=>c[0]==='set').map(c=>c[1]),[4,2]);
  assert.ok(!h.calls.some(c=>c[0]==='set'&&c[1]===9));
});
test('expired session clears old unread number and allows a fresh account to start',async()=>{
  const h=browser();h.api.sync(7,5);await h.flush();
  const expired=h.api.refresh({force:true});
  h.pending[0]({ok:false,status:401});
  assert.equal(await expired,false);await h.flush();
  assert.deepEqual(h.calls.filter(c=>c[0]!=='fetch'),[['set',5],['clear']]);
  assert.equal(await h.api.refresh({force:true}),false,'no private requests after session loss');
  h.api.sync(8,1);await h.flush();
  assert.deepEqual(h.calls.filter(c=>c[0]==='set').map(c=>c[1]),[5,1]);
});
test('revoked permissions also clear only the matching session',async()=>{
  const h=browser();h.api.sync(7,3);await h.flush();
  const revoked=h.api.refresh({force:true});
  h.pending[0]({ok:false,status:403});
  assert.equal(await revoked,false);await h.flush();
  assert.deepEqual(h.calls.filter(c=>c[0]!=='fetch'),[['set',3],['clear']]);
});
test('stale unauthorized response cannot clear badge belonging to a newer account',async()=>{
  const h=browser();h.api.sync(7,6);await h.flush();
  const prior=h.api.refresh({force:true});
  h.api.sync(8,2);await h.flush();
  h.pending[0]({ok:false,status:401});
  assert.equal(await prior,false);await h.flush();
  const actions=h.calls.filter(c=>c[0]!=='fetch');
  assert.equal(actions.at(-1)[0],'set');
  assert.equal(actions.at(-1)[1],2);
});
test('new foreground script is cache-versioned; no polling, tracking, new APIs or permission dialogs',()=>{
  assert.equal(html.split('pwa-badges-v3323.js?v=3.3.23&amp;session=3.3.25').length-1,1);
  assert.ok(html.indexOf('pwa-badges-v3323.js')<html.indexOf('social.js?v='));
  assert.match(code,/if\(owner!==expectedOwner\|\|revision!==expectedRevision\)return false/);
  assert.doesNotMatch(code,/setInterval|setTimeout|localStorage|sessionStorage|requestPermission|sendBeacon|Notification\.requestPermission/);
  assert.match(read('src/routes/live.js'),/router\.get\('\/badge',requireAuth/);
  assert.match(read('.github/workflows/validate-js.yml'),/node --test tests\/pwa-badge-session-v3325\.test\.js/);
});
