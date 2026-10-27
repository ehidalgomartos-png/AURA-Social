'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const growth=read('src/routes/growth.js'),social=read('public/social.js');
test('first-circle count only includes real active non-admin accounts',()=>{
 assert.match(growth,/\(SELECT count\(\*\)::int FROM follows f JOIN users followed ON followed\.id=f\.following_id\s+WHERE f\.follower_id=u\.id AND followed\.status='active' AND followed\.is_admin=false\) following_count/);
 assert.doesNotMatch(growth,/\(SELECT count\(\*\)::int FROM follows f WHERE f\.follower_id=u\.id\) following_count/);
 assert.match(growth,/id:'follow'[\s\S]{0,170}Math\.min\(3,Math\.max\(0,Number\(user\.following_count\)\|\|0\)\)/);
 assert.match(growth,/done:Number\(user\.following_count\|\|0\)>=3/);
});
test('recommendations remain genuine and respect discovery privacy and blocks',()=>{
 const start=growth.indexOf('const starterProfiles=await db.query(');
 const end=growth.indexOf('res.json({',start);
 assert.ok(start>=0 && end>start);
 const code=growth.slice(start,end);
 for(const phrase of ["u.status='active'","u.is_admin=false","u.discoverable=true",
    "FROM blocks b","FROM mutes m","FROM discovery_hidden_items h",
    "NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1"]){
  assert.ok(code.includes(phrase),phrase);
 }
 assert.match(code,/shared_interest_count DESC/);
 assert.match(code,/LIMIT 6/);
});
test('an empty recommendation list never falsely claims the user has finished building a network',()=>{
 assert.match(social,/No hay nuevas sugerencias disponibles ahora/);
 assert.match(social,/P uedes entrar en Explorar|Puedes entrar en Explorar/);
 assert.doesNotMatch(social,/Tu red ya está en marcha\.<\/b><small>Explora/);
 assert.match(social,/starters\.map\(user=>personCardHTML\(user,true,'starter'\)\)/);
 assert.match(social,/function growthStepHTML\(step\)/);
 assert.match(social,/data-growth-action/);
});
test('no additional writes, tracking, emails or new UI structures',()=>{
 assert.match(growth,/router\.get\('\/me', requireAuth/);
 assert.match(growth,/steps\.find\(step=>!step\.done\)\|\|null/);
 assert.doesNotMatch(growth,/sendBeacon|localStorage|pixel|autoFollow|fake_profile/);
 const html=read('public/app.html');
 assert.equal(html.split('firstcircle=3.3.34').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/first-circle-accuracy-v3334\.test\.js/);
 assert.match(read('tests/real-onboarding-consistency-v3330.test.js'),/growth responses remain private/);
});
