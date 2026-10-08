'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {summarizeGrowth,rate,GROWTH_SQL,DAY_OPTIONS,createGrowthCenterRouter}=require('../src/routes/admin-growth-v219');
const {ensureSignupAttributionSchema,TYPES}=require('../src/services/signup-attribution-schema-v219');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function row(props={}){
  return {source_type:'unattributed',guide_slug:null,local_day:'2026-10-01',
    eligible_week:false,eligible_d1:false,eligible_d7:false,
    first_week:false,d1:false,d7:false,...props};
}

test('growth windows are fixed and never caller-controlled SQL intervals',()=>{
  assert.deepEqual(DAY_OPTIONS,[7,30,90]);
  assert.match(GROWTH_SQL,/\$1::int\*interval '1 day'/);
  assert.match(GROWTH_SQL,/WHERE u\.is_admin=FALSE/);
  assert.doesNotMatch(GROWTH_SQL,/SELECT \*|password_hash|m\.body|message_body|email/);
});
test('empty cohorts have no fabricated percentage or personal information',()=>{
  const d=summarizeGrowth([],30);
  assert.equal(d.totals.signups,0);
  assert.equal(d.totals.firstWeekRatePct,null);
  assert.equal(d.totals.d1RatePct,null);
  assert.equal(d.totals.d7RatePct,null);
  assert.equal(d.guides.length,3);
  assert.equal(d.privacy.individualUserData,false);
  assert.equal(d.privacy.externalTracking,false);
});
test('ineligible new accounts are excluded from D1/D7 rates',()=>{
  const d=summarizeGrowth([row({source_type:'guide',guide_slug:'como-empezar',
    first_week:true,d1:true,d7:true})],7);
  assert.equal(d.totals.signups,1);
  assert.equal(d.totals.eligibleWeek,0);
  assert.equal(d.totals.activeD1,0);
  assert.equal(d.totals.activeD7,0);
  assert.equal(d.totals.d1RatePct,null);
});
test('D1/D7 and first-week conversions use mature cohorts as denominators',()=>{
  const d=summarizeGrowth([
    row({source_type:'guide',guide_slug:'como-empezar',eligible_week:true,
      eligible_d1:true,eligible_d7:true,first_week:true,d1:true,d7:false}),
    row({source_type:'profile',eligible_week:true,eligible_d1:true,eligible_d7:true,
      first_week:false,d1:false,d7:true}),
    row({source_type:'post',eligible_d1:true,d1:true})
  ],30);
  assert.equal(d.totals.signups,3);
  assert.equal(d.totals.firstWeekRatePct,50);
  assert.equal(d.totals.d1RatePct,66.7);
  assert.equal(d.totals.d7RatePct,50);
  assert.equal(d.totals.eligibleD7,2);
  assert.equal(d.totals.firstWeek,1);
});
test('source mix includes unattributed records without assuming direct traffic',()=>{
  const d=summarizeGrowth([
    row({source_type:'guide',guide_slug:'como-empezar'}),
    row({source_type:'unattributed'}),
    row({source_type:'nonstandard'})
  ],30);
  assert.equal(d.totals.attributedSignups,1);
  assert.equal(d.totals.attributionRatePct,33.3);
  assert.equal(d.sources.find(x=>x.source==='unattributed').signups,2);
  assert.match(d.definitions.attribution,/no equivale/);
});
test('only public, catalog-approved guide identifiers are emitted',()=>{
  const d=summarizeGrowth([
    row({source_type:'guide',guide_slug:'como-empezar'}),
    row({source_type:'guide',guide_slug:'private@example.org'}),
    row({source_type:'guide',guide_slug:'privacidad-y-consentimiento'})
  ],30);
  assert.equal(d.sources.find(x=>x.source==='guide').signups,3);
  assert.equal(d.guides.find(x=>x.slug==='como-empezar').signups,1);
  assert.equal(d.guides.find(x=>x.slug==='privacidad-y-consentimiento').signups,1);
  assert.ok(!JSON.stringify(d).includes('private@example.org'));
});
test('daily signups are chronological and do not contain user identifiers',()=>{
  const d=summarizeGrowth([
    row({local_day:'2026-10-08'}),row({local_day:'2026-10-06'}),
    row({local_day:'2026-10-08'}),row({local_day:'not-a-date'})
  ],7);
  assert.deepEqual(d.daily,[{day:'2026-10-06',signups:1},{day:'2026-10-08',signups:2}]);
  assert.ok(!JSON.stringify(d).includes('userId'));
});
test('rates report one decimal; zero-eligible means insufficient sample',()=>{
  assert.equal(rate(1,3),33.3);
  assert.equal(rate(0,100),0);
  assert.equal(rate(0,0),null);
});
test('engagement considers actions, not reading private messages',()=>{
  for(const collection of ['posts','comments','follows','messages','likes'])assert.ok(GROWTH_SQL.includes('FROM '+collection));
  assert.ok(GROWTH_SQL.includes('sender_id=s.id'));
  assert.doesNotMatch(GROWTH_SQL,/\b(?:caption|content|body|text|message_text|ip_address)\b/);
});
test('registration schema explicitly includes guide and widens old check in-place',async()=>{
  const queries=[];
  await ensureSignupAttributionSchema({query:async sql=>{queries.push(sql);return {rows:[]};}});
  assert.ok(TYPES.includes('guide'));
  assert.match(queries[0],/CREATE TABLE IF NOT EXISTS signup_attributions/);
  assert.match(queries[0],/'guide'/);
  assert.match(queries[1],/position\('guide' IN existing_definition\)=0/);
  assert.match(queries[1],/ADD CONSTRAINT signup_attributions_source_type_check/);
  assert.doesNotMatch(queries.join(' '),/DROP TABLE|DELETE FROM|TRUNCATE/);
});
test('both registration and legacy attribution dashboard reuse shared schema',()=>{
  assert.match(read('src/routes/auth.js'),/await ensureSignupAttributionSchema\(db\)/);
  assert.match(read('src/routes/admin.js'),/await ensureSignupAttributionSchema\(db\)/);
  assert.match(read('src/routes/admin-growth-v219.js'),/await ensureSignupAttributionSchema\(db\)/);
});
test('unauthenticated users cannot query growth center',async()=>{
  const db={query:async()=>{throw Error('database should not be accessed')}};
  const app=express();
  app.use('/api/admin',createGrowthCenterRouter({db}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/growth-center');
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,'authentication_required');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
test('growth center is mounted before legacy admin and no-store',()=>{
  const server=read('server.js');
  const route=read('src/routes/admin-growth-v219.js');
  assert.ok(server.indexOf('createGrowthCenterRouter({db})')<server.indexOf("app.use('/api/admin', adminRoutes)"));
  assert.match(route,/router\.use\(requireAdmin\)/);
  assert.match(route,/Cache-Control','no-store'/);
  assert.match(route,/router\.get\('\/growth-center'/);
  assert.doesNotMatch(route,/router\.(?:post|put|patch|delete)\(/);
});
test('mobile admin UI includes cohorts, source mix, guide table and refresh',()=>{
  const html=read('public/admin.html'),js=read('public/admin.js');
  for(const id of ['growthCenterDays','growthCenterMetrics','growthCenterSources','growthCenterGuides','growthCenterDaily','reloadGrowthCenter','growthCenterMethod'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/async function growthCenter\(\)/);
  assert.match(js,/growthCenterRate/);
  assert.match(js,/growthCenter\(\), releaseVerification\(\)/);
  assert.match(js,/D1 = acciones entre 24 y 48 h/);
});
test('privacy coverage does not claim browser sessions, attribution of unknown traffic or monetization',()=>{
  const src=read('src/routes/admin-growth-v219.js');
  assert.doesNotMatch(src,/utm_cookie|pixel|localStorage|sendBeacon|third.party/);
  assert.match(src,/No implica sesión ni lectura de mensajes/);
});
