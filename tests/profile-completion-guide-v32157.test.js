'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');

function harness(){
 const start=social.indexOf('function profileCompletionStateV32157(');
 const end=social.indexOf("$('#profileForm')?.addEventListener('input',renderProfileCompletionV32157)",start);
 assert.ok(start>0&&end>start);
 const status={textContent:''},labels={};
 const form={bio:{value:''}};
 let avatar={files:[]},selected=[];
 const root={};
 const ctx={
   String,Boolean,Number,Array,
   me:{avatar_url:null},
   all:()=>selected,
   '$':key=>{
     if(key==='#profileForm')return form;
     if(key==='#profileCompletionV32157')return root;
     if(key==='#profileCompletionStatusV32157')return status;
     if(key==='#avatarFile')return avatar;
     if(key.startsWith('#profileTip'))return labels[key]??(labels[key]={textContent:''});
     return null;
   }
 };
 vm.runInNewContext(social.slice(start,end)+'\nthis.progress=profileCompletionStateV32157;this.render=renderProfileCompletionV32157;',ctx);
 return {ctx,status,form,avatar,labels,setInterests:x=>{selected=x}};
}
test('status is derived from real edits, not simulated completion',()=>{
 const h=harness();h.ctx.render();
 assert.equal(h.status.textContent,'0 de 3 apartados preparados · Completa solo los que prefieras.');
 h.form.bio.value='Me encanta la fotografía';h.ctx.render();
 assert.match(h.status.textContent,/1 de 3/);
 h.avatar.files=[{name:'foto.jpg'}];h.ctx.render();
 assert.match(h.status.textContent,/2 de 3/);
 h.setInterests([{value:'fotografía'}]);h.ctx.render();
 assert.match(h.status.textContent,/¡Todo listo!/);
 h.form.bio.value='  ';h.ctx.render();
 assert.match(h.status.textContent,/2 de 3/);
});
test('the guide recognizes an existing avatar and never requires a new upload',()=>{
 const h=harness();h.ctx.me.avatar_url='/media/existing.png';h.ctx.render();
 assert.match(h.status.textContent,/1 de 3/);
 assert.equal(h.labels['#profileTipAvatarV32157'].textContent,'✓ Foto');
 assert.equal(h.labels['#profileTipBioV32157'].textContent,'○ Presentación');
 assert.equal(h.labels['#profileTipInterestsV32157'].textContent,'○ Intereses');
});
test('optional guide appears only within the editor, without new Home banner',()=>{
 const modal=html.slice(html.indexOf('id="profileModal"'),html.indexOf('id="creatorModal"'));
 assert.match(modal,/id="profileCompletionV32157"/);
 assert.match(modal,/id="profileCompletionStatusV32157" role="status" aria-live="polite"/);
 for(const kind of ['avatar','bio','interests'])assert.match(modal,new RegExp('data-profile-tip-v32157="'+kind+'"'));
 assert.equal((html.match(/id="profileCompletionV32157"/g)||[]).length,1);
 assert.match(modal,/Todo es opcional/);
 assert.match(css,/#profileModal \.profile-completion-v32157/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:360px\)/);
});
test('recalculation only on edit and no posting, tracking or automatic notifications',()=>{
 const start=social.indexOf('function profileCompletionStateV32157(');
 const end=social.indexOf('async function openProfileModal()',start);
 const block=social.slice(start,end);
 assert.match(block,/addEventListener\('input',renderProfileCompletionV32157\)/);
 assert.match(block,/addEventListener\('change',renderProfileCompletionV32157\)/);
 assert.match(block,/\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(block,/localStorage|sessionStorage|\bapi\(|sendEmail|requestSubmit|POST/);
 assert.match(social,/renderProfileCompletionV32157\(\);\s*\$\('#profileModal'\)\.classList\.remove\('hidden'\)/);
 assert.match(social,/await api\('\/api\/profiles\/me\/profile', \{ method: 'PATCH'/);
 assert.match(read('.github/workflows/validate-js.yml'),/profile-completion-guide-v32157\.test\.js/);
});
