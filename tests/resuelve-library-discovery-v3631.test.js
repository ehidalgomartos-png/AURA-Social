'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const js=read('public/resuelve-v350.js');
const html=read('public/resuelve.html');
const css=read('public/resuelve-library-v3631.css');

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function simulator(){
 const begin=js.indexOf(' let solutionGeneration=0;');
 const end=js.indexOf('// V3.5.8: cola editorial disponible',begin);
 assert.ok(begin>0&&end>begin);
 const requests=[];
 const elements={
  solutionList:{children:[],childElementCount:0,attrs:{},
   append(o){this.children.push(o);this.childElementCount=this.children.length;},
   replaceChildren(){this.children=[];this.childElementCount=0;},
   setAttribute(k,v){this.attrs[k]=v;}},
  solutionStatus:{textContent:''},
  solutionResultCount:{textContent:''},
  moreSolutions:{hidden:false},
  solutionCategoryShortcuts:{children:[],append(o){this.children.push(o);},replaceChildren(){this.children=[];}},
  solutionSummaryStatus:{textContent:''},
  solutionCategory:{value:''}
 };
 const state={solutionCategory:'',solutionSearch:'',solutionNext:null,solutionLoading:false};
 const context=vm.createContext({
  el:id=>elements[id],state,URLSearchParams,
  request:async uri=>{const d=deferred();requests.push({uri,...d});return d.promise;},
  solutionCard:q=>({id:q.id}),
  button:(label,callback,cls)=>({label,callback,cls,setAttribute(key,value){this[key]=value;}})
 });
 vm.runInContext(js.slice(begin,end)+';globalThis.testLoad=loadSolutions;',context);
 return {load:context.testLoad,state,elements,requests};
}
async function awaitRequest(s,contains){
 for(let n=0;n<15;n++){
  const match=s.requests.findLast(r=>r.uri.includes(contains));
  if(match)return match;
  await Promise.resolve();
 }
 throw Error('The expected request was not issued: '+contains);
}
test('V3.6.31: library structure, visible count, discovery links, and responsive cards',()=>{
 assert.match(html,/href="\/resuelve-library-v3631.css"/);
 assert.match(html,/id="solutionResultCount"[^>]*role="status" aria-live="polite"/);
 assert.match(html,/id="solutionList"[^>]*aria-labelledby="solutionResultsTitle" aria-busy="false"/);
 assert.ok(html.indexOf('id="resuelveTopicsLinks"')<html.indexOf('id="solutionResultCount"'));
 assert.ok(html.indexOf('id="solutionResultCount"')<html.indexOf('id="solutionList"'));
 assert.match(html,/Son respuestas elegidas por quien preguntó y revisadas/);
 assert.match(html,/Aquí no hace falta comprar nada/);
 assert.match(css,/@media \(max-width:760px\)/);
 assert.match(css,/@media \(max-width:650px\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('V3.6.31: count reflects actual loaded approved solutions, not invented totals',async()=>{
 const s=simulator();
 const load=s.load(false);
 assert.match(s.elements.solutionStatus.textContent,/Buscando soluciones reales/);
 assert.equal(s.elements.solutionList.attrs['aria-busy'],'true');
 const first=await awaitRequest(s,'/api/resuelve/solutions?');
 first.resolve({items:[{id:11},{id:10}],next:'10'});
 const summary=await awaitRequest(s,'/api/resuelve/solutions/summary?');
 summary.resolve({total:2,byCategory:{consejo:2,busco:0,ayuda:0,experiencia:0}});
 await load;
 assert.equal(s.elements.solutionList.childElementCount,2);
 assert.match(s.elements.solutionResultCount.textContent,/Mostrando 2 soluciones revisadas · Hay más para cargar/);
 assert.equal(s.elements.solutionList.attrs['aria-busy'],'false');
 assert.equal(s.elements.solutionCategoryShortcuts.children.length,5);
 const more=s.load(true);
 const page=await awaitRequest(s,'antes=10');
 page.resolve({items:[{id:8}],next:null});
 await more;
 assert.equal(s.elements.solutionList.childElementCount,3);
 assert.match(s.elements.solutionResultCount.textContent,/Mostrando 3 soluciones revisadas\./);
 assert.equal(s.elements.moreSolutions.hidden,true);
});
test('V3.6.31: new search wins over a stale summary and keeps its real result count',async()=>{
 const s=simulator();
 const first=s.load();
 (await awaitRequest(s,'/api/resuelve/solutions?')).resolve({items:[{id:9}],next:null});
 const oldSummary=await awaitRequest(s,'/api/resuelve/solutions/summary?');
 s.state.solutionSearch='trámite';
 const newer=s.load();
 assert.equal(s.elements.solutionList.childElementCount,0);
 (await awaitRequest(s,'q=tr%C3%A1mite')).resolve({items:[{id:4}],next:null});
 const freshSummary=await awaitRequest(s,'/api/resuelve/solutions/summary?q=');
 freshSummary.resolve({total:1,byCategory:{consejo:0,busco:0,ayuda:1,experiencia:0}});
 await newer;
 oldSummary.resolve({total:50,byCategory:{consejo:50,busco:0,ayuda:0,experiencia:0}});
 await first;
 assert.equal(s.elements.solutionList.childElementCount,1);
 assert.equal(s.elements.solutionList.children[0].id,4);
 assert.equal(s.elements.solutionCategoryShortcuts.children[0].label,'Todas · 1');
 assert.match(s.elements.solutionResultCount.textContent,/para esta búsqueda/);
});
test('V3.6.31: stale failed request does not overwrite fresh successful empty state',async()=>{
 const s=simulator();
 const old=s.load();
 const stale=await awaitRequest(s,'/api/resuelve/solutions?');
 s.state.solutionCategory='consejo';
 const current=s.load();
 const latest=s.requests.findLast(x=>x.uri.includes('categoria=consejo'));
 assert.ok(latest);
 latest.resolve({items:[],next:null});
 (await awaitRequest(s,'/api/resuelve/solutions/summary?')).resolve({
  total:0,byCategory:{consejo:0,busco:0,ayuda:0,experiencia:0}
 });
 await current;
 stale.reject(new Error('respuesta antigua fallida'));
 await old;
 assert.match(s.elements.solutionStatus.textContent,/No hay soluciones revisadas/);
 assert.doesNotMatch(s.elements.solutionStatus.textContent,/antigua/);
 assert.match(s.elements.solutionResultCount.textContent,/Sin soluciones revisadas en la categoría seleccionada/);
});
test('V3.6.31: existing privacy/consent and no commercial or forced signup remain',()=>{
 const block=js.slice(js.indexOf(' // V3.6.31 — resultados'),js.indexOf('// V3.5.8: cola editorial disponible'));
 assert.match(block,/\/api\/resuelve\/solutions\?/);
 assert.match(block,/\/api\/resuelve\/solutions\/summary\?/);
 assert.match(block,/generation!==solutionGeneration/);
 assert.match(block,/if\(!more\)await loadSolutionSummary\(\)/);
 assert.doesNotMatch(block,/openAuth\(|localStorage|navigator\.sendBeacon|INSERT|UPDATE|DELETE/);
 assert.match(read('src/services/resuelve-v350.js'),/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.doesNotThrow(()=>new Function(js));
});
