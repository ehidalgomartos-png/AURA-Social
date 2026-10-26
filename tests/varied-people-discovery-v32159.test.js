'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const profiles=read('src/routes/profiles.js'),social=read('public/social.js');

function routeHarness(){
  const begin=profiles.indexOf("router.get('/suggestions', requireAuth, async (req, res) => {");
  const end=profiles.indexOf('async function ensureFavoritesCircle',begin);
  assert.ok(begin>0&&end>begin);
  const calls=[],router={get:(path,_auth,callback)=>{assert.equal(path,'/suggestions');router.getHandler=callback}};
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}};
  new Function('router','requireAuth','db','INTERESTS','normalizedInterest',
    profiles.slice(begin,end))(router,()=>{},db,[],s=>s||null);
  return {calls,request:async query=>{
    let result;
    await router.getHandler({user:{id:27},query},{json:value=>result=value});
    return result;
  }};
}
test('Para ti retains interests and genuine public-activity priority, then gives real newcomers fair visibility',async()=>{
  const h=routeHarness();await h.request({mode:'for_you',limit:'18'});
  const {sql,params}=h.calls[0];
  assert.deepEqual(params,[27,null,19,'for_you',0]);
  const a=sql.indexOf('shared_interest_count DESC'),v=sql.indexOf("activity.last_activity_at>=now()-interval '7 days')::int"),
    newcomer=sql.indexOf("(u.created_at>=now()-interval '30 days')::int"),
    rotation=sql.indexOf("md5($1::text || ':' || CURRENT_DATE::text || ':' || u.id::text)");
  assert.ok(a>0&&v>a&&newcomer>v&&rotation>newcomer);
  assert.match(sql,/following ASC/);
  assert.match(sql,/u\.id DESC\s+LIMIT \$3 OFFSET \$5/);
});
test('rotation is stable per signed-in viewer and day, and enabled only in personalized order',async()=>{
  const h=routeHarness();
  for(const mode of ['active','new','for_you'])await h.request({mode,page:'2',limit:'4'});
  for(const row of h.calls){
    assert.match(row.sql,/CASE WHEN \$4::text='for_you' THEN\s+md5\(\$1::text/);
    assert.match(row.sql,/CURRENT_DATE::text/);
    assert.doesNotMatch(row.sql,/ORDER BY random\(\)/i);
    assert.deepEqual(row.params.slice(0,1),[27]);
    assert.equal(row.params[4],8);
  }
  assert.match(h.calls[0].sql,/CASE WHEN \$4::text='active' THEN activity\.last_activity_at/);
  assert.match(h.calls[0].sql,/CASE WHEN \$4::text='new' THEN u\.created_at/);
});
test('security filters and visibility rules remain in front of every ranked suggestion',async()=>{
  const h=routeHarness();await h.request({mode:'for_you'});
  const sql=h.calls[0].sql;
  for(const entry of ["u.status='active'","u.is_admin=false","u.discoverable=true",
    "u.id<>$1","blocked.blocker_id=$1","blocked.blocked_id=$1",
    "blocked.blocker_id=u.id","FROM mutes muted",
    "FROM discovery_hidden_items hidden","hidden.item_type='user'",
    "p.moderation_status='published' AND p.audience='public'",
    "s.moderation_status='published' AND s.audience='public'",
    "u.show_activity=true AND activity.last_activity_at"]){
    assert.ok(sql.includes(entry),entry);
  }
  assert.doesNotMatch(sql,/\bu\.email\b|\bu\.birth_date\b|\bis_online\b|INSERT INTO users/i);
});
test('exhausted pages do not silently repeat page zero and manually offer a reset',()=>{
  const start=social.indexOf('async function loadPeopleSuggestions(');
  const end=social.indexOf('async function searchPeople(',start);
  assert.ok(start>0&&end>start);
  const text=social.slice(start,end);
  assert.doesNotMatch(text,/if\(page>0&&!users\.length\)\s*\{\s*return loadPeopleSuggestions/);
  assert.match(text,/peopleDiscoveryPage=page/);
  assert.match(text,/peopleDiscoveryHasMore=d\.hasMore===true && page<10 && users\.length>0/);
  assert.match(text,/page>0\?'Ya has visto las sugerencias disponibles\.'/);
  assert.match(text,/data-people-mode-reset/);
  assert.match(text,/if\(requestId!==peopleDiscoveryRequestSequence\)return/);
});
test('the client preserves the three explicit discovery modes and does not invent recommendations',()=>{
  assert.match(social,/\['for_you','active','new'\]\.includes\(mode\)/);
  assert.match(social,/users\.map\(user=>personCardHTML\(user,false,peopleDiscoveryMode\)\)/);
  assert.match(social,/if\(!r\.ok\)throw Error\('suggestions_unavailable'\)/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/varied-people-discovery-v32159\.test\.js/);
});
