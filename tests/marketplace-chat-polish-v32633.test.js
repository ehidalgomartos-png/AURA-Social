'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const social=fs.readFileSync('public/social.js','utf8');
const css=fs.readFileSync('public/social.css','utf8');

test('V3.2.75: mobile grid gives product a short second row and thread remaining space',()=>{
 assert.match(css,/#messagesView \.messages-layout\.chat-open \.chat-panel\.market-chat-open-v32632/);
 assert.match(css,/grid-template-rows:auto auto minmax\(0,1fr\) auto/);
 assert.match(css,/\.chat-panel\.market-chat-open-v32632 \.message-thread\{min-height:0;overflow-y:auto\}/);
 assert.match(fs.readFileSync('public/app.html','utf8'),/social\.css\?v=(?:3\.2\.75|3\.3\.11)/);
 assert.match(fs.readFileSync('public/app.html','utf8'),/social\.js\?v=3\.2\.75/);
});

test('V3.2.75: consult draft is offered once, not regenerated after message sent',async()=>{
 const start=social.indexOf('async function showMarketplaceChatContextV32632(');
 const end=social.indexOf('let openConversationSequenceV3244=',start);
 assert.ok(start>0&&end>start);
 const inserted=[],composer={value:'',dispatchEvent(){this.dispatched=(this.dispatched||0)+1;}};
 const chat={classList:{add(x){this.active=x;}}},thread={before(x){inserted.push(x);}};
 const el={ '#chatPanel':chat,'#messageThread':thread,'#messageBody':composer };
 const draftSet=new Set();
 const item={id:5,kind:'product',deal:'sale',status:'active',moderation_status:'published',seller_username:'mundotaza',seller_id:12,title:'Taza Stitch Navideño',price_cents:1599,image_urls:['/uploads/taza.jpg']};
 const sandbox={marketplaceChatListingPendingV32632:'5',marketplaceChatTargetConversationV32632:null,marketplaceChatDraftedSessionsV32633:draftSet,activeConversationId:'30',me:{id:4},encodeURIComponent,
 api:async()=>({r:{ok:true},d:{item}}),document:{createElement:()=>({setAttribute(){}})},
 '$':k=>el[k],esc:s=>String(s),Event:class Event{},String,Array,Number,Set,RegExp};
 vm.createContext(sandbox);
 vm.runInContext(social.slice(start,end),sandbox);
 await sandbox.showMarketplaceChatContextV32632('30',{username:'mundotaza'},false,[]);
 assert.match(composer.value,/Taza Stitch Navideño/);
 assert.equal(composer.dispatched,1);
 assert.equal(inserted.length,1);
 assert.equal(chat.classList.active,'market-chat-open-v32632');
 composer.value='';
 await sandbox.showMarketplaceChatContextV32632('30',{username:'mundotaza'},false,[]);
 assert.equal(composer.value,'');
 assert.equal(composer.dispatched,1);
 draftSet.clear();
 await sandbox.showMarketplaceChatContextV32632('30',{username:'mundotaza'},false,[{body:'Hola, me interesa https://redlibertad.com/marketplace/p/5/taza-stitch-navideno'}]);
 assert.equal(composer.value,'');
 assert.equal(composer.dispatched,1);
});

test('V3.2.75: sent messages clear only after server confirmation; errors retain user text',()=>{
 const i=social.indexOf('async function sendMessage(e) {');
 const end=social.indexOf('\nfunction ',i);
 const fn=social.slice(i,end>i?end:undefined);
 assert.ok(fn.indexOf('if (!r.ok)')<fn.indexOf("input.value=''"));
 assert.ok(fn.indexOf("input.value=''")<fn.indexOf('await openConversation(submittedConversation)'));
 assert.match(fn,/input&&input\.value===submittedBody/);
 assert.match(fn,/String\(activeConversationId\)===submittedConversation/);
 assert.match(fn,/if \(messageSendInFlight\) return/);
 assert.doesNotThrow(()=>new vm.Script(social));
 // Version and deployment identity are covered by the V3.3.32 release audit.
});
