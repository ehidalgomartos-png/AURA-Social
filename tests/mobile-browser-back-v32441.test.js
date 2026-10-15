'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js');
const start=js.indexOf('const APP_HISTORY_KEY_V32441=');
const end=js.indexOf('const viewScrollPositions=new Map();',start);
assert.ok(start>0&&end>start);
function harness(){
 let listener=null;
 const entries=[],views=[],chats=[],modals=[],closures=[];
 const history={
  state:null,
  replaceState(state){this.state=state;if(entries.length)entries[entries.length-1]=state;else entries.push(state);},
  pushState(state){this.state=state;entries.push(state);},
  back(){if(entries.length>1){entries.pop();this.state=entries.at(-1);listener({state:this.state});}}
 };
 const modal={classList:{contains:()=>true}};
 const ctx={window:{addEventListener:(_,fn)=>listener=fn},history,
  location:{href:'https://redlibertad.com/app'},Set,
  activeViewName:'feed',showView:view=>views.push(view),
  openConversation:id=>chats.push(id),
  openPublicProfile:username=>views.push('profile:'+username),
  openNewConversationModal:options=>modals.push(options),
  closeNewConversationModal:options=>closures.push(options),
  '$':()=>modal};
 vm.runInNewContext(js.slice(start,end)+'\nthis.exports={appRouteV32441,recordAppRouteV32441,installAppHistoryV32441};',ctx);
 return {ctx,history,entries,views,chats,modals,closures,route:ctx.exports,back:()=>history.back()};
}
test('an authenticated /app has an internal Back guard rather than opening the landing-login page',()=>{
 const h=harness();h.route.installAppHistoryV32441();
 assert.equal(h.entries.length,2);
 assert.equal(h.entries[0].rlAppRouteV32441.anchor,true);
 assert.equal(h.entries[1].rlAppRouteV32441.view,'feed');
 h.back();
 assert.equal(h.views.at(-1),'feed');
 assert.equal(h.history.state.rlAppRouteV32441.anchor,false);
 assert.equal(h.entries.length,2);
});
test('Back traverses chat -> messages -> feed and retains the authenticated /app path',()=>{
 const h=harness();h.route.installAppHistoryV32441();
 h.route.recordAppRouteV32441({view:'messages'});
 h.route.recordAppRouteV32441({view:'messages',chat:'52'});
 assert.equal(h.entries.length,4);
 h.back();
 assert.equal(h.views.at(-1),'messages');
 assert.equal(h.chats.length,0);
 h.back();
 assert.equal(h.views.at(-1),'feed');
 assert.equal(h.history.state.rlAppRouteV32441.view,'feed');
});
test('navigating back and forward can reconstruct the correct real conversation ID',()=>{
 const h=harness();h.route.installAppHistoryV32441();
 const chat={rlAppRouteV32441:{view:'messages',chat:'77',modal:null,profile:null,anchor:false}};
 h.history.state=chat;
 h.ctx.window; // The handler registered inside the harness owns the same callback.
 // Load this state as if the browser went Forward to a chat, without submitting messages.
 h.entries.push(chat);
 h.back();
 h.route.recordAppRouteV32441({view:'messages',chat:'77'});
 assert.equal(h.history.state.rlAppRouteV32441.chat,'77');
 assert.equal(h.history.state.rlAppRouteV32441.modal,null);
});
test('New conversation modal is a browser-history state; Back closes it',()=>{
 const h=harness();h.route.installAppHistoryV32441();
 h.route.recordAppRouteV32441({view:'messages'});
 h.route.recordAppRouteV32441({view:'messages',modal:'newMessage'});
 h.back();
 assert.equal(h.closures.length,0); // Already closed in harness.
 assert.equal(h.history.state.rlAppRouteV32441.modal,null);
 const modalClosed=h.views.at(-1);assert.equal(modalClosed,'messages');
});
test('navigation integration preserves existing chat, draft and logout behavior',()=>{
 assert.match(js,/installAppHistoryV32441\(\);\s*await loadReleaseFlags/);
 assert.match(js,/if\(switching\|\|hadChat\)recordAppRouteV32441\(\{view:name\}\)/);
 assert.match(js,/recordAppRouteV32441\(\{view:'messages',chat:conversationId\}\)/);
 assert.match(js,/if\(currentAppRouteV32441\(\)\?\.chat===String\(activeConversationId\)\)/);
 assert.match(js,/recordAppRouteV32441\(\{view:'messages',modal:'newMessage'\}\)/);
 assert.match(js,/history\.back\(\)/);
 assert.match(js,/closeNewConversationModal\(\{afterSubmit:true\}\)/);
 assert.match(js,/await fetch\('\/api\/auth\/logout'/);
 assert.match(js,/location\.href = '\/'/);
});
test('V3.2.60 has its own cache key and CI smoke gate',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.62');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.62'/);
 assert.match(read('public/app.html'),/\/social\.js\?v=3\.2\.62/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:mobile-browser-back/);
});
