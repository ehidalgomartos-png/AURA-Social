'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const html=read('public/app.html');
const landing=read('public/index.html');
const server=read('server.js');

test('mobile-first public and signed-in pages include viewport metadata',()=>{
  assert.match(html,/<meta name="viewport" content="[^"]*width=device-width/);
  assert.match(landing,/<meta name="viewport" content="[^"]*width=device-width/);
  assert.match(html,/<main id="appMain"/);
});

test('critical social screens have distinct anchor IDs',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  const required=[
    'feedView','stories','reelsView','reelsFeed',
    'messagesView','chatPanel','notificationsView','notificationsList',
    'profileView','profilePosts','connectionsView','eventsView',
    'communityList','feed'
  ];
  for(const id of required)assert.equal(ids.filter(value=>value===id).length,1,'missing or duplicate #'+id);
});

test('main social API routers stay mounted in server.js',()=>{
  for(const prefix of [
    '/api/auth','/api/profiles','/api/posts','/api/media','/api/stories',
    '/api/messages','/api/notifications','/api/communities','/api/events',
    '/api/search','/api/moderation','/api/relationships'
  ]){
    assert.ok(server.includes("app.use('"+prefix+"'"),'missing router '+prefix);
  }
});

test('readiness and health are separate, with database verification in ready',()=>{
  assert.match(server,/app\.get\('\/api\/health'/);
  const ready=server.slice(server.indexOf("app.get('/api/ready'"),server.indexOf("app.use('/api',"));
  assert.match(ready,/await db\.query\('SELECT 1'\)/);
  assert.match(ready,/status\(503\)/);
  assert.match(server,/res\.setHeader\('Cache-Control','no-store'\)/);
});

test('persistent uploads and API auth routes are not handled by PWA shell',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw,/url\.pathname\.startsWith\('\/uploads\/'\)/);
  assert.match(server,/app\.use\('\/uploads', express\.static\(UPLOAD_DIR/);
});

test('release smoke suite only inspects files and never needs production secrets',()=>{
  const packageInfo=JSON.parse(read('package.json'));
  assert.match(packageInfo.scripts['test:smoke'],/tests\/stability-/);
  assert.match(packageInfo.scripts['check:syntax'],/scripts\/check-syntax\.js/);
  assert.ok(packageInfo.scripts['test:legal'],'legal regression suite should remain');
});
