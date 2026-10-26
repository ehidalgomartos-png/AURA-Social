'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const growth=read('src/routes/growth.js'),social=read('public/social.js');
function sql(){
 const start=growth.indexOf('  const starterProfiles=await db.query(');
 const end=growth.indexOf('  res.json({',start);
 assert.ok(start>0&&end>start);
 return growth.slice(start,end);
}
test('only real recent ordinary public normal posts support activity labels',()=>{
 const q=sql();
 for(const term of ["u.show_activity=true","EXISTS(","FROM posts public_post",
 "public_post.moderation_status='published'","public_post.audience='public'",
 "public_post.content_level='normal'","public_post.post_kind='post'",
 "public_post.created_at>=now()-interval '14 days'","AS recent_public_post"]){
  assert.ok(q.includes(term),term);
 }
 assert.doesNotMatch(q,/SELECT\s+(?:email|ip_address|password_hash|content|caption)\b/i);
});
test('interest fit, true newcomers, then real public participation outrank popularity',()=>{
 const q=sql();
 const order=['ORDER BY shared_interest_count DESC',"(u.created_at>=now()-interval '30 days') DESC",
              'recent_public_post DESC',"NULLIF(BTRIM(u.bio),'') IS NOT NULL",
              "md5($1::text || ':' || CURRENT_DATE::text || ':first-circle:' || u.id::text)",
              'follower_count DESC'];
 let previous=-1;
 for(const part of order){const i=q.indexOf(part);assert.ok(i>previous,part);previous=i;}
 assert.doesNotMatch(q,/ORDER BY random\(\)/);
});
test('respect real users, blocks, mutes, follows, discoverability and hidden suggestions',()=>{
 const q=sql();
 for(const part of ["u.id<>$1","u.status='active'","u.is_admin=false","u.discoverable=true",
  "NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id)",
  "NOT EXISTS(SELECT 1 FROM blocks b","NOT EXISTS(SELECT 1 FROM mutes m",
  "NOT EXISTS(SELECT 1 FROM discovery_hidden_items h","h.item_type='user'","LIMIT 6","[req.user.id]"]){
  assert.ok(q.includes(part),part);
 }
});
function render(user){
 const a=social.indexOf('function personCardHTML('),b=social.indexOf('async function hideDiscoveryPerson(',a);
 assert.ok(a>0&&b>a);
 const ctx={Number,String,profileLink:(_name,markup)=>markup,avatarHTML:()=>'<span>Foto</span>',
  interestPillsHTML:()=>'',esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')};
 vm.runInNewContext(social.slice(a,b)+'\nthis.render=personCardHTML;',ctx);
 return ctx.render(user,true,'starter');
}
test('activity message requires server flag and never promises online status',()=>{
 const active=render({id:2,username:'ana',display_name:'Ana',recent_public_post:true,recent_joiner:false});
 const inactive=render({id:3,username:'bea',display_name:'Bea',recent_public_post:false});
 const unknown=render({id:4,username:'cora',display_name:'Cora'});
 assert.match(active,/publicación pública en los últimos 14 días/);
 assert.doesNotMatch(inactive,/últimos 14 días/);
 assert.doesNotMatch(unknown,/últimos 14 días/);
 assert.doesNotMatch(active,/En línea|Activo ahora|Ha respondido/);
 assert.match(active,/data-suggest-follow="2"/);
 assert.match(render({id:5,username:'leo',display_name:'Leo',shared_interest_count:1,recent_public_post:true}),/1 interés en común/);
 assert.match(render({id:6,username:'lia',display_name:'Lia',recent_joiner:true,recent_public_post:true}),/Se ha unido hace poco/);
});
test('same onboarding panel and explicit follow controls, no auto-follow or tracking',()=>{
 const html=read('public/app.html');
 assert.equal((html.match(/id="growthStarterPeople"/g)||[]).length,1);
 assert.match(social,/starters\.map\(user=>personCardHTML\(user,true,'starter'\)\)/);
 assert.match(social,/data-suggest-follow/);
 assert.doesNotMatch(sql(),/INSERT INTO follows|UPDATE users|sendEmail|autoFollow|is_online/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/real-connections-v333\.test\.js/);
});
