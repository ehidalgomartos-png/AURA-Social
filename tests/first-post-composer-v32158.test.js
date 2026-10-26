'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function harness(){
  const listeners={};
  let visible=false;
  const helper={hidden:true,classList:{toggle(name,value){if(name==='hidden')visible=!value}},
    addEventListener:(type,fn)=>{listeners[type]=fn;}};
  const modal={dataset:{composerMode:'post'}};
  const status={textContent:''},calls=[];
  const field={value:'',dispatchEvent:evt=>calls.push(evt.type)};
  const ctx={
    Object,String,me:{id:7},firstPostHelperUserV32158:'7',
    FIRST_POST_IDEAS_V32151:{presentacion:'Mi presentación',opinion:'Mi opinión',historia:'Esta foto'},
    Event:class {constructor(type){this.type=type}},
    '$':sel=>({
      '#firstPostHelperV32158':helper,
      '#modal':modal,
      '#createForm textarea[name="caption"]':field,
      '#firstPostHelperStatusV32158':status
    })[sel]||null
  };
  const from=js.indexOf('function renderFirstPostHelperV32158(');
  const to=js.indexOf("async function openModal(mode='post')",from);
  assert.ok(from>0&&to>from);
  vm.runInNewContext(js.slice(from,to)+'\nthis.render=renderFirstPostHelperV32158;',ctx);
  const choose=id=>listeners.click({target:{closest:()=>({dataset:{firstPostHelperV32158:id}})}});
  return {ctx,helper,modal,status,field,calls,choose,render:()=>ctx.render(),visible:()=>visible};
}
test('shown only when the authenticated account genuinely has no published post and chooses Publicación',()=>{
  const h=harness();
  assert.equal(h.render(),true);assert.equal(h.helper.hidden,false);
  h.modal.dataset.composerMode='story';assert.equal(h.render(),false);
  h.modal.dataset.composerMode='reel';assert.equal(h.render(),false);
  h.modal.dataset.composerMode='post';h.ctx.firstPostHelperUserV32158=null;
  assert.equal(h.render(),false);
  h.ctx.firstPostHelperUserV32158='8';assert.equal(h.render(),false);
  h.ctx.firstPostHelperUserV32158='7';assert.equal(h.render(),true);
});
test('ideas are editable, never overwrite a draft or silently publish',()=>{
  const h=harness();
  h.choose('presentacion');assert.equal(h.field.value,'Mi presentación');
  assert.deepEqual(h.calls,['input']);
  h.choose('opinion');assert.equal(h.field.value,'Mi presentación');
  assert.match(h.status.textContent,/a salvo/);
  h.field.value='';h.choose('historia');assert.equal(h.field.value,'Esta foto');
  h.modal.dataset.composerMode='story';h.field.value='';h.choose('opinion');
  assert.equal(h.field.value,'');
  h.modal.dataset.composerMode='post';h.choose('nonexistent');
  assert.equal(h.field.value,'');
});
test('eligibility comes only from genuine server post step, never from guesses or existing audiences',()=>{
  const start=js.indexOf('async function loadGrowthPanel()');
  const end=js.indexOf('function ',start+100);
  const block=js.slice(start,start+3300);
  assert.match(block,/api\('\/api\/growth\/me'\)/);
  assert.match(block,/d\.steps\.some\(step=>step\?\.id==='post'&&step\.done===false\)/);
  assert.match(block,/String\(me\.id\) : null/);
  assert.match(block,/renderFirstPostHelperV32158\(\)/);
  const select=js.slice(js.indexOf('function selectComposerModeV3227('),js.indexOf("all('[data-composer-tab]').forEach(tab=>",js.indexOf('function selectComposerModeV3227(')));
  assert.match(select,/renderFirstPostHelperV32158\(\)/);
});
test('first-post ideas live inside the existing composer and cannot force posts',()=>{
  const start=html.indexOf('id="createForm"'),end=html.indexOf('id="storyForm"',start);
  const form=html.slice(start,end);
  assert.equal((html.match(/id="firstPostHelperV32158"/g)||[]).length,1);
  assert.match(form,/id="firstPostHelperV32158"[^>]*hidden/);
  for(const action of ['presentacion','opinion','historia'])
    assert.match(form,new RegExp('data-first-post-helper-v32158="'+action+'"'));
  assert.match(form,/No se publica nada hasta que pulses/);
  assert.match(css,/#modal \.first-post-helper-v32158\.hidden/);
  assert.match(css,/min-height:44px/);
  const code=js.slice(js.indexOf('function renderFirstPostHelperV32158('),js.indexOf("async function openModal(mode='post')",js.indexOf('function renderFirstPostHelperV32158(')));
  assert.doesNotMatch(code,/api\(|requestSubmit\(|\.submit\(|localStorage|sessionStorage|POST|setTimeout/);
  assert.match(read('.github/workflows/validate-js.yml'),/tests\/first-post-composer-v32158\.test\.js/);
});
