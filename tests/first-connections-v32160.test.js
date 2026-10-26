'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const routes=read('src/routes/growth.js'),client=read('public/social.js');

function starterQuery(){
  const a=routes.indexOf('  const starterProfiles=await db.query(');
  const b=routes.indexOf('  res.json({',a);
  assert.ok(a>0&&b>a);
  return routes.slice(a,b);
}
test('first-circle candidates are genuine active discoverable non-admin users',()=>{
  const query=starterQuery();
  for(const v of ["u.id<>$1","u.status='active'","u.is_admin=false",
    "u.discoverable=true","NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id)",
    "NOT EXISTS(SELECT 1 FROM blocks b", "NOT EXISTS(SELECT 1 FROM mutes m",
    "NOT EXISTS(SELECT 1 FROM discovery_hidden_items h",
    "h.item_type='user'","LIMIT 6","[req.user.id]"]){
    assert.ok(query.includes(v),v);
  }
  assert.doesNotMatch(query,/\bis_online\b|INSERT INTO users|GENERATE_SERIES|\bu\.email\b/i);
});
test('shared interests and real newcomers precede popularity for initial connections',()=>{
  const query=starterQuery();
  const order=query.indexOf('ORDER BY shared_interest_count DESC');
  const joined=query.indexOf("(u.created_at>=now()-interval '30 days') DESC");
  const profile=query.indexOf("NULLIF(BTRIM(u.bio),'') IS NOT NULL");
  const stable=query.indexOf("md5($1::text || ':' || CURRENT_DATE::text || ':first-circle:' || u.id::text)");
  const followers=query.indexOf('follower_count DESC');
  assert.ok(order>0&&joined>order&&profile>joined&&stable>profile&&followers>stable);
  assert.match(query,/AS recent_joiner/);
  assert.match(query,/false AS following/);
  assert.doesNotMatch(query,/ORDER BY random\(\)/i);
});
function render(user){
  const start=client.indexOf('function personCardHTML(');
  const end=client.indexOf('async function hideDiscoveryPerson(',start);
  assert.ok(start>0&&end>start);
  const context={
    Number,String,
    profileLink:(_username,markup)=>markup,
    avatarHTML:()=>'<span>Foto</span>',
    interestPillsHTML:()=>'<span></span>',
    esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  };
  vm.runInNewContext(client.slice(start,end)+'\nthis.render=personCardHTML;',context);
  return context.render(user,true,'starter');
}
test('starter cards explain a verified real common interest, not invented activity',()=>{
  const html=render({id:11,username:'alba',display_name:'Alba',
    shared_interest_count:2,recent_joiner:false,following:false});
  assert.match(html,/2 intereses en común/);
  assert.doesNotMatch(html,/Actividad pública reciente|Nuevo por aquí|En línea/);
  assert.match(html,/data-suggest-follow="11"/);
});
test('new joiners are labelled as newcomers only with server truth; older users get a neutral label',()=>{
  const recent=render({id:1,username:'u',display_name:'U',recent_joiner:true});
  const unknown=render({id:2,username:'v',display_name:'V'});
  assert.match(recent,/Se ha unido hace poco/);
  assert.match(unknown,/Descubre su perfil/);
  assert.doesNotMatch(unknown,/Se ha unido hace poco|Nuevo por aquí/);
  assert.doesNotMatch(recent,/En línea|Activo ahora/);
});
test('the existing onboarding panel keeps explicit follow and discovery, with no new Home card or auto-follow',()=>{
  const start=client.indexOf('async function loadGrowthPanel()');
  const end=client.indexOf('async function shareGrowthInvite(',start);
  const block=client.slice(start,end);
  assert.match(block,/starters\.map\(user=>personCardHTML\(user,true,'starter'\)\)/);
  assert.match(block,/api\('\/api\/growth\/me'\)/);
  assert.doesNotMatch(block,/\/follow'.*method:\s*'POST'|autoFollow|INSERT INTO follows/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/first-connections-v32160\.test\.js/);
});
