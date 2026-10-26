'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {GROWTH_SQL,summarizeGrowth}=require('../src/routes/admin-growth-v219');
const row=(extra={})=>({
 source_type:'unattributed',guide_slug:null,local_day:'2026-10-26',
 eligible_week:false,first_week:false,eligible_d1:false,d1:false,
 eligible_d7:false,d7:false,profile_complete:false,has_first_post:false,
 has_social_contact:false,public_contribution_d1:false,public_contribution_d7:false,...extra
});
test('each D1/D7 contribution is an existing published public normal post or comment on another person',()=>{
 for(const day of [1,7]){
  const p='public_post_d'+day,c='public_comment_d'+day,original='public_parent_d'+day;
  for(const term of [
    'FROM posts '+p,p+".moderation_status='published'",
    p+".audience='public'",p+".content_level='normal'",p+".post_kind='post'",
    'FROM comments '+c,'JOIN posts '+original+' ON '+original+'.id='+c+'.post_id',
    original+'.user_id<>s.id',original+".moderation_status='published'",
    original+".audience='public'",original+".content_level='normal'",
    original+".post_kind='post'",
    "created_at>=s.created_at+interval '"+day+" days'",
    "created_at<s.created_at+interval '"+(day+1)+" days'",
    'AS public_contribution_d'+day
  ])assert.ok(GROWTH_SQL.includes(term),term);
 }
 assert.doesNotMatch(GROWTH_SQL,/password_hash|ip_address|message_body|SELECT \*/i);
});
test('mature denominators and strict boolean values prevent overstated contribution',()=>{
 const x=summarizeGrowth([
  row({source_type:'post',eligible_d1:true,eligible_d7:true,d1:true,d7:true,public_contribution_d1:true,public_contribution_d7:true}),
  row({source_type:'profile',eligible_d1:true,eligible_d7:true,d1:true,d7:true}),
  row({eligible_d1:true,eligible_d7:true,d1:true,d7:true,public_contribution_d1:'true',public_contribution_d7:1}),
  row({public_contribution_d1:true,public_contribution_d7:true})
 ],30);
 assert.equal(x.totals.signups,4);
 assert.equal(x.totals.eligibleD1,3);assert.equal(x.totals.eligibleD7,3);
 assert.equal(x.totals.activeD1,3);assert.equal(x.totals.activeD7,3);
 assert.equal(x.totals.publicD1,1);assert.equal(x.totals.publicD7,1);
 assert.equal(x.totals.publicD1RatePct,33.3);assert.equal(x.totals.publicD7RatePct,33.3);
 assert.equal(x.totals.d1RatePct,100);assert.equal(x.totals.d7RatePct,100);
 assert.equal(x.sources.find(s=>s.source==='post').publicD7,1);
 assert.equal(x.privacy.adminOnly,true);assert.equal(x.privacy.individualUserData,false);
});
test('immature cohorts have unknown contribution rate rather than an invented zero',()=>{
 const empty=summarizeGrowth([],7).totals;
 assert.equal(empty.publicD1,0);assert.equal(empty.publicD7,0);
 assert.equal(empty.publicD1RatePct,null);assert.equal(empty.publicD7RatePct,null);
 const young=summarizeGrowth([row({public_contribution_d1:true,public_contribution_d7:true})],7).totals;
 assert.equal(young.publicD1,0);assert.equal(young.publicD7,0);
 assert.equal(young.publicD1RatePct,null);assert.equal(young.publicD7RatePct,null);
});
test('original D1/D7 metrics remain comparable, with the new measure described in existing admin note',()=>{
 const x=summarizeGrowth([row({eligible_d1:true,d1:true,eligible_d7:true,d7:true})],30);
 assert.equal(x.totals.d1RatePct,100);assert.equal(x.totals.d7RatePct,100);
 assert.equal(x.totals.publicD1RatePct,0);assert.equal(x.totals.publicD7RatePct,0);
 assert.match(x.definitions.publicD1,/post ordinario público normal/);
 assert.match(x.definitions.publicD7,/No mide visitas, sesiones/);
 const admin=read('public/admin.js'),html=read('public/admin.html');
 assert.match(admin,/Aportación pública D1/);
 assert.match(admin,/growthCenterRate\(t\.publicD1RatePct,t\.eligibleD1\)/);
 assert.match(admin,/growthCenterRate\(t\.publicD7RatePct,t\.eligibleD7\)/);
 assert.equal((html.match(/id="growthCenterMetrics"/g)||[]).length,1);
});
test('admin reporting stays read only, without additional tracking or data collection',()=>{
 const route=read('src/routes/admin-growth-v219.js');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/res\.setHeader\('Cache-Control','no-store'\)/);
 assert.doesNotMatch(route,/router\.(?:post|put|delete|patch)\(/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE users|sendBeacon|google-analytics|localStorage/);
 assert.match(read('.github/workflows/validate-js.yml'),/growth-public-contribution-postgres-v335\.test\.js/);
});
