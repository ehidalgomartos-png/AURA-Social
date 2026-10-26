'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {GROWTH_SQL,summarizeGrowth,rate}=require('../src/routes/admin-growth-v219');
const admin=read('public/admin.js');
function row(extra={}){return {
  source_type:'unattributed',guide_slug:null,local_day:'2026-10-26',
  eligible_week:false,eligible_d1:false,eligible_d7:false,
  first_week:false,d1:false,d7:false,
  profile_complete:false,has_first_post:false,...extra
};}
test('SQL calculates truthful profile completion from current avatar, bio and interests without returning personal fields',()=>{
  assert.match(GROWTH_SQL,/NULLIF\(BTRIM\(profile\.bio\),''\)/);
  assert.match(GROWTH_SQL,/profile\.avatar_url IS NOT NULL/);
  assert.match(GROWTH_SQL,/EXISTS\(SELECT 1 FROM user_interests ui WHERE ui\.user_id=profile\.id\)/);
  assert.match(GROWTH_SQL,/AS profile_complete/);
  assert.match(GROWTH_SQL,/AS has_first_post/);
  assert.match(GROWTH_SQL,/first_post\.moderation_status='published'/);
  assert.match(GROWTH_SQL,/first_post\.post_kind='post'/);
  assert.match(GROWTH_SQL,/WHERE u\.is_admin=FALSE/);
  assert.doesNotMatch(GROWTH_SQL,/\bemail\b|password_hash|ip_address|message_body|SELECT \*/i);
});
test('signup cohort counts all eligible profiles and first posts with actual denominators',()=>{
 const x=summarizeGrowth([
   row({source_type:'profile',profile_complete:true,has_first_post:true}),
   row({source_type:'post',profile_complete:true}),
   row({source_type:'profile',has_first_post:true}),
   row({})
 ],30);
 assert.equal(x.totals.signups,4);
 assert.equal(x.totals.completedProfiles,2);
 assert.equal(x.totals.firstPosts,2);
 assert.equal(x.totals.profileCompleteRatePct,50);
 assert.equal(x.totals.firstPostRatePct,50);
 assert.equal(x.sources.find(s=>s.source==='profile').completedProfiles,1);
 assert.equal(x.sources.find(s=>s.source==='post').firstPosts,0);
 assert.equal(x.privacy.individualUserData,false);
 assert.equal(x.privacy.adminOnly,true);
 assert.equal(x.privacy.externalTracking,false);
});
test('zero users means no fake conversion rate; legacy rows remain compatible',()=>{
 const empty=summarizeGrowth([],7);
 assert.equal(empty.totals.completedProfiles,0);
 assert.equal(empty.totals.firstPosts,0);
 assert.equal(empty.totals.profileCompleteRatePct,null);
 assert.equal(empty.totals.firstPostRatePct,null);
 const legacy=summarizeGrowth([row({profile_complete:undefined,has_first_post:undefined})],30);
 assert.equal(legacy.totals.profileCompleteRatePct,0);
 assert.equal(legacy.totals.firstPostRatePct,0);
});
test('only strict boolean true counts, not raw untrusted or string values',()=>{
 const x=summarizeGrowth([
  row({profile_complete:true,has_first_post:true}),
  row({profile_complete:'true',has_first_post:1}),
  row({profile_complete:null,has_first_post:null})
 ],90);
 assert.equal(x.totals.completedProfiles,1);
 assert.equal(x.totals.firstPosts,1);
 assert.equal(x.totals.profileCompleteRatePct,33.3);
 assert.equal(x.totals.firstPostRatePct,33.3);
 assert.equal(rate(1,0),null);
});
test('dashboard preserves historical D1/D7 metrics and labels new cohorts as current state',()=>{
 assert.match(admin,/\['Perfiles completos',growthCenterRate\(t\.profileCompleteRatePct,t\.signups\)\]/);
 assert.match(admin,/\['Con primera publicación',growthCenterRate\(t\.firstPostRatePct,t\.signups\)\]/);
 assert.match(admin,/\['Actividad D1',growthCenterRate/);
 assert.match(admin,/\['Actividad D7',growthCenterRate/);
 assert.match(admin,/no son conversiones en 24 horas/);
 const defs=summarizeGrowth([row()],7).definitions;
 assert.match(defs.profileComplete,/hoy/);
 assert.match(defs.firstPost,/hoy/);
 assert.match(defs.firstPost,/excluye Reels/);
});
test('admin-only, read-only and no PII or third-party instrumentation',()=>{
 const route=read('src/routes/admin-growth-v219.js');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/res\.setHeader\('Cache-Control','no-store'\)/);
 assert.doesNotMatch(route,/router\.(?:post|put|patch|delete)\(/);
 assert.doesNotMatch(route,/sendBeacon|localStorage|third.party|utm_cookie|INSERT INTO|UPDATE users/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/activation-growth-v32164\.test\.js/);
});
