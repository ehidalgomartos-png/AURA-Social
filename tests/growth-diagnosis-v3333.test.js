'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {diagnoseGrowthV3333,summarizeGrowth,DIAGNOSIS_MIN_SAMPLE_V3333,GROWTH_SQL}
  =require('../src/routes/admin-growth-v219');
const admin=read('public/admin.js');
function row(extra={}){
  return {source_type:'unattributed',local_day:'2026-10-27',
    eligible_week:false,eligible_d1:false,eligible_d7:false,
    ...extra};
}
test('empty and small samples never produce a misleading ranking',()=>{
 assert.equal(DIAGNOSIS_MIN_SAMPLE_V3333,10);
 const empty=summarizeGrowth([],30);
 assert.equal(empty.diagnosis.sample,0);
 assert.equal(empty.diagnosis.sampleSufficient,false);
 assert.deepEqual(empty.diagnosis.opportunities,[]);
 const nine=summarizeGrowth(Array.from({length:9},(_,i)=>row({has_first_post:i<3})),30);
 assert.equal(nine.diagnosis.sample,9);
 assert.equal(nine.diagnosis.sampleSufficient,false);
 assert.equal(nine.diagnosis.opportunities.length,0);
});
test('aggregated pending states are correctly ranked but never called funnel abandonment',()=>{
 const rows=Array.from({length:12},(_,i)=>row({
  profile_complete:i<8,has_first_post:i<4,has_social_contact:i<2
 }));
 const result=summarizeGrowth(rows,30);
 const d=result.diagnosis;
 assert.equal(d.sample,12);
 assert.equal(d.sampleSufficient,true);
 assert.deepEqual(d.opportunities.map(x=>x.key),['connection','post','profile']);
 assert.deepEqual(d.opportunities.map(x=>x.pending),[10,8,4]);
 assert.deepEqual(d.opportunities.map(x=>x.sharePct),[83.3,66.7,33.3]);
 assert.match(d.limitations,/no abandonos ni embudo cronológico/);
 assert.equal(result.totals.firstPosts,4);
 assert.equal(result.totals.socialContacts,2);
});
test('per-user details or unrecognized source values are never sent in diagnostics',()=>{
 const rows=Array.from({length:10},(_,i)=>row({user_id:293+i,
  source_type:'secret-contact@example.net',has_social_contact:i<4}));
 const value=JSON.stringify(summarizeGrowth(rows,30));
 assert.ok(!value.includes('secret-contact@example.net'));
 assert.ok(!value.includes('user_id'));
 assert.ok(!value.includes('secret-contact'));
 assert.match(GROWTH_SQL,/WHERE u.is_admin=FALSE/);
 assert.doesNotMatch(GROWTH_SQL,/SELECT \*|password_hash|message_body|email/);
 assert.match(read('src/routes/admin-growth-v219.js'),/router\.use\(requireAdmin\)/);
});
test('admin UI is mobile-friendly, escaped, and never represents scores for small samples',async()=>{
 const start=admin.indexOf('function growthCenterRate('),
   end=admin.indexOf('function growthSourceTypeLabel(',start);
 assert.ok(start>=0&&end>start);
 const metrics={innerHTML:'',textContent:''},
  diagnosis={innerHTML:'',textContent:''},
  sources={innerHTML:'',textContent:''},
  guides={innerHTML:'',textContent:''},
  daily={innerHTML:'',textContent:''},
  note={textContent:''};
 const els={'#growthCenterMetrics':metrics,'#growthCenterDiagnosis':diagnosis,
  '#growthCenterSources':sources,'#growthCenterGuides':guides,
  '#growthCenterDaily':daily,'#growthCenterMethod':note,'#growthCenterDays':{value:'30'}};
 const requests=[];
 const ctx={Number,String,Math,encodeURIComponent,Date,
  $:key=>els[key]||null,esc:value=>String(value??'')
     .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  timeLabel:()=> '27/10/2026',growthSourceTypeLabel:s=>s,
  api:url=>new Promise(resolve=>requests.push({url,resolve}))};
 vm.runInNewContext(admin.slice(start,end)+'\nthis.growth=growthCenter;',ctx);
 const small=ctx.growth();requests[0].resolve({r:{ok:true},d:{
  totals:{signups:4},diagnosis:{sampleSufficient:false},sources:[],guides:[],daily:[]}});await small;
 assert.match(diagnosis.innerHTML,/Solo 4 altas/);
 assert.doesNotMatch(diagnosis.innerHTML,/growth-type-card/);
 const enough=ctx.growth();
 requests[1].resolve({r:{ok:true},d:{
  totals:{signups:12},
  diagnosis:{sampleSufficient:true,opportunities:[{
    label:'Sin post <script>alert(1)</script>',pending:8,sharePct:66.7,suggestion:'Revisar editor'}]},
  sources:[],guides:[],daily:[]}});await enough;
 assert.match(diagnosis.innerHTML,/8 de 12 cuentas/);
 assert.doesNotMatch(diagnosis.innerHTML,/<script>/);
 assert.match(diagnosis.innerHTML,/&lt;script&gt;/);
});
test('new diagnostics reuse the existing panel and do not create extra tracking or SQL',()=>{
 const html=read('public/admin.html'),route=read('src/routes/admin-growth-v219.js');
 assert.equal(html.split('id="growthCenterDiagnosis"').length-1,1);
 assert.match(html,/diagnosis=3\.3\.33/);
 assert.match(html,/Estados agregados actuales/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/growth-diagnosis-v3333\.test\.js/);
 assert.doesNotMatch(route,/sendBeacon|pixel|localStorage|message_body|password_hash/);
 assert.doesNotMatch(route,/router\.(?:post|patch|put|delete)\(/);
 assert.equal(summarizeGrowth([],7).privacy.individualUserData,false);
});
