'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const profiles=fs.readFileSync(path.join(__dirname,'../src/routes/profiles.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');

function routeHarness(rows){
  const start=profiles.indexOf("router.get('/suggestions', requireAuth, async (req, res) => {");
  const end=profiles.indexOf('async function ensureFavoritesCircle',start);
  assert.ok(start>=0&&end>start,'suggestion route exists');
  const calls=[];
  let handler;
  const router={get:(name,auth,fn)=>{assert.equal(name,'/suggestions');handler=fn;}};
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:rows.slice()};}};
  new Function('router','requireAuth','db','INTERESTS','normalizedInterest',
    profiles.slice(start,end))(router,()=>{},db,['Arte','Deportes'],x=>x||null);
  return {
    calls,
    async request(query={}){
      let result;
      await handler({user:{id:19},query},{
        json:object=>{result=object;}
      });
      return result;
    }
  };
}

test('suggestions default to for_you, bounded page zero, and stable slice',async()=>{
  const h=routeHarness([{id:1},{id:2},{id:3}]);
  const result=await h.request({limit:'2'});
  assert.equal(result.mode,'for_you');
  assert.equal(result.page,0);
  assert.equal(result.users.length,2);
  assert.equal(result.hasMore,true);
  assert.deepEqual(h.calls[0].params,[19,null,3,'for_you',0]);
});

test('active mode and page are parameterized, not interpolated into SQL',async()=>{
  const h=routeHarness([{id:1},{id:2}]);
  const result=await h.request({limit:'2',page:'3',mode:'active',interest:'Arte'});
  assert.equal(result.mode,'active');
  assert.equal(result.page,3);
  assert.equal(result.hasMore,false);
  assert.deepEqual(h.calls[0].params,[19,'Arte',3,'active',6]);
  assert.match(h.calls[0].sql,/u\.show_activity=true AND activity\.last_activity_at>=now\(\)-interval '7 days'/);
});

test('new mode uses recent registration window, without invented online status',async()=>{
  const h=routeHarness([]);
  const result=await h.request({mode:'new'});
  assert.equal(result.mode,'new');
  assert.equal(result.users.length,0);
  assert.match(h.calls[0].sql,/u\.created_at>=now\(\)-interval '30 days'/);
  assert.doesNotMatch(h.calls[0].sql,/\bis_online\b|online_status/i);
});

test('limits and pages are clamped against overlarge or malicious input',async()=>{
  const h=routeHarness([]);
  const reply=await h.request({limit:'9999',page:'9999',mode:'evil'});
  assert.deepEqual([reply.mode,reply.page],['for_you',10]);
  assert.deepEqual(h.calls[0].params,[19,null,31,'for_you',300]);
  await h.request({limit:'-7',page:'-20'});
  assert.deepEqual(h.calls[1].params,[19,null,2,'for_you',0]);
});

test('queries exclude private, blocked, muted, hidden and admin profiles in every mode',async()=>{
  const h=routeHarness([]);
  await h.request({mode:'new'});
  const sql=h.calls[0].sql;
  assert.match(sql,/u\.status='active'/);
  assert.match(sql,/u\.is_admin=false/);
  assert.match(sql,/u\.discoverable=true/);
  assert.match(sql,/blocked\.blocker_id/);
  assert.match(sql,/blocked\.blocked_id/);
  assert.match(sql,/FROM mutes muted/);
  assert.match(sql,/FROM discovery_hidden_items hidden/);
  assert.match(sql,/hidden\.item_type='user'/);
  assert.match(sql,/u\.id<>\$1/);
});

test('activity signals come from public published content and respect the privacy toggle',async()=>{
  const h=routeHarness([]);
  await h.request({mode:'active'});
  const sql=h.calls[0].sql;
  assert.match(sql,/CASE WHEN u\.show_activity\s+THEN NULLIF\(activity\.last_activity_at/);
  assert.match(sql,/p\.moderation_status='published' AND p\.audience='public'/);
  assert.match(sql,/s\.moderation_status='published' AND s\.audience='public'/);
  assert.match(sql,/CASE WHEN \$4::text='for_you' THEN/);
  assert.doesNotMatch(sql,/\bu\.email\b|\bu\.birth_date\b/);
});

test('discovery view contains proper mobile controls, status and reset button',()=>{
  assert.match(html,/data-people-mode="for_you"[^>]*aria-pressed="true"/);
  assert.match(html,/data-people-mode="active"/);
  assert.match(html,/data-people-mode="new"/);
  assert.match(html,/id="changePeopleSuggestions"/);
  assert.match(html,/id="peopleSuggestionsStatus"[^>]*aria-live="polite"/);
  assert.match(html,/id="peopleSuggestions"[^>]*aria-busy="false"/);
});

function deferred(){
  let resolve;const promise=new Promise(res=>{resolve=res;});
  return {promise,resolve};
}
function clientHarness(api){
  const root={
    innerHTML:'',attributes:{},
    setAttribute(k,v){this.attributes[k]=v;},
    querySelector(s){return s==='[data-person-card]' && this.innerHTML.includes('data-person-card')?{}:null;}
  };
  const status={textContent:'',innerHTML:''};
  const change={disabled:true};
  const title={textContent:''};
  const clear={classList:{add(){},remove(){}}};
  const modes=['for_you','active','new'].map(mode=>({
    dataset:{peopleMode:mode},attributes:{},
    classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;}
  }));
  const $=key=>({
    '#peopleSuggestions':root,'#peopleSuggestionsStatus':status,
    '#changePeopleSuggestions':change,
    '#peopleDiscoveryTitle':title,
    '#clearPeopleSearch':clear
  })[key]||null;
  const all=query=>query==='[data-people-mode]'?modes:[];
  const personCardHTML=user=>'<article data-person-card="'+String(user.id)+'"></article>';
  const uiStateHTML=({title})=>'<div class="retry">'+title+'</div>';
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const start=client.indexOf('function syncPeopleDiscoveryControls(searching=false){');
  const end=client.indexOf('async function uploadFile(file) {',start);
  assert.ok(start>=0&&end>start);
  const code='let peopleDiscoveryMode="for_you", peopleDiscoveryPage=0, peopleDiscoveryRequestSequence=0,'+
    ' peopleDiscoveryHasMore=false,peopleDiscoveryRetryPage=0,activeExploreInterest="";\n'+
    client.slice(start,end)+
    '\nreturn {load:loadPeopleSuggestions,search:searchPeople,setMode(v){peopleDiscoveryMode=v;},'+
    'getState(){return {mode:peopleDiscoveryMode,page:peopleDiscoveryPage,more:peopleDiscoveryHasMore};}};';
  const x=new Function('$','all','api','personCardHTML','uiStateHTML','esc','renderInterestFilters',code)(
    $,all,api,personCardHTML,uiStateHTML,esc,async()=>{}
  );
  return {...x,root,status,change,modes};
}

test('recommendation mode and page are sent to the server, and change control reflects hasMore',async()=>{
  const h=clientHarness(async url=>{
    assert.match(url,/mode=active/);
    assert.match(url,/page=2/);
    return {r:{ok:true},d:{users:[{id:42}],hasMore:true}};
  });
  h.setMode('active');
  await h.load('Arte',{page:2});
  assert.equal(h.getState().page,2);
  assert.equal(h.getState().more,true);
  assert.equal(h.change.disabled,false);
  assert.match(h.root.innerHTML,/data-person-card="42"/);
});

test('failed recommendation requests show explicit retry instead of false no-users state',async()=>{
  const h=clientHarness(async()=>({r:{ok:false},d:{error:'offline'}}));
  await h.load();
  assert.match(h.status.innerHTML,/Reintentar/);
  assert.match(h.root.innerHTML,/No se pudo conectar con Descubrir/);
  assert.notEqual(h.status.textContent,'No encontramos más sugerencias con esos intereses.');
  assert.equal(h.change.disabled,true);
});

test('old recommendation response cannot overwrite newer selected mode',async()=>{
  const old=deferred(),recent=deferred();
  const h=clientHarness(url=>url.includes('mode=active')?recent.promise:old.promise);
  const first=h.load();
  h.setMode('active');
  const second=h.load();
  recent.resolve({r:{ok:true},d:{users:[{id:99}],hasMore:false}});
  await second;
  old.resolve({r:{ok:true},d:{users:[{id:1}],hasMore:true}});
  await first;
  assert.match(h.root.innerHTML,/data-person-card="99"/);
  assert.doesNotMatch(h.root.innerHTML,/data-person-card="1"/);
});

test('explicit person search wins over pending suggestions',async()=>{
  const pending=deferred();
  const h=clientHarness(url=>url.includes('/suggestions')?pending.promise:
    Promise.resolve({r:{ok:true},d:{users:[{id:57}]}}));
  const prior=h.load();
  await h.search('Ana');
  pending.resolve({r:{ok:true},d:{users:[{id:8}],hasMore:true}});
  await prior;
  assert.match(h.root.innerHTML,/data-person-card="57"/);
  assert.equal(h.change.disabled,true);
});
