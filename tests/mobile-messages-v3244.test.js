'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css'),routes=read('src/routes/messages.js');
test('mobile Inbox conversation shortcut is delegated from the document, not a hidden view',()=>{
 const registration=js.lastIndexOf("document.addEventListener('click'",js.indexOf("const communityConversation=event.target.closest"));
 assert.ok(registration>=0);
 assert.match(js,/const communityConversation=event.target.closest\('\[data-community-conversation\]'\)/);
 assert.match(js,/if\(activeViewName!=='messages'\)showView\('messages'\)/);
 assert.match(js,/await openConversation\(communityConversation.dataset.communityConversation\)/);
});
test('failed conversation open never traps the viewer behind a missing chat',()=>{
 const functionStart=js.indexOf('async function openConversation(id) {');
 const failIndex=js.indexOf('if(!r.ok)',functionStart);
 const successIndex=js.indexOf("layout.classList.add('chat-open')",functionStart);
 assert.ok(functionStart>0 && failIndex>functionStart && successIndex>failIndex);
 const prefix=js.slice(functionStart,js.indexOf('activeConversationOther=d.other || null;',functionStart));
 assert.match(prefix,/openConversationSequenceV3244/);
 assert.match(prefix,/No se pudo conectar al chat/);
 assert.match(prefix,/if\(sequence!==openConversationSequenceV3244\)return/);
 assert.match(prefix,/activeConversationId=conversationId/);
 assert.match(prefix,/document\.body\.classList\.add\('mobile-chat-active-v3244'\)/);
 assert.match(js,/document\.body\.classList\.remove\('mobile-chat-active-v3244'\)/);
});
test('mobile chat is fixed to the visual viewport, not below community suggestions',()=>{
 assert.match(css,/#messagesView \.messages-layout\.chat-open\s*\{[\s\S]*?position:fixed;inset:var\(--visual-vtop,0px\)/);
 assert.match(css,/height:var\(--visual-vh,100dvh\)/);
 assert.match(css,/body\.keyboard-open #messagesView \.messages-layout\.chat-open \.chat-panel/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto/);
 assert.match(css,/overflow-y:auto;overscroll-behavior:contain/);
 assert.match(css,/body\.mobile-chat-active-v3244\{overflow:hidden\}/);
 assert.match(css,/#messageBody\{\s*min-width:0;min-height:46px;font-size:16px/);
 assert.match(css,/min-height:46px;min-width:76px/);
});
test('message send stays in same conversation, keeps draft on failure and reports inline',()=>{
 assert.match(js,/id="messageSendFeedbackV3244" role="status" aria-live="polite"/);
 assert.match(js,/if\(feedback\)feedback\.textContent=\(err\?\.message\|\|'No se pudo enviar el mensaje\.'\)/);
 assert.match(js,/const payload = \{\s*body: \$\('#messageBody'\)\.value/);
 assert.match(js,/if \(!r\.ok\)/);
 assert.match(js,/await openConversation\(activeConversationId\)/);
 assert.match(js,/messageSendInFlight = false/);
});
test('recipient search accepts visible display name and exact username without bypassing privacy',()=>{
 const piece=routes.slice(routes.indexOf("router.get('/recipients'"),routes.indexOf("const createConversationSchema"));
 assert.match(piece,/u\.username ILIKE/);
 assert.match(piece,/u\.display_name/);
 assert.match(piece,/u\.status='active'/);
 assert.match(piece,/u\.discoverable,true/);
 assert.match(piece,/u\.id<>\$1/);
 assert.match(piece,/NOT EXISTS\(SELECT 1 FROM blocks/);
 assert.match(piece,/LIMIT 8/);
 assert.match(piece,/q\.length<2/);
 assert.match(piece,/Cache-Control','no-store'/);
 assert.match(routes,/WHERE lower\(username\)=lower\(\$1\)/);
});
test('recipient choices display safe text, never HTML, and do not open somebody else by name',()=>{
 assert.match(html,/id="newMessageRecipientV3244"/);
 assert.match(html,/id="newMessageRecipientResultsV3244"/);
 assert.match(js,/renderRecipientSuggestionsV3244/);
 assert.match(js,/name\.textContent=String\(user\.display_name\|\|user\.username\)/);
 assert.match(js,/handle\.textContent='@'\+String\(user\.username\)/);
 assert.match(js,/input\.dataset\.exactUsername=String\(user\.username\)/);
 assert.match(js,/recipientSearchSequenceV3244/);
 assert.match(js,/Selecciona la persona correcta de la lista/);
 assert.match(css,/\.message-recipient-choice-v3244:focus-visible/);
});
test('V3.2.48.1 version, cache-busting and CI contract',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.48.1');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.48\.1'/);
 assert.match(html,/\/social\.js\?v=3\.2\.48\.1/);
 assert.match(html,/\/social\.css\?v=3\.2\.48\.1/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:mobile-messages/);
});
