'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/resuelve.html');
const js=read('public/resuelve-v350.js');
const css=read('public/resuelve-helper-v3637.css');
const start=js.indexOf(' async function loadPublicHelperProfile(){');
const end=js.indexOf(' function bindHelperProfile(){',start);
const fn=js.slice(start,end);

function mockUi(search,answer){
 const grid={hidden:true,items:[],replaceChildren(){this.items=[]},append(x){this.items.push(x)}};
 const panel={hidden:true,items:[],append(x){this.items.push(x)}};
 const elems={helperPublicPanel:panel,helperPublicStatus:{textContent:''},helperPublicStats:grid,helperPublicEmpty:{hidden:true},helperPublicDisclaimer:{hidden:true},helperPublicExplore:{hidden:true}};
 let requested=0;
 const ctx={
  URLSearchParams,location:{search},
  el:id=>elems[id],
  request:async()=>{requested++;if(answer instanceof Error)throw answer;return answer},
  create:(tag,cls,value)=>({tag,cls,value,children:[],append(...xs){this.children.push(...xs)}}),
 };
 vm.createContext(ctx);
 vm.runInContext(fn,ctx);
 return {elems,requested:()=>requested,load:()=>vm.runInContext('loadPublicHelperProfile()',ctx)};
}

test('V3.6.37: enlaces compartidos muestran la ficha antes de la portada general',()=>{
 assert.match(html,/<link rel="stylesheet" href="\/resuelve-helper-v3637\.css\?v=3\.6\.37">/);
 const panel=html.indexOf('<section id="helperPublicPanel"');
 const hero=html.indexOf('<section class="hero"');
 assert.ok(panel>0&&panel<hero);
 assert.match(html,/id="helperPublicPanel"[^>]*hidden/);
 assert.match(html,/id="helperPublicEmpty"[^>]*hidden/);
 assert.match(html,/id="helperPublicStats"[^>]*hidden/);
 assert.match(html,/id="helperPublicDisclaimer"[^>]*hidden/);
 assert.match(html,/id="helperPublicExplore" href="#questions"[^>]*hidden/);
 assert.match(html,/id="helperProfileToggle" type="checkbox" disabled/);
 assert.match(html,/id="helperProfileShare" href="#" hidden/);
});
test('V3.6.37: cero aportaciones produce un estado veraz y omite contadores a cero',async()=>{
 const env=mockUi('?colaborador=redlibertad',{helper:{username:'redlibertad',declared_speciality:'',helped_questions:0,chosen_solutions:0}});
 await env.load();
 const e=env.elems;
 assert.equal(env.requested(),1);
 assert.match(e.helperPublicStatus.textContent,/Perfil voluntario activo, sin aportaciones públicas visibles todavía/);
 assert.doesNotMatch(e.helperPublicStatus.textContent,/ha compartido ayuda en Resuelve/);
 assert.equal(e.helperPublicEmpty.hidden,false);
 assert.equal(e.helperPublicStats.hidden,true);
 assert.equal(e.helperPublicStats.items.length,0);
 assert.equal(e.helperPublicDisclaimer.hidden,true);
 assert.equal(e.helperPublicExplore.hidden,false);
});
test('V3.6.37: aportaciones reales mantienen sus métricas y especialidad no verificada',async()=>{
 const env=mockUi('?colaborador=ana.test',{helper:{username:'ana.test',declared_speciality:'Docente',helped_questions:3,chosen_solutions:1}});
 await env.load();
 const e=env.elems;
 assert.equal(e.helperPublicEmpty.hidden,true);
 assert.equal(e.helperPublicStats.hidden,false);
 assert.equal(e.helperPublicStats.items.length,2);
 assert.equal(e.helperPublicStats.items[0].children[0].value,'3');
 assert.equal(e.helperPublicStats.items[1].children[0].value,'1');
 assert.equal(e.helperPublicDisclaimer.hidden,false);
 assert.match(e.helperPublicStatus.textContent,/Aportaciones públicas visibles/);
 assert.equal(e.helperPublicPanel.items[0].children[1].value,'Docente');
 assert.match(e.helperPublicPanel.items[0].children[2].value,/RedLibertad no ha verificado/);
});
test('V3.6.37: errores de red, cifras inválidas e identificadores no exponen datos privados',async()=>{
 for(const answer of [new Error('404'),{helper:{username:'test',declared_speciality:'',helped_questions:null,chosen_solutions:1}},{helper:{username:'test',declared_speciality:'',helped_questions:-1,chosen_solutions:0}}]){
  const env=mockUi('?colaborador=test',answer);
  await env.load();
  const e=env.elems;
  assert.match(e.helperPublicStatus.textContent,/Este perfil no está disponible/);
  assert.equal(e.helperPublicStats.hidden,true);
  assert.equal(e.helperPublicEmpty.hidden,true);
  assert.equal(e.helperPublicExplore.hidden,true);
 }
 const invalid=mockUi('?colaborador=../xxx',new Error('Must not request'));
 await invalid.load();
 assert.equal(invalid.requested(),0);
 assert.match(invalid.elems.helperPublicStatus.textContent,/Perfil no disponible/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('V3.6.37: ficha y configuración opt-in legibles en móvil y con foco visible',()=>{
 assert.match(css,/#helperPublicPanel:not\(\[hidden\]\)/);
 assert.match(css,/#helperProfileSettings/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-width:355px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/position:fixed|outline:none|pointer-events:none/);
 assert.match(html,/Abrir mi ficha pública/);
 assert.match(js,/\/resuelve\?colaborador=/);
 assert.match(js,/data\.helper\.declared_speciality/);
});
