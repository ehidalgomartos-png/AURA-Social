'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path'),read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),css=read('public/social.css'),html=read('public/app.html');
function runSync({height=460,top=292,innerHeight=812,focused=true,chat=true}={}){
 const vars={},classes={},start=js.indexOf('function syncVisualViewport(){');
 const end=js.indexOf('\nfunction setConnectivityStatus(',start);
 assert.ok(start>=0&&end>start);
 const scope={window:{innerHeight,visualViewport:{height,offsetTop:top}},
 document:{documentElement:{clientHeight:innerHeight,style:{setProperty:(name,value)=>vars[name]=value}},
 activeElement:focused?{id:'messageBody'}:null,
 body:{classList:{contains:name=>name==='mobile-chat-active-v3244'&&chat,toggle:(name,value)=>classes[name]=value}}},Math};
 vm.runInNewContext(js.slice(start,end)+'\nsyncVisualViewport();',scope);
 return {vars,classes};
}
test('Safari iPhone: fixed chat follows visual height and visual offset',()=>{
 const {vars,classes}=runSync();
 assert.equal(vars['--visual-vh'],'460px');
 assert.equal(vars['--visual-vtop'],'292px');
 assert.equal(vars['--keyboard-inset'],'60px');
 assert.equal(classes['keyboard-open'],true);
});
test('Android offset zero, negative offset clamp, and safe closed keyboard',()=>{
 assert.equal(runSync({top:0}).vars['--visual-vtop'],'0px');
 assert.equal(runSync({top:-20}).vars['--visual-vtop'],'0px');
 assert.equal(runSync({height:812,top:0,focused:false}).classes['keyboard-open'],false);
});
test('Mobile chat is aligned to one visual viewport without extra translation',()=>{
 const start=css.lastIndexOf('  #messagesView .messages-layout.chat-open{');
 const end=css.indexOf('  #messagesView .messages-layout.chat-open .chat-panel,',start);
 assert.ok(start>=0&&end>start);
 const rules=css.slice(start,end);
 assert.match(rules,/position:fixed;inset:var\(--visual-vtop,0px\) 0 auto 0/);
 assert.match(rules,/height:var\(--visual-vh,100dvh\)/);
 assert.doesNotMatch(rules,/translateY\(|height:max\(/);
 assert.match(js,/visualViewport\?\.addEventListener\('resize',syncVisualViewport\)/);
 assert.match(js,/visualViewport\?\.addEventListener\('scroll',syncVisualViewport\)/);
 assert.match(js,/event\.target\?\.id!=='messageBody'/);
});
test('Back button, message send and version wiring remain intact',()=>{
 assert.match(js,/if\(currentAppRouteV32441\(\)\?\.chat===String\(activeConversationId\)\)/);
 assert.match(js,/\$\('#messageForm'\)\.onsubmit=sendMessage/);
 assert.match(js,/await openConversation\(activeConversationId\)/);
 assert.match(html,/\/social\.js\?v=3\.2\.63\.3/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.69');
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:iphone-keyboard/);
});
