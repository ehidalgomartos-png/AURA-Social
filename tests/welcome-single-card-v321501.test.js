'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/social.css'),'utf8');

function classes(...initial){
  const state=new Set(initial);
  return {state,add:val=>state.add(val),remove:val=>state.delete(val),
    contains:val=>state.has(val)};
}
function nodes(){
  const welcome={classList:classes('hidden'),dataset:{},setAttribute(){},removeAttribute(){}};
  const checklist={classList:classes('hidden'),dataset:{welcomeExpanded:'0'},open:false,
    scrollIntoView(){}};
  const text=()=>({textContent:'',dataset:{},classList:classes()});
  const map={'#homeWelcomeV32150':welcome,'#homeGrowthDetailsV3224':checklist,
    '#homeWelcomeTitleV32150':text(),'#homeWelcomeCopyV32150':text(),
    '#homeWelcomeActionV32150':text()};
  return {welcome,checklist,map,$:selector=>map[selector]||null};
}
function getFunction(startToken,endToken,sandbox){
  const start=source.indexOf(startToken),end=source.indexOf(endToken,start);
  assert.ok(start>0&&end>start,'Missing source block: '+startToken);
  return new Function(...Object.keys(sandbox),source.slice(start,end)+'\nreturn '+startToken.match(/function (\w+)/)[1]+';')(...Object.values(sandbox));
}
const data={firstWeek:true,welcome:{visible:true,nextStep:{id:'avatar',action:'profile'}}};

test('only one of welcome and collapsed growth checklist is visible',()=>{
  const n=nodes();
  const render=getFunction('function renderHomeWelcomeV32150(data){','async function saveWelcomePreferenceV32150(',{$:n.$,Set});
  render(data);
  assert.equal(n.welcome.classList.contains('hidden'),false);
  const panel={classList:classes('hidden')};
  const start=source.indexOf("  panel.classList.remove('hidden');\n  const homeGrowth=$('#homeGrowthDetailsV3224');");
  const end=source.indexOf("    const title=$('#homeGrowthHeadlineV3224');",start);
  assert.ok(start>0&&end>start);
  const apply=new Function('panel','$',source.slice(start,end)+String.fromCharCode(10)+'}');
  n.checklist.open=true;
  apply(panel,n.$);
  assert.equal(n.checklist.classList.contains('hidden'),true,'never show duplicate panel');
  assert.equal(n.checklist.open,false,'hide collapsed checklist while welcome visible');

  n.checklist.dataset.welcomeExpanded='1';
  render(data);
  assert.equal(n.welcome.classList.contains('hidden'),true);
  apply(panel,n.$);
  assert.equal(n.checklist.classList.contains('hidden'),false,'expanded checklist accessible');

  n.checklist.dataset.welcomeExpanded='0';
  render({welcome:{visible:false,nextStep:{id:'avatar',action:'profile'}}});
  apply(panel,n.$);
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false,'manual progress remains available');
});

test('Ver mis pasos opens the original panel and hides the invitation',()=>{
  const n=nodes(),handlers={};
  n.map['#homeWelcomeMoreV32150']={addEventListener:(type,fn)=>{handlers[type]=fn;}};
  n.welcome.classList.remove('hidden');
  const start=source.indexOf("$('#homeWelcomeMoreV32150')?.addEventListener('click',()=>{");
  const end=source.indexOf('async function loadGrowthPanel()',start);
  assert.ok(start>0&&end>start);
  new Function('$',source.slice(start,end))(n.$);
  assert.equal(typeof handlers.click,'function');
  handlers.click();
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false);
  assert.equal(n.checklist.open,true);
  assert.equal(n.checklist.dataset.welcomeExpanded,'1');
});

test('Ahora no and No mostrar preserve manual access to original checklist',async()=>{
  const n=nodes();
  n.welcome.classList.remove('hidden');
  const save=getFunction('async function saveWelcomePreferenceV32150(choice){',"$('#homeWelcomeMoreV32150')?.addEventListener('click',()=>{",{
    $:n.$,
    api:async(path,options)=>{
      assert.equal(path,'/api/growth/welcome/preference');
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).choice,'later');
      return {r:{ok:true}};
    },
    toast:()=>assert.fail('No toast on successful save')
  });
  await save('later');
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false);
  assert.equal(n.checklist.open,false);
  assert.equal(n.checklist.dataset.welcomeExpanded,'0');
});

test('notification welcome navigation reveals detailed checklist even if banner was shown',()=>{
  const start=source.indexOf("  if(type==='system' && entityType==='welcome'){");
  const end=source.indexOf("  if(type==='system' && entityType==='community'",start);
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/showView\('feed'\)/);
  assert.match(block,/details\.dataset\.welcomeExpanded='1'/);
  assert.match(block,/\$\('#homeWelcomeV32150'\)\?\.classList\.add\('hidden'\)/);
  assert.match(block,/details\.classList\.remove\('hidden'\)/);
});

test('no CSS regression: global hidden class and mobile first CTA remain',()=>{
  assert.match(css,/\.hidden\{display:none!important\}/);
  assert.match(css,/#feedView \.home-welcome-v32150/);
  assert.match(html,/id="homeWelcomeMoreV32150"/);
  assert.match(html,/id="homeGrowthDetailsV3224"/);
  assert.match(html,/id="growthSteps"/);
});
,source.slice(start,end)+'\n}');
  n.checklist.open=true;
  apply(panel,n.$);
  assert.equal(n.checklist.classList.contains('hidden'),true,'never show duplicate panel');
  assert.equal(n.checklist.open,false,'hide collapsed checklist while welcome visible');

  n.checklist.dataset.welcomeExpanded='1';
  render(data);
  assert.equal(n.welcome.classList.contains('hidden'),true);
  apply(panel,n.$);
  assert.equal(n.checklist.classList.contains('hidden'),false,'expanded checklist accessible');

  n.checklist.dataset.welcomeExpanded='0';
  render({welcome:{visible:false,nextStep:{id:'avatar',action:'profile'}}});
  apply(panel,n.$);
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false,'manual progress remains available');
});

test('Ver mis pasos opens the original panel and hides the invitation',()=>{
  const n=nodes(),handlers={};
  n.map['#homeWelcomeMoreV32150']={addEventListener:(type,fn)=>{handlers[type]=fn;}};
  n.welcome.classList.remove('hidden');
  const start=source.indexOf("$('#homeWelcomeMoreV32150')?.addEventListener('click',()=>{");
  const end=source.indexOf('async function loadGrowthPanel()',start);
  assert.ok(start>0&&end>start);
  new Function('$',source.slice(start,end))(n.$);
  assert.equal(typeof handlers.click,'function');
  handlers.click();
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false);
  assert.equal(n.checklist.open,true);
  assert.equal(n.checklist.dataset.welcomeExpanded,'1');
});

test('Ahora no and No mostrar preserve manual access to original checklist',async()=>{
  const n=nodes();
  n.welcome.classList.remove('hidden');
  const save=getFunction('async function saveWelcomePreferenceV32150(choice){',"$('#homeWelcomeMoreV32150')?.addEventListener('click',()=>{",{
    $:n.$,
    api:async(path,options)=>{
      assert.equal(path,'/api/growth/welcome/preference');
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).choice,'later');
      return {r:{ok:true}};
    },
    toast:()=>assert.fail('No toast on successful save')
  });
  await save('later');
  assert.equal(n.welcome.classList.contains('hidden'),true);
  assert.equal(n.checklist.classList.contains('hidden'),false);
  assert.equal(n.checklist.open,false);
  assert.equal(n.checklist.dataset.welcomeExpanded,'0');
});

test('notification welcome navigation reveals detailed checklist even if banner was shown',()=>{
  const start=source.indexOf("  if(type==='system' && entityType==='welcome'){");
  const end=source.indexOf("  if(type==='system' && entityType==='community'",start);
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/showView\('feed'\)/);
  assert.match(block,/details\.dataset\.welcomeExpanded='1'/);
  assert.match(block,/\$\('#homeWelcomeV32150'\)\?\.classList\.add\('hidden'\)/);
  assert.match(block,/details\.classList\.remove\('hidden'\)/);
});

test('no CSS regression: global hidden class and mobile first CTA remain',()=>{
  assert.match(css,/\.hidden\{display:none!important\}/);
  assert.match(css,/#feedView \.home-welcome-v32150/);
  assert.match(html,/id="homeWelcomeMoreV32150"/);
  assert.match(html,/id="homeGrowthDetailsV3224"/);
  assert.match(html,/id="growthSteps"/);
});
