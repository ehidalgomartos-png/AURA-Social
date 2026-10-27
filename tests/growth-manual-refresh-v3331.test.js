'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {reuseGrowthSnapshotV3331}=require('../src/routes/admin-growth-v219');
const admin=read('public/admin.js');
test('normal use retains one-minute cache; manual update bypasses it after a 15-second minimum',()=>{
 const entry={timestamp:100000,result:{totals:{signups:3}}};
 assert.equal(reuseGrowthSnapshotV3331(entry,100500,false),true);
 assert.equal(reuseGrowthSnapshotV3331(entry,100500,true),true,'no repeat query after immediate double click');
 assert.equal(reuseGrowthSnapshotV3331(entry,116000,true),false,'manual request can refresh after cooldown');
 assert.equal(reuseGrowthSnapshotV3331(entry,116000,false),true,'automatic view keeps existing one-minute budget');
 assert.equal(reuseGrowthSnapshotV3331(entry,161000,false),false);
 assert.equal(reuseGrowthSnapshotV3331({timestamp:0,promise:Promise.resolve()},161000,false),false);
 assert.equal(reuseGrowthSnapshotV3331(undefined,161000,true),false);
 assert.equal(reuseGrowthSnapshotV3331(entry,99000,true),false,'future-dated data cannot be reused');
});
test('only the Refresh button issues fresh=1; normal period selection stays cached',async()=>{
 const a=admin.indexOf('function growthCenterRate('),b=admin.indexOf('function growthSourceTypeLabel(',a);
 assert.ok(a>=0&&b>a);
 const requests=[],hooks={},roots={};
 for(const key of ['#growthCenterMetrics','#growthCenterSources','#growthCenterGuides','#growthCenterDaily','#growthCenterMethod']){
  roots[key]={textContent:'',innerHTML:''};
 }
 roots['#growthCenterDays']={value:'30',addEventListener:(name,fn)=>{hooks.change=fn;}};
 roots['#reloadGrowthCenter']={addEventListener:(name,fn)=>{hooks.click=fn;}};
 const ctx={Number,String,Math,encodeURIComponent,
  $:q=>roots[q]||null,esc:String,timeLabel:()=> '27/10/2026',
  growthSourceTypeLabel:()=>'',api:url=>new Promise(resolve=>requests.push({url,resolve}))};
 vm.runInNewContext(admin.slice(a,b)+'\nthis.growth=growthCenter;',ctx);
 const initial=ctx.growth();assert.equal(requests[0].url,'/api/admin/growth-center?days=30');
 requests[0].resolve({r:{ok:false},d:{}});await initial;
 hooks.click();assert.equal(requests[1].url,'/api/admin/growth-center?days=30&fresh=1');
 requests[1].resolve({r:{ok:false},d:{}});for(let i=0;i<5;i++)await Promise.resolve();
 roots['#growthCenterDays'].value='7';hooks.change();
 assert.equal(requests[2].url,'/api/admin/growth-center?days=7');
 requests[2].resolve({r:{ok:false},d:{}});for(let i=0;i<5;i++)await Promise.resolve();
});
test('aggregate-only GET remains admin authenticated and avoids tracking',()=>{
 const route=read('src/routes/admin-growth-v219.js');
 assert.match(route,/router\.use\(requireAdmin\)/);
 assert.match(route,/res\.setHeader\('Cache-Control','no-store'\)/);
 assert.match(route,/req\.query\.fresh==='1'/);
 assert.match(route,/if\(current\?\.promise\)return res\.json\(await current\.promise\)/);
 assert.match(route,/reuseGrowthSnapshotV3331\(current,now\(\),fresh\)/);
 assert.doesNotMatch(route,/router\.(post|patch|put|delete)\(|sendBeacon|localStorage|IP_ADDRESS|message_body/);
 assert.equal(read('public/admin.html').split('fresh=3.3.31').length-1,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/growth-manual-refresh-v3331\.test\.js/);
});
