'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/resuelve-v350.js'),html=read('public/resuelve.html');
const css=read('public/resuelve-detail-v3633.css');
function pending(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function harness({open=true,historyState=null,loaded=3}={}){
 const elements={};
 for(const id of ['detailPanel','questions','solutions','askPanel','questionDetail','answerList','answerForm',
  'resuelveExtras','backButton','questionList']){
  elements[id]={
   hidden:id==='detailPanel'?!open:false,childElementCount:id==='questionList'?loaded:0,
   textContent:'',replaceChildren(){this.childElementCount=0;},
   scrollIntoView(o){logs.push('scroll:'+id+':'+o.block);}
  };
 }
 const logs=[], requests=[];
 const state={question:{id:3}};
 const history={state:historyState,pushState(s,t,url){logs.push('push:'+url);this.state=s;},
  replaceState(s,t,url){logs.push('replace:'+url);this.state=s;}};
 const start=js.indexOf(' function displayDetail(open){');
 const end=js.indexOf(' // V3.5.17.1',start);
 assert.ok(start>=0&&end>start);
 const goStart=js.indexOf(' // V3.6.33 — conserva los filtros');
 const goEnd=js.indexOf('// V3.5.15',goStart);
 assert.ok(goStart>=0&&goEnd>goStart);
 const context=vm.createContext({
  el:id=>elements[id],state,history,
  request:async uri=>{const d=pending();requests.push({uri,...d});return d.promise;},
  renderDetail:data=>logs.push('render:'+data.question.id),
  loadList:()=>{logs.push('load:questions');return Promise.resolve();}
 });
 vm.runInContext(js.slice(start,end)+js.slice(goStart,goEnd)+
  ';globalThis.exposed={openDetail,goList,restoreBrowse};',context);
 return {elements,logs,requests,state,history,...context.exposed};
}
function wireAnchor(){
 const start=js.indexOf(' function bindDetailNavigation(');
 const end=js.indexOf(' function card(q)',start);
 assert.ok(start>=0&&end>start);
 const visits=[];
 const c=vm.createContext({openDetail:(id,push,from)=>visits.push([id,push,from])});
 vm.runInContext(js.slice(start,end)+';globalThis.wire=bindDetailNavigation;',c);
 let callback;
 const link={addEventListener(type,fn){assert.equal(type,'click');callback=fn;}};
 c.wire(link,42,'solutions');
 return {visits,click:options=>{
  let prevented=false;
  callback({button:0,defaultPrevented:false,ctrlKey:false,metaKey:false,shiftKey:false,
   altKey:false,preventDefault(){prevented=true;},...options});
  return prevented;
 }};
}
test('V3.6.33: normal links preserve new-tab behavior; normal click keeps library context',()=>{
 const x=wireAnchor();
 assert.equal(x.click({ctrlKey:true}),false);
 assert.equal(x.click({metaKey:true}),false);
 assert.equal(x.click({button:1}),false);
 assert.equal(x.visits.length,0);
 assert.equal(x.click(),true);
 assert.deepEqual(x.visits,[[42,true,'solutions']]);
 const block=js.slice(js.indexOf('function solutionCard(q)'),js.indexOf('let solutionGeneration=0;'));
 assert.match(block,/bindDetailNavigation\(link,q\.id,'solutions'\)/);
 assert.match(block,/openDetail\(q\.id,true,'solutions'\)/);
 assert.match(js,/bindDetailNavigation\(headingLink,q\.id,'questions'\)/);
});
test('V3.6.33: detail from library returns to library, without discarding loaded result cards',async()=>{
 const x=harness();
 const work=x.openDetail(19,true,'solutions');
 assert.match(x.elements.backButton.textContent,/Volver a las soluciones/);
 assert.ok(x.logs.includes('scroll:detailPanel:start'));
 assert.ok(x.logs.includes('push:/resuelve?id=19'));
 x.requests[0].resolve({question:{id:19}});
 await work;
 assert.equal(x.state.question.id,19);
 x.goList();
 assert.equal(x.elements.detailPanel.hidden,true);
 assert.ok(x.logs.includes('replace:/resuelve'));
 assert.ok(x.logs.includes('scroll:solutions:start'));
 assert.equal(x.logs.includes('load:questions'),false);
});
test('V3.6.33: direct shared link can return to real public questions, even before list loaded',async()=>{
 const x=harness({open:false,historyState:null,loaded:0});
 const work=x.openDetail(25,false);
 assert.match(x.elements.backButton.textContent,/Ver todas las peticiones/);
 assert.equal(x.logs.some(v=>v.startsWith('push:')),false);
 assert.match(x.requests[0].uri,/\/api\/resuelve\/questions\/25/);
 x.requests[0].resolve({question:{id:25}});
 await work;
 x.goList();
 assert.ok(x.logs.includes('load:questions'));
 assert.ok(x.logs.includes('scroll:questions:start'));
 assert.equal(x.history.state.view,'questions');
});
test('V3.6.33: invalid deep link is safe and still offers back navigation',async()=>{
 const x=harness({open:false,loaded:0});
 await x.openDetail('../private',false);
 assert.match(x.elements.questionDetail.textContent,/enlace no es válido/);
 assert.equal(x.requests.length,0);
 assert.equal(x.elements.detailPanel.hidden,false);
 x.goList();
 assert.equal(x.elements.detailPanel.hidden,true);
});
test('V3.6.33: stale responses cannot reopen details after back or overwrite newer results',async()=>{
 const x=harness();
 const old=x.openDetail(30,true,'questions');
 x.goList();
 x.requests[0].resolve({question:{id:30}});
 await old;
 assert.equal(x.logs.some(v=>v==='render:30'),false);
 assert.equal(x.state.question,null);
 const earlier=x.openDetail(31,true,'questions');
 const newer=x.openDetail(32,true,'questions');
 x.requests[2].resolve({question:{id:32}});
 await newer;
 x.requests[1].resolve({question:{id:31}});
 await earlier;
 assert.equal(x.state.question.id,32);
 assert.equal(x.logs.some(v=>v==='render:31'),false);
});
test('V3.6.33: popstate restores browser navigation to original list',()=>{
 const i=js.indexOf("window.addEventListener('popstate'");
 const block=js.slice(i,i+450);
 assert.match(block,/history\.state\?\.view==='solutions'/);
 assert.match(block,/restoreBrowse\(false\)/);
 assert.match(block,/openDetail\(id,false\)/);
 assert.match(html,/resuelve-detail-v3633\.css/);
 assert.match(html,/id="backButton"/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/#questions,#solutions\{scroll-margin-top:84px\}/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
