'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prefs=require('../src/services/push-preferences');

const root=path.resolve(__dirname,'..');
const pushService=fs.readFileSync(path.join(root,'src/services/push.js'),'utf8');
const pushRoutes=fs.readFileSync(path.join(root,'src/routes/push.js'),'utf8');
const notificationsRoute=fs.readFileSync(path.join(root,'src/routes/notifications.js'),'utf8');
const social=fs.readFileSync(path.join(root,'public/social.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/app.html'),'utf8');

test('six push categories default to enabled for existing members',()=>{
  assert.deepEqual(prefs.PUSH_CATEGORY_KEYS,
    ['messages','mentions','interactions','community','consents','system']);
  for(const type of ['message','mention','comment','like','follow','event_reminder',
    'consent_request','collaboration_approved','system','unknown']){
    assert.equal(prefs.shouldDeliverPush(type,undefined),true,type);
  }
});

test('push notification types map to the right category',()=>{
  const expected={
    message:'messages',mention:'mentions',circle_mention:'mentions',
    like:'interactions',comment:'interactions',repost:'interactions',
    follow:'community',creator_broadcast:'community',creator_vip_broadcast:'community',
    creator_poll_vote:'community',creator_question_response:'community',
    event_reminder:'community',consent_request:'consents',
    collaboration_approved:'consents',collaboration_request:'consents',
    system:'system',unknown:'system'
  };
  for(const [type,category] of Object.entries(expected))
    assert.equal(prefs.pushCategoryForType(type),category,type);
});

test('category opt-out changes only the selected push types',()=>{
  const values={...prefs.DEFAULT_PUSH_PREFERENCES,messages:false,mentions:false};
  assert.equal(prefs.shouldDeliverPush('message',values),false);
  assert.equal(prefs.shouldDeliverPush('mention',values),false);
  assert.equal(prefs.shouldDeliverPush('like',values),true);
  assert.equal(prefs.shouldDeliverPush('consent_request',values),true);
});

test('preference normalization defaults invalid values safely',()=>{
  const p=prefs.normalizePushPreferences({messages:'false',mentions:false,system:null});
  assert.equal(p.messages,true);
  assert.equal(p.mentions,false);
  assert.equal(p.system,true);
  assert.equal(Object.keys(p).length,6);
  const off=Object.fromEntries(prefs.PUSH_CATEGORY_KEYS.map(k=>[k,false]));
  assert.equal(prefs.shouldDeliverPush('system',off),false);
  assert.equal(prefs.shouldDeliverPush('message',off),false);
});

test('push preference schema belongs to the account and defaults to true',()=>{
  assert.match(pushService,/CREATE TABLE IF NOT EXISTS push_preferences/);
  assert.match(pushService,/user_id BIGINT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
  for(const key of prefs.PUSH_CATEGORY_KEYS)
    assert.match(pushService,new RegExp(key+' BOOLEAN NOT NULL DEFAULT TRUE'));
});

test('push worker checks opt-outs before sending Web Push, retaining in-app data',()=>{
  const start=pushService.indexOf('for(const job of jobs.rows){');
  const gate=pushService.indexOf('shouldDeliverPush(job.type',start);
  const send=pushService.indexOf('webpush.sendNotification(',start);
  assert.ok(start>=0&&gate>start&&send>gate);
  assert.match(pushService.slice(gate,send),/markJob\(job\.id,'sent'/);
  assert.doesNotMatch(pushService.slice(gate,send),/DELETE FROM notifications/);
});

function routeHarness(){
  const handlers={},calls=[];
  const router={use(){},
    get:(path,fn)=>{handlers['GET '+path]=fn;},
    put:(path,fn)=>{handlers['PUT '+path]=fn;},
    post:(path,fn)=>{handlers['POST '+path]=fn;},
    delete:(path,fn)=>{handlers['DELETE '+path]=fn;}
  };
  const z={
    boolean:()=>({kind:'boolean'}),
    string:()=>({url(){return this;},max(){return this;},min(){return this;},optional(){return this;},default(){return this;}}),
    object(fields){return{
      strict(){return this;},
      safeParse(value){
        const keys=Object.keys(fields);
        const valid=value&&typeof value==='object'&&!Array.isArray(value)&&
          Object.keys(value).length===keys.length&&
          keys.every(key=>typeof value[key]==='boolean');
        return valid?{success:true,data:value}:{success:false};
      }
    };}
  };
  const db={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('count(*)::int AS n FROM push_subscriptions'))return{rows:[{n:2}]};
    if(sql.startsWith('SELECT')&&sql.includes('FROM push_preferences'))return{rows:[]};
    return{rows:[],rowCount:1};
  }};
  const fakeRequire=name=>{
    if(name==='express')return{Router:()=>router};
    if(name==='zod')return{z};
    if(name==='../db')return db;
    if(name==='../middleware/auth')return{requireAuth:()=>{}};
    if(name==='../services/push')return{
      ensurePushSchema:async()=>{},
      publicPushConfig:()=>({enabled:true,publicKey:'demo'})
    };
    if(name==='../services/push-preferences')return prefs;
    throw Error('unexpected import '+name);
  };
  const mod={exports:{}};
  new Function('require','module',pushRoutes)(fakeRequire,mod);
  return{calls,
    async request(method,url,body,userId=7){
      const handler=handlers[method+' '+url];
      assert.ok(handler,'missing route '+url);
      let value,code=200;
      const response={status(n){code=n;return this;},json(v){value=v;return this;}};
      await handler({user:{id:userId},body},response);
      return{code,value};
    }
  };
}

test('GET config preserves existing subscriptions and defaults',async()=>{
  const h=routeHarness();
  const result=await h.request('GET','/config');
  assert.equal(result.code,200);
  assert.equal(result.value.subscriptionCount,2);
  assert.deepEqual(result.value.preferences,{...prefs.DEFAULT_PUSH_PREFERENCES});
  assert.deepEqual(h.calls[0].params,[7]);
  assert.deepEqual(h.calls[1].params,[7]);
});

test('saving preferences uses authenticated user ID and boolean parameters',async()=>{
  const h=routeHarness();
  const values={...prefs.DEFAULT_PUSH_PREFERENCES,mentions:false,community:false};
  const result=await h.request('PUT','/preferences',values,121);
  assert.equal(result.code,200);
  assert.equal(result.value.ok,true);
  assert.deepEqual(result.value.preferences,values);
  const write=h.calls.find(x=>x.sql.includes('INSERT INTO push_preferences'));
  assert.ok(write);
  assert.deepEqual(write.params,[121,true,false,true,false,true,true]);
  assert.match(write.sql,/ON CONFLICT\(user_id\) DO UPDATE/);
});

test('invalid preferences and forged user IDs cannot be saved',async()=>{
  const h=routeHarness();
  for(const invalid of [
    {messages:false},
    {...prefs.DEFAULT_PUSH_PREFERENCES,user_id:888},
    {...prefs.DEFAULT_PUSH_PREFERENCES,system:'false'},
    null
  ]){
    const response=await h.request('PUT','/preferences',invalid);
    assert.equal(response.code,400);
    assert.equal(response.value.error,'invalid_push_preferences');
  }
  assert.equal(h.calls.length,0);
});

test('unread filter excludes read items and preserves all-activity view',()=>{
  const start=social.indexOf('function notificationMatches(notification, filter)');
  const end=social.indexOf('function renderNotifications()',start);
  assert.ok(start>=0&&end>start);
  const matches=new Function(social.slice(start,end)+'\nreturn notificationMatches;')();
  const unread={type:'message',read_at:null};
  const read={type:'message',read_at:'2026-10-08T10:00:00Z'};
  assert.equal(matches(unread,'unread'),true);
  assert.equal(matches(read,'unread'),false);
  assert.equal(matches(read,'all'),true);
  assert.equal(read.read_at,'2026-10-08T10:00:00Z');
});

test('read operations honor API failure and use authoritative unread counts',()=>{
  assert.ok(social.includes('if(!r.ok)throw Error('+"'read_all_failed'"+')'));
  assert.ok(social.includes('liveActivityState.notificationUnread=Number(d.unread||0)'));
  assert.ok(social.includes("if(activeNotificationFilter==='unread')renderNotifications()"));
  assert.ok(notificationsRoute.includes('res.json({ok:true,unread:Number(count.rows[0]?.n||0)})'));
});

test('mobile account settings expose all categories independently of device opt-in',()=>{
  for(const key of prefs.PUSH_CATEGORY_KEYS)
    assert.ok(html.includes('type="checkbox" name="'+key+'"'));
  assert.match(html,/id="pushPreferencesForm"/);
  assert.match(html,/id="pushPreferencesStatus"[^>]*aria-live="polite"/);
  assert.match(html,/data-notification-filter="unread"/);
  assert.ok(social.includes("api('/api/push/preferences'"));
  assert.ok(social.includes('Puedes guardar preferencias para otros dispositivos compatibles'));
});
