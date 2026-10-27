'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const admin=read('public/admin.js'),html=read('public/admin.html'),css=read('public/admin.css');
const growth=read('src/routes/admin-growth-v219.js');
const {summarizeGrowth}=require('../src/routes/admin-growth-v219');
function harness(){
 const a=admin.indexOf('function growthCenterRate(');
 const b=admin.indexOf('function growthSourceTypeLabel(',a);
 assert.ok(a>=0&&b>a);
 const root={value:'7',addEventListener(){}},metrics={innerHTML:'',textContent:''},sources={innerHTML:'',textContent:''};
 const guides={innerHTML:'',textContent:''},daily={innerHTML:'',textContent:''},note={textContent:''};
 const els={
  '#growthCenterDays':root,
  '#growthCenterMetrics':metrics,
  '#growthCenterSources':sources,
  '#growthCenterGuides':guides,
  '#growthCenterDaily':daily,
  '#growthCenterMethod':note
 };
 const requests=[];
 const ctx={Number,String,Math,encodeURIComponent,
  $:sel=>els[sel]||null,esc:s=>String(s??''),
  timeLabel:()=> '27/10/2026 13:00',
  growthSourceTypeLabel:s=>String(s),
  api:url=>new Promise(resolve=>requests.push({url,resolve}))};
 vm.runInNewContext(admin.slice(a,b)+'\nthis.growth=growthCenter;this.sample=growthCenterSampleV3324;',ctx);
 return {ctx,requests,root,metrics,sources,guides,daily,note};
}
function snapshot(signups=1,eligible=1){
 return {generatedAt:'2026-10-27T12:00:00.000Z',
  totals:{signups,eligibleWeek:eligible,firstWeek:1,eligibleD1:eligible,activeD1:1,
   eligibleD7:0,activeD7:0,attributedSignups:0,
   d1RatePct:eligible?100/eligible:null,d7RatePct:null,
   firstWeekRatePct:eligible?100/eligible:null},
  sources:[],guides:[],daily:[]};
}
test('cohort counts show eligible denominators instead of unqualified 100%',()=>{
 const h=harness();
 assert.equal(h.ctx.sample(1,1),'1 de 1 cuentas elegibles · muestra pequeña');
 assert.equal(h.ctx.sample(2,12),'2 de 12 cuentas elegibles');
 assert.equal(h.ctx.sample(0,0),'Sin muestra elegible');
 const original=summarizeGrowth([],30);
 assert.equal(original.totals.d1RatePct,null);
 assert.equal(original.totals.d7RatePct,null);
});
test('latest period wins when older request returns afterward',async()=>{
 const h=harness(),first=h.ctx.growth();
 assert.equal(h.requests[0].url,'/api/admin/growth-center?days=7');
 h.root.value='30';
 const second=h.ctx.growth();
 assert.equal(h.requests[1].url,'/api/admin/growth-center?days=30');
 h.requests[1].resolve({r:{ok:true},d:snapshot(6,2)});
 await second;
 assert.match(h.metrics.innerHTML,/Registros · 30 días/);
 assert.match(h.metrics.innerHTML,/1 de 2 cuentas elegibles/);
 assert.match(h.metrics.innerHTML,/Sin muestra elegible/);
 assert.match(h.note.textContent,/Datos calculados: 27\/10\/2026 13:00/);
 h.requests[0].resolve({r:{ok:true},d:snapshot(99,1)});
 await first;
 assert.match(h.metrics.innerHTML,/Registros · 30 días/);
 assert.doesNotMatch(h.metrics.innerHTML,/Registros · 7 días|>99</);
});
test('stale failure does not replace latest good data, but current failure is displayed',async()=>{
 const h=harness(),first=h.ctx.growth();
 h.root.value='90';
 const second=h.ctx.growth();
 h.requests[1].resolve({r:{ok:true},d:snapshot(7,2)});await second;
 h.requests[0].resolve({r:{ok:false},d:{error:'offline'}});await first;
 assert.match(h.metrics.innerHTML,/Registros · 90 días/);
 assert.doesNotMatch(h.metrics.textContent,/No se pudieron/);
 const failing=h.ctx.growth();
 h.requests[2].resolve({r:{ok:false},d:{error:'offline'}});await failing;
 assert.match(h.metrics.textContent,/No se pudieron recuperar las métricas/);
});
test('existing privacy-safe growth SQL and admin-only routes remain unchanged',()=>{
 assert.match(growth,/router\.use\(requireAdmin\)/);
 assert.match(growth,/res\.setHeader\('Cache-Control','no-store'\)/);
 assert.match(growth,/new Date\(now\(\)\)\.toISOString\(\)/);
 assert.match(growth,/cache\.set\(days,\{timestamp:now\(\),result\}\)/);
 assert.match(growth,/FROM signups s LEFT JOIN LATERAL/);
 assert.doesNotMatch(growth,/router\.(?:post|put|patch|delete)\(/);
 assert.doesNotMatch(growth,/sendBeacon|localStorage|pixel|email_address|message_body|password_hash/);
 assert.deepEqual(summarizeGrowth([],30).privacy,
  {adminOnly:true,individualUserData:false,externalTracking:false,retrospectiveAttribution:false});
});
test('existing mobile growth center stays in place, with versioned assets and accessible sample',()=>{
 assert.equal((html.match(/id="growthCenterMetrics"/g)||[]).length,1);
 assert.match(html,/id="growthCenterDays"/);
 assert.match(html,/id="reloadGrowthCenter"/);
 assert.match(html,/admin\.js\?[^"]*growth=3\.3\.24/);
 assert.match(html,/admin\.css\?[^"]*growth=3\.3\.24/);
 assert.match(css,/\.growth-center-v219 \.growth-metric-sample-v3324/);
 assert.match(admin,/let growthCenterRequestSequenceV3324=0/);
 assert.match(admin,/if\(requestId!==growthCenterRequestSequenceV3324\)return/);
 assert.match(admin,/muestra pequeña/);
 assert.match(admin,/La gráfica recoge hasta 30 días/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/growth-stability-v3324\.test\.js/);
});
