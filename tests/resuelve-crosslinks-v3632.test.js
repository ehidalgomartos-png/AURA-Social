'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const source=read('public/resuelve-v350.js');
const html=read('public/resuelve.html');
const css=read('public/resuelve-crosslinks-v3632.css');
function harness(fromDetail=false){
 const start=source.indexOf(' // V3.6.32 — navegación voluntaria');
 const end=source.indexOf(' async function openDetail',start);
 assert.ok(start>=0&&end>start);
 const calls=[];
 const elements={};
 for(const name of ['detailPanel','questions','solutions','askPanel','solutionFilterForm',
  'solutionCategory','questionSearchForm','questionCategoryFilter','questionTopicDiscovery',
  'helpTopicsPanel','questionAdvancedFilters','questionMoreFiltersToggle']){
  elements[name]={hidden:name==='detailPanel'?!fromDetail:false,value:'previous',
   reset(){calls.push('reset:'+name)},setAttribute(k,v){this[k]=v},
   scrollIntoView(o){calls.push('scroll:'+name+':'+o.block)}};
 }
 const state={question:{id:5},solutionCategory:'ayuda',solutionSearch:'vieja',
  category:'busco',search:'antigua',topic:'hogar',professionalOnly:true};
 const chips=[{dataset:{questionTopic:''}},{dataset:{questionTopic:'hogar'}}];
 chips.forEach(chip=>{
  chip.classList={toggle(k,active){chip.active=active;}};
  chip.chipAttrs={};
  chip.setAttribute=function(k,v){this.chipAttrs[k]=v;};
 });
 const filter={click(){calls.push('click:open');state.filter='open';}};
 const doc={querySelector:x=>x==='[data-filter="open"]'?filter:null,
  querySelectorAll:x=>x==='[data-question-topic]'?chips:[]};
 const context=vm.createContext({Object,document:doc,state,
  categories:{consejo:'Consejo',busco:'Orientación',ayuda:'Ayuda',experiencia:'Experiencias'},
  el:key=>elements[key],displayDetail(open){
   calls.push('display:'+open);
   elements.detailPanel.hidden=!open;
   elements.questions.hidden=open;
   elements.solutions.hidden=open;
  },history:{pushState:(s,t,path)=>calls.push('history:'+path)},
  loadSolutions:()=>{calls.push('load:solutions');return Promise.resolve();}
 });
 vm.runInContext(source.slice(start,end)+';globalThis.browse=browseCommunity;',context);
 return {browse:context.browse,state,elements,calls,chips};
}
test('V3.6.32: cross-navigation links only existing public question and reviewed-library views',()=>{
 assert.match(html,/\/resuelve-crosslinks-v3632\.css/);
 const detail=source.slice(source.indexOf('function connectedActions(q)'),source.indexOf('// V3.5.17: invitar'));
 assert.match(detail,/Ver soluciones revisadas de esta categoría/);
 assert.match(detail,/browseCommunity\(q\.category,'solutions'\)/);
 assert.match(detail,/Ver preguntas abiertas de esta categoría/);
 const card=source.slice(source.indexOf('function solutionCard(q)'),source.indexOf('let solutionGeneration=0;'));
 assert.match(card,/browseCommunity\(q\.category,'questions'\)/);
 assert.match(card,/if\(q\.seo_public_opt_in===true\)/);
 assert.match(card,/resuelve-browse-questions-v3632/);
 assert.match(css,/@media \(max-width:760px\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/flex-wrap:wrap/);
 assert.doesNotThrow(()=>new Function(source));
 assert.doesNotMatch(source,/\.innerHTML\s*=/);
});
test('V3.6.32: from a detail, reviewed solutions use real category and reset stale search',()=>{
 const s=harness(true);
 s.browse('consejo','solutions');
 assert.equal(s.state.question,null);
 assert.equal(s.state.solutionCategory,'consejo');
 assert.equal(s.state.solutionSearch,'');
 assert.equal(s.elements.solutionCategory.value,'consejo');
 assert.ok(s.calls.includes('history:/resuelve'));
 assert.ok(s.calls.includes('load:solutions'));
 assert.ok(s.calls.includes('scroll:solutions:start'));
 assert.equal(s.elements.detailPanel.hidden,true);
 assert.equal(s.elements.solutions.hidden,false);
});
test('V3.6.32: open questions navigation clears invisible filters and shows chosen category',()=>{
 const s=harness(true);
 s.browse('ayuda','questions');
 assert.equal(s.state.category,'ayuda');
 assert.equal(s.state.filter,'open');
 assert.equal(s.state.topic,'');
 assert.equal(s.state.search,'');
 assert.equal(s.state.professionalOnly,false);
 assert.equal(s.elements.questionCategoryFilter.value,'ayuda');
 assert.equal(s.elements.questionAdvancedFilters.hidden,false);
 assert.equal(s.elements.questionMoreFiltersToggle['aria-expanded'],'true');
 assert.equal(s.elements.questionMoreFiltersToggle.textContent,'Más filtros (1)');
 assert.equal(s.chips[0].active,true);
 assert.equal(s.chips[1].active,false);
 assert.ok(s.calls.includes('click:open'));
 assert.ok(s.calls.includes('scroll:questions:start'));
});
test('V3.6.32: unknown categories safely fall back to public general lists',()=>{
 const s=harness(false);
 s.browse('__proto__','solutions');
 assert.equal(s.state.solutionCategory,'');
 assert.equal(s.elements.solutionCategory.value,'');
 assert.equal(s.calls.some(x=>x.startsWith('history:')),false);
 s.browse('empresa-externa','questions');
 assert.equal(s.state.category,'');
 assert.equal(s.elements.questionAdvancedFilters.hidden,true);
 assert.ok(s.calls.includes('click:open'));
 const before=s.calls.length;
 s.browse('ayuda','admin');
 assert.equal(s.calls.length,before);
});
test('V3.6.32: navigation adds no private endpoint, signup gate, sale or invented content',()=>{
 const start=source.indexOf(' // V3.6.32 — navegación voluntaria');
 const end=source.indexOf(' async function openDetail',start);
 const block=source.slice(start,end);
 assert.match(block,/void loadSolutions\(\)/);
 assert.match(block,/document\.querySelector\('\[data-filter="open"\]'\)/);
 assert.doesNotMatch(block,/write\(|fetch\(|openAuth\(|location\.assign|window\.open|localStorage|INSERT|UPDATE|DELETE/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(service,/q\.library_opt_out=FALSE/);
 assert.match(service,/a\.status='visible'/);
});
