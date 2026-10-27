'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/social.js'),html=read('public/app.html'),css=read('public/social.css');
function harness({meId=7,eligible='7',storageBlocked=false}={}){
 const storage=new Map(),calls=[];
 const field={value:'',dispatchEvent:event=>calls.push(event.type)};
 const status={textContent:''};
 const ctx={
   me:{id:meId},firstPostHelperUserV32158:eligible,
   Date,JSON,Number,String,Boolean,Event:class{constructor(type){this.type=type}},
   sessionStorage:{
     getItem:key=>{if(storageBlocked)throw Error('storage blocked');return storage.get(key)||null;},
     setItem:(key,val)=>{if(storageBlocked)throw Error('storage blocked');storage.set(key,val);},
     removeItem:key=>{if(storageBlocked)throw Error('storage blocked');storage.delete(key);}
   },
   $:key=>({
     '#createForm textarea[name="caption"]':field,
     '#firstPostLocalTextStatusV3318':status
   })[key]||null
 };
 const start=js.indexOf('// V3.3.18 — Explicit, text-only first-post note.');
 const end=js.indexOf('function renderFirstPostHelperV32158()',start);
 assert.ok(start>0&&end>start);
 vm.runInNewContext(js.slice(start,end)+
  '\nthis.action=firstPostTextActionV3318;this.key=firstPostTextKeyV3318;this.read=readFirstPostTextV3318;this.clear=clearFirstPostTextV3318;',ctx);
 return {ctx,field,status,calls,storage};
}
test('text is saved only by an explicit click, not from typing or loading',()=>{
 const h=harness();
 assert.equal(h.storage.size,0);
 assert.equal(h.ctx.key(),'rl:first-post-text:v3318:7');
 h.field.value='Mi primera idea sobre Valencia';
 assert.equal(h.storage.size,0);
 h.ctx.action('save');
 assert.equal(h.storage.size,1);
 assert.equal(h.ctx.read().text,'Mi primera idea sobre Valencia');
 assert.match(h.status.textContent,/No se ha publicado/);
 assert.equal(h.calls.length,0);
});
test('restore never overwrites current content and emits input only when blank',()=>{
 const h=harness();
 h.field.value='Una idea auténtica';
 h.ctx.action('save');
 h.field.value='Texto que ya escribí';
 h.ctx.action('restore');
 assert.equal(h.field.value,'Texto que ya escribí');
 assert.match(h.status.textContent,/No se ha sustituido/);
 assert.equal(h.calls.length,0);
 h.field.value='';
 h.ctx.action('restore');
 assert.equal(h.field.value,'Una idea auténtica');
 assert.deepEqual(h.calls,['input']);
});
test('different user cannot access another account draft and no data is sent',()=>{
 const h=harness();
 h.field.value='Mi texto privado';h.ctx.action('save');
 h.ctx.me.id=8;
 assert.equal(h.ctx.read(),null);
 assert.equal(h.ctx.key(),null);
 h.ctx.action('restore');
 assert.equal(h.field.value,'Mi texto privado');
 h.ctx.me.id=7;
 h.ctx.firstPostHelperUserV32158=null;
 assert.equal(h.ctx.read(),null);
 assert.equal(h.ctx.key(),null);
 assert.doesNotMatch(js.slice(js.indexOf('// V3.3.18 — Explicit'),js.indexOf('function renderFirstPostHelperV32158')),/\bapi\(|fetch\(|localStorage|sendEmail|requestSubmit|\.submit\(/);
});
test('delete removes stored copy but keeps current editor text',()=>{
 const h=harness();
 h.field.value='Mi texto';h.ctx.action('save');
 h.ctx.action('delete');
 assert.equal(h.storage.size,0);
 assert.equal(h.field.value,'Mi texto');
 h.field.value='';
 h.ctx.action('restore');
 assert.match(h.status.textContent,/No tienes ningún texto/);
});
test('expired or corrupted drafts are discarded; unavailable storage fails gently',()=>{
 const h=harness();
 h.storage.set('rl:first-post-text:v3318:7','{invalid}');
 assert.equal(h.ctx.read(),null);
 h.storage.set('rl:first-post-text:v3318:7',JSON.stringify({version:1,text:'Antiguo',savedAt:Date.now()-8*86400000}));
 assert.equal(h.ctx.read(),null);
 assert.equal(h.storage.size,0);
 const blocked=harness({storageBlocked:true});
 blocked.field.value='Texto privado';
 blocked.ctx.action('save');
 assert.match(blocked.status.textContent,/No se pudo guardar/);
 blocked.ctx.action('restore');
 assert.match(blocked.status.textContent,/No tienes ningún texto/);
});
test('UI remains in optional first post helper, no new Home card and no server drafts',()=>{
 const helper=html.slice(html.indexOf('id="firstPostHelperV32158"'),html.indexOf('id="marketShareComposerHintV3269"'));
 for(const verb of ['save','restore','delete'])assert.match(helper,new RegExp('data-first-post-local-v3318="'+verb+'"'));
 assert.match(helper,/Solo guarda el texto en esta pestaña/);
 assert.match(helper,/type="button"/);
 assert.match(helper,/firstPostLocalTextStatusV3318/);
 assert.match(css,/#modal \.first-post-local-text-v3318/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(js,/if\(publishMode==='now' && kind==='post'\)clearFirstPostTextV3318\(\);/);
 const success=js.indexOf('if(publishMode===\'now\' && kind===\'post\')clearFirstPostTextV3318();');
 const response=js.lastIndexOf('if (!r.ok) throw new Error(',success);
 assert.ok(response>=0&&response<success);
 assert.doesNotMatch(helper,/data-publish-mode="draft"|type="submit"|required/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/first-post-local-draft-v3318\.test\.js/);
});
