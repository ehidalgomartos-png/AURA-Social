'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {nextWelcomeStep,welcomeEligibility}=require('../src/services/welcome-v32150');
const social=read('public/social.js'),html=read('public/app.html'),growth=read('src/routes/growth.js');
const steps=[
  {id:'avatar',action:'profile',done:false},{id:'profile',action:'profile',done:false},
  {id:'follow',action:'explore',done:false},{id:'community',action:'communities',done:false},
  {id:'post',action:'create',done:false},{id:'interact',action:'feed',done:false}
];
test('first post is recommended without asking for optional avatar or bio first',()=>{
  assert.equal(nextWelcomeStep(steps).id,'post');
  assert.equal(nextWelcomeStep(steps.map(s=>({...s,done:s.id==='avatar'}))).id,'post');
  assert.equal(nextWelcomeStep(steps.map(s=>({...s,done:s.id==='post'}))).id,'avatar');
  assert.equal(nextWelcomeStep(steps.map(s=>({...s,done:true}))),null);
});
test('real published first post removes priority; ineligible or invalid actions remain excluded',()=>{
  const user={created_at:new Date().toISOString(),status:'active',is_admin:false,post_count:0};
  assert.equal(welcomeEligibility(user,steps),true);
  assert.equal(welcomeEligibility({...user,is_admin:true},steps),false);
  assert.equal(nextWelcomeStep([{id:'post',action:'javascript:alert(1)',done:false}]),null);
});
test('existing single welcome points to editor, not to an automatic publish action',()=>{
  const start=social.indexOf('function renderHomeWelcomeV32150(data){');
  const end=social.indexOf('async function saveWelcomePreferenceV32150(',start);
  assert.ok(start>=0&&end>start);
  const nodes={};
  const make=()=>({dataset:{},textContent:'',classList:{add(){},remove(){}}});
  for(const id of ['homeWelcomeV32150','homeWelcomeTitleV32150','homeWelcomeCopyV32150','homeWelcomeActionV32150'])nodes['#'+id]=make();
  const context={$:key=>nodes[key]||null,Set};
  vm.runInNewContext(social.slice(start,end)+'\nthis.render=renderHomeWelcomeV32150;',context);
  context.render({firstWeek:true,welcome:{visible:true,nextStep:{id:'post',action:'create'}}});
  assert.equal(nodes['#homeWelcomeActionV32150'].dataset.growthAction,'create');
  assert.equal(nodes['#homeWelcomeActionV32150'].textContent,'Escribir mi post');
  assert.match(nodes['#homeWelcomeCopyV32150'].textContent,/sin terminar antes tu perfil/);
  assert.equal((html.match(/id="homeWelcomeV32150"/g)||[]).length,1);
});
test('action awaits existing post editor and preserves optional welcome preferences',()=>{
  const start=social.indexOf('async function handleGrowthAction(action) {');
  const end=social.indexOf('async function loadHomeSuggestions()',start);
  assert.ok(start>=0&&end>start);
  const events=[];
  const ctx={openModal:async mode=>{events.push('open:'+mode);},showView:()=>{},setTimeout:()=>{},loadFeed:async()=>{},$:()=>null};
  vm.runInNewContext(social.slice(start,end)+'\nthis.act=handleGrowthAction;',ctx);
  return ctx.act('create').then(()=>{
    assert.deepEqual(events,['open:post']);
    assert.match(social,/await saveWelcomePreferenceV32150\(welcomePreference\.dataset\.welcomePreference\)/);
    assert.match(growth,/router\.post\('\/welcome\/preference',requireAuth/);
    assert.doesNotMatch(social.slice(start,end),/submit\(|requestSubmit\(|\/api\/posts/);
  });
});
test('no extra home card, no new tracking, no behavioral deception',()=>{
  assert.equal((html.match(/id="homeGrowthDetailsV3224"/g)||[]).length,1);
  assert.match(social,/if\(nextRoot\)/);
  assert.doesNotMatch(read('src/services/welcome-v32150.js'),/INSERT INTO|autoPost|email|sendPush/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/first-post-priority-v332\.test\.js/);
});
