'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function profile(){
  const a=js.indexOf('function profileCompletionStateV32157(');
  const b=js.indexOf('async function openProfileModal()',a);
  assert.ok(a>=0&&b>a);
  const listeners={},bio={value:'',events:[],dispatchEvent(e){this.events.push(e.type);},focus(){this.focused=true;}};
  const root={addEventListener:(name,fn)=>listeners[name]=fn};
  const bioIdea={hidden:true},status={textContent:''},avatar={files:[]};
  const form={bio},selected=[];
  const map={
    '#profileForm':form,'#profileCompletionV32157':root,
    '#profileCompletionStatusV32157':status,'#profileBioIdeaV3320':bioIdea,
    '#avatarFile':avatar
  };
  const ctx={String,Boolean,Number,Array,Event:class{constructor(type){this.type=type}},
    me:{avatar_url:null},$:key=>map[key]||null,
    all:()=>selected};
  vm.runInNewContext(js.slice(a,b)+'\nthis.make=profileBioIdeaV3320;this.render=renderProfileCompletionV32157;',ctx);
  function choose(){listeners.click({target:{closest:selector=>selector==='[data-profile-bio-idea-v3320]'?{dataset:{}}:null}});}
  return {ctx,bio,status,bioIdea,selected,render:ctx.render,choose};
}
test('bio suggestion needs user-selected interests and never auto saves',()=>{
  const h=profile();
  h.render();assert.equal(h.bioIdea.hidden,true);
  assert.equal(h.ctx.make([]),'');
  h.selected.push({value:'fotografía'},{value:'música'});
  h.render();assert.equal(h.bioIdea.hidden,false);
  assert.equal(h.bio.value,'');
  h.choose();assert.match(h.bio.value,/fotografía y música/);
  assert.deepEqual(h.bio.events,['input']);
  assert.equal(h.bioIdea.hidden,true);
  assert.match(h.status.textContent,/1 de 3/);
});
test('typed bio and empty interests remain untouched',()=>{
  const h=profile();h.selected.push({value:'cine'});
  h.bio.value='Texto propio';h.render();assert.equal(h.bioIdea.hidden,true);
  h.choose();assert.equal(h.bio.value,'Texto propio');
  h.bio.value='';h.selected.splice(0);
  h.choose();assert.equal(h.bio.value,'');
  assert.equal(h.bio.events.length,0);
});
function composer({interests=['música'],eligible='7'}={}){
 const a=js.indexOf('function firstPostInterestIdeaV3320('),b=js.indexOf("async function openModal(mode='post')",a);
 assert.ok(a>=0&&b>a);
 const listeners={},status={textContent:''},ideaButton={hidden:true},
  text={value:'',events:[],dispatchEvent(e){this.events.push(e.type);}};
 const helper={hidden:true,classList:{toggle(){}},addEventListener:(type,fn)=>listeners[type]=fn};
 const modal={dataset:{composerMode:'post'}};
 const map={'#firstPostHelperV32158':helper,'#modal':modal,
  '#firstPostInterestIdeaV3320':ideaButton,'#createForm textarea[name="caption"]':text,
  '#firstPostHelperStatusV32158':status};
 const ctx={String,Array,Object,Boolean,Event:class{constructor(type){this.type=type}},
  me:{id:7,interests},firstPostHelperUserV32158:eligible,
  FIRST_POST_IDEAS_V32151:{presentacion:'Me presento',opinion:'Opino',historia:'Foto'},
  $:selector=>map[selector]||null};
 vm.runInNewContext(js.slice(a,b)+'\nthis.render=renderFirstPostHelperV32158;this.suggest=firstPostInterestIdeaV3320;',ctx);
 const click=action=>listeners.click({target:{closest:selector=>selector==='[data-first-post-helper-v32158]'?{dataset:{firstPostHelperV32158:action}}:null}});
 return {ctx,helper,modal,ideaButton,text,status,click};
}
test('interest first-post idea requires real server-confirmed first-post eligibility',()=>{
 const h=composer();assert.equal(h.ctx.render(),true);assert.equal(h.ideaButton.hidden,false);
 h.click('intereses');
 assert.match(h.text.value,/música/);assert.deepEqual(h.text.events,['input']);
 assert.match(h.status.textContent,/comprueba la audiencia/);
 h.text.value='Mi borrador';h.click('intereses');assert.equal(h.text.value,'Mi borrador');
 const notEligible=composer({eligible:null});
 assert.equal(notEligible.ctx.render(),false);
 assert.equal(notEligible.ideaButton.hidden,true);
 notEligible.click('intereses');assert.equal(notEligible.text.value,'');
});
test('no interests, no suggestion; never invent interests for anyone',()=>{
 const h=composer({interests:[]});
 assert.equal(h.ctx.render(),true);assert.equal(h.ideaButton.hidden,true);
 h.click('intereses');assert.equal(h.text.value,'');
 assert.equal(h.ctx.suggest([]),'');
});
test('both options are inside existing editors, mobile friendly, with no automatic writes',()=>{
 assert.match(html,/id="profileBioIdeaV3320"[^>]*hidden/);
 assert.match(html,/id="firstPostInterestIdeaV3320"[^>]*hidden/);
 assert.equal((html.match(/id="profileBioIdeaV3320"/g)||[]).length,1);
 assert.equal((html.match(/id="firstPostInterestIdeaV3320"/g)||[]).length,1);
 assert.match(css,/#profileModal \.profile-bio-idea-v3320\[hidden\]/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(html,/social\.js\?[^"]*profile-ideas=3\.3\.20/);
 const section=js.slice(js.indexOf('function profileBioIdeaV3320('),js.indexOf('async function openProfileModal()'));
 const composer=js.slice(js.indexOf('function firstPostInterestIdeaV3320('),js.indexOf("async function openModal(mode='post')"));
 for(const code of [section,composer]){
  assert.doesNotMatch(code,/\bapi\(|fetch\(|sessionStorage|localStorage|\.submit\(|requestSubmit\(|sendEmail|method:\s*['"]POST['"]/);
 }
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/optional-profile-first-post-v3320\.test\.js/);
});
