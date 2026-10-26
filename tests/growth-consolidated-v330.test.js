'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {GROWTH_SQL,summarizeGrowth,rate,DAY_OPTIONS}=require('../src/routes/admin-growth-v219');
const admin=read('public/admin.js'),html=read('public/admin.html');

function row(extra={}){
  return {
    source_type:'unattributed',guide_slug:null,local_day:'2026-10-26',
    eligible_week:false,first_week:false,eligible_d1:false,d1:false,
    eligible_d7:false,d7:false,profile_complete:false,has_first_post:false,
    has_social_contact:false,...extra
  };
}
test('outward social participation is real, privacy-safe, and never inferred from message content',()=>{
  assert.match(GROWTH_SQL,/EXISTS\(SELECT 1 FROM follows social_follow JOIN users followed/);
  assert.match(GROWTH_SQL,/social_follow\.follower_id=s\.id/);
  assert.match(GROWTH_SQL,/followed\.status='active'/);
  assert.match(GROWTH_SQL,/EXISTS\(SELECT 1 FROM comments social_reply/);
  assert.match(GROWTH_SQL,/JOIN posts parent_post ON parent_post\.id=social_reply\.post_id/);
  assert.match(GROWTH_SQL,/social_reply\.user_id=s\.id/);
  assert.match(GROWTH_SQL,/parent_post\.user_id<>s\.id/);
  assert.match(GROWTH_SQL,/parent_post\.moderation_status='published'/);
  assert.match(GROWTH_SQL,/parent_post\.audience='public'/);
  assert.match(GROWTH_SQL,/AS has_social_contact/);
  assert.doesNotMatch(GROWTH_SQL,/\bemail\b|password_hash|ip_address|message_body|\bSELECT \*\b/i);
});
test('combined activation requires both genuine publishing and participation',()=>{
  const result=summarizeGrowth([
    row({source_type:'post',profile_complete:true,has_first_post:true,has_social_contact:true}),
    row({source_type:'profile',profile_complete:true,has_first_post:true}),
    row({source_type:'community',has_social_contact:true}),
    row({})
  ],30);
  assert.equal(result.totals.signups,4);
  assert.equal(result.totals.firstPosts,2);
  assert.equal(result.totals.socialContacts,2);
  assert.equal(result.totals.publishAndConnect,1);
  assert.equal(result.totals.socialContactRatePct,50);
  assert.equal(result.totals.publishAndConnectRatePct,25);
  assert.equal(result.totals.completedProfiles,2);
  assert.equal(result.totals.firstPostRatePct,50);
  assert.equal(result.sources.find(x=>x.source==='post').publishAndConnect,1);
  assert.equal(result.sources.find(x=>x.source==='community').socialContacts,1);
  assert.equal(result.privacy.adminOnly,true);
  assert.equal(result.privacy.individualUserData,false);
  assert.equal(result.privacy.externalTracking,false);
});
test('zero signups yield null rates and the API does not invent visitors or responses',()=>{
  const empty=summarizeGrowth([],7);
  assert.equal(empty.totals.signups,0);
  assert.equal(empty.totals.socialContacts,0);
  assert.equal(empty.totals.publishAndConnect,0);
  assert.equal(empty.totals.socialContactRatePct,null);
  assert.equal(empty.totals.publishAndConnectRatePct,null);
  assert.equal(rate(0,0),null);
  const unknown=summarizeGrowth([row({has_social_contact:undefined,has_first_post:undefined})],7);
  assert.equal(unknown.totals.socialContactRatePct,0);
  assert.equal(unknown.totals.publishAndConnectRatePct,0);
});
test('only booleans true are counted, avoiding string or numeric false positives',()=>{
  const result=summarizeGrowth([
    row({has_first_post:true,has_social_contact:true}),
    row({has_first_post:'true',has_social_contact:true}),
    row({has_first_post:true,has_social_contact:1}),
    row({has_first_post:true,has_social_contact:'true'})
  ],90);
  assert.equal(result.totals.socialContacts,2);
  assert.equal(result.totals.publishAndConnect,1);
  assert.equal(result.totals.socialContactRatePct,50);
  assert.equal(result.totals.publishAndConnectRatePct,25);
});
test('new rates are not misrepresented as chronological steps or registrations from impressions',()=>{
  assert.match(html,/Crecimiento consolidado/);
  assert.match(html,/V3\.3\.0/);
  assert.match(admin,/\['Siguen o comentan',growthCenterRate\(t\.socialContactRatePct,t\.signups\)\]/);
  assert.match(admin,/\['Publican y participan',growthCenterRate\(t\.publishAndConnectRatePct,t\.signups\)\]/);
  assert.match(admin,/no implica orden cronológico ni una respuesta recibida/);
  assert.match(admin,/No mide sesiones, visitas ni conversiones desde impresiones/);
  const defs=summarizeGrowth([],30).definitions;
  assert.match(defs.socialContact,/siguen hoy|han comentado una publicación pública ajena/);
  assert.match(defs.publishAndConnect,/No es una secuencia temporal/);
  assert.deepEqual(DAY_OPTIONS,[7,30,90]);
});
test('legacy first-post metrics and mature retention cohorts remain unchanged',()=>{
  const x=summarizeGrowth([
    row({has_first_post:true,has_social_contact:true,
      eligible_d1:true,d1:true,eligible_d7:true,d7:false,eligible_week:true,first_week:true}),
    row({eligible_d1:true,d1:false,eligible_d7:true,d7:true,eligible_week:true,first_week:false})
  ],30);
  assert.equal(x.totals.firstPosts,1);
  assert.equal(x.totals.firstPostRatePct,50);
  assert.equal(x.totals.firstWeekRatePct,50);
  assert.equal(x.totals.d1RatePct,50);
  assert.equal(x.totals.d7RatePct,50);
});
test('growth reporting is read only, admin only, cache safe, with no tracking or additional data storage',()=>{
  const src=read('src/routes/admin-growth-v219.js');
  assert.match(src,/router\.use\(requireAdmin\)/);
  assert.match(src,/res\.setHeader\('Cache-Control','no-store'\)/);
  assert.doesNotMatch(src,/router\.(?:post|patch|put|delete)\(/);
  assert.doesNotMatch(src,/sendBeacon|localStorage|pixel|analytics\.google\.com|INSERT INTO|UPDATE users/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/growth-consolidated-v330\.test\.js/);
});
