'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js'),css=read('public/social.css'),html=read('public/app.html');
const start=social.indexOf('const FIRST_POST_IDEAS_V32151=');
const end=social.indexOf('function growthStepHTML(step) {',start);
assert.ok(start>0&&end>start,'first post helpers present');

function setup(initial=''){
 const calls=[],dispatches=[];
 const field={value:initial,focus(){calls.push('focus')},
   dispatchEvent:e=>dispatches.push(e.type)};
 const ctx={
   $:selector=>selector==='#createForm textarea[name="caption"]'?field:null,
   openModal:async mode=>{calls.push('modal:'+mode);},
   Event:class {constructor(type){this.type=type;}},
   Object,Array,Set
 };
 vm.runInNewContext(social.slice(start,end)+
 '\nthis.select=chooseParticipationNextV32151;'+
 'this.open=openFirstPostIdeaV32151;this.ideaHtml=firstPostIdeasHTMLV32151;',ctx);
 return {ctx,field,calls,dispatches};
}
const steps=[
 {id:'avatar',done:true,action:'profile'},
 {id:'profile',done:true,action:'profile'},
 {id:'follow',done:false,action:'explore'},
 {id:'community',done:false,action:'communities'},
 {id:'post',done:false,action:'create'},
 {id:'interact',done:false,action:'feed'}
];

test('primer post tiene prioridad sobre seguimiento, cuando perfil ya está preparado',()=>{
 const a=setup();
 assert.equal(a.ctx.select(steps,{id:'post',action:'create'},steps[2]).id,'post');
 assert.equal(a.ctx.select(steps,{id:'post',action:'admin'},steps[2]).id,'follow','no acepta acciones falsas');
 assert.equal(a.ctx.select(steps,{id:'avatar',action:'profile'},steps[2]).id,'follow','no recomienda pasos completados');
 assert.equal(a.ctx.select(steps.map(s=>({...s,done:true})),null,null),null);
});

test('las tres ideas muestran solo borradores editables, nunca autopublicaciones',()=>{
 const a=setup();
 const html=a.ctx.ideaHtml();
 for(const slug of ['presentacion','opinion','historia']){
   assert.match(html,new RegExp('data-first-post-idea-v32151="'+slug+'"'));
 }
 assert.match(html,/El texto es solo una propuesta/);
 assert.doesNotMatch(html,/data-action="publish"|onclick=|submit\(/i);
 const section=social.slice(start,end);
 assert.doesNotMatch(section,/\/api\/posts|\.submit\(|\.requestSubmit\(/);
});

test('una idea abre el editor de publicación y prepara el texto sin publicarlo',async()=>{
 const a=setup();
 await a.ctx.open('presentacion');
 assert.equal(a.calls[0],'modal:post');
 assert.match(a.field.value,/Hola, RedLibertad/);
 assert.deepEqual(a.dispatches,['input']);
 assert.equal(a.calls[a.calls.length-1],'focus');
});

test('no sustituye borradores existentes ni abre plantillas inventadas',async()=>{
 const a=setup('Este es mi texto personal.');
 await a.ctx.open('opinion');
 assert.equal(a.field.value,'Este es mi texto personal.');
 assert.deepEqual(a.dispatches,[]);
 await a.ctx.open('desconocida');
 assert.equal(a.calls.filter(x=>x==='modal:post').length,1);
});

test('la mejora se integra en primeros pasos, sin otra tarjeta que duplique Inicio',()=>{
 assert.match(social,/const next=chooseParticipationNextV32151\(steps,d\.welcome\?\.nextStep,d\.nextStep\)/);
 assert.match(social,/next\.id==='post' \? firstPostIdeasHTMLV32151\(\)/);
 assert.match(social,/data-first-post-idea-v32151/);
 assert.match(social,/await openFirstPostIdeaV32151\(String\(firstPostIdea\.dataset\.firstPostIdeaV32151\|\|''\)\)/);
 assert.match(html,/id="homeWelcomeV32150"/);
 assert.match(html,/id="homeGrowthDetailsV3224"/);
 assert.doesNotMatch(html,/id="homePostIdeaV32151"/);
});

test('los últimos pasos son accesibles por encima de la navegación fija móvil',()=>{
 const patch=css.slice(css.indexOf('/* V3.2.151'));
 assert.match(patch,/@media\(max-width:760px\)/);
 assert.match(patch,/\.home-growth-details-v3224\[open\]\{/);
 assert.match(patch,/margin-bottom:calc\(var\(--mobile-dock-space,112px\) \+ 12px \+ env\(safe-area-inset-bottom\)\)/);
 assert.match(patch,/\.growth-step:last-child/);
 assert.match(patch,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(patch,/@media\(max-width:350px\)/);
});
