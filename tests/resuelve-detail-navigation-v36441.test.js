'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('public/resuelve-v350.js');
const html=read('public/resuelve.html');
const css=read('public/resuelve-detail-navigation-v36441.css');
const start=source.indexOf('function detailQuickNavigation(q,count,mine){');
const end=source.indexOf('function renderDetail(data){',start);
const helper=source.slice(start,end);
function simulate({count=2,mine=false,status='open',clarification=true}={}){
 const tracking={answersScroll:0,headingFocus:0,clarifyScroll:0,clarifyFocus:0,
  shareOpen:false,shareScroll:0,shareFocus:0};
 const textbox={focus:()=>tracking.clarifyFocus++};
 const details=clarification?{
  open:false,
  scrollIntoView:()=>tracking.clarifyScroll++,
  querySelector:()=>textbox
 }:null;
 const heading={focus:()=>tracking.headingFocus++};
 const toggle={
  getAttribute:()=>tracking.shareOpen?'true':'false',
  click:()=>tracking.shareOpen=true,
  scrollIntoView:()=>tracking.shareScroll++,
  focus:()=>tracking.shareFocus++
 };
 const answerList={scrollIntoView:()=>tracking.answersScroll++};
 const nodes={
  answerList,resuelveAnswersTitle:heading,
  questionDetail:{querySelector:()=>details},
  resuelveExtras:{querySelector:()=>toggle}
 };
 const create=(tag,cls,content)=>({
  tag,cls,content,children:[],props:{},
  append(...children){this.children.push(...children);},
  setAttribute(k,v){this.props[k]=v;}
 });
 const button=(label,callback,className)=>({
  tag:'button',label,callback,className,
  props:{},setAttribute(k,v){this.props[k]=v;}
 });
 const context={create,button,el:id=>nodes[id],Number};
 vm.createContext(context);
 vm.runInContext(helper,context);
 const nav=vm.runInContext(`detailQuickNavigation({status:'${status}'},${count},${mine})`,context);
 return {nav,details,tracking};
}
test('V3.6.44.1: atajos reflejan respuestas reales y estado abierto',()=>{
 const {nav}=simulate({count:2,mine:true});
 assert.equal(nav.tag,'nav');
 assert.equal(nav.props['aria-label'],'Accesos directos de esta petición');
 assert.deepEqual(nav.children.map(x=>x.label),['Ver 2 respuestas','Añadir una aclaración','Enviar esta pregunta']);
 assert.equal(nav.children[0].props['aria-controls'],'answerList');
 const one=simulate({count:1}).nav;
 assert.deepEqual(one.children.map(x=>x.label),['Ver la respuesta','Enviar esta pregunta']);
 const none=simulate({count:0,mine:true}).nav;
 assert.equal(none.children[0].content,'Todavía no hay respuestas visibles.');
 assert.equal(none.children.length,3);
 const solved=simulate({count:3,mine:true,status:'resolved'}).nav;
 assert.deepEqual(solved.children.map(x=>x.label),['Ver 3 respuestas']);
});
test('V3.6.44.1: atajos llevan a componentes existentes, con foco y sin publicaciones',()=>{
 const state=simulate({mine:true});
 state.nav.children[0].callback();
 assert.equal(state.tracking.answersScroll,1);
 assert.equal(state.tracking.headingFocus,1);
 state.nav.children[1].callback();
 assert.equal(state.details.open,true);
 assert.equal(state.tracking.clarifyScroll,1);
 assert.equal(state.tracking.clarifyFocus,1);
 state.nav.children[2].callback();
 assert.equal(state.tracking.shareOpen,true);
 assert.equal(state.tracking.shareScroll,1);
 assert.equal(state.tracking.shareFocus,1);
 state.nav.children[2].callback();
 assert.equal(state.tracking.shareScroll,2);
 const missing=simulate({mine:true,clarification:false});
 assert.doesNotThrow(()=>missing.nav.children[1].callback());
});
test('V3.6.44.1: integración conserva contador real, permisos y retorno al principio',()=>{
 assert.match(source,/host\.append\(detailQuickNavigation\(q,Array\.isArray\(data\.answers\)\?data\.answers\.length:0,mine\)\)/);
 assert.match(source,/h\.id='resuelveAnswersTitle';\s+h\.tabIndex=-1/);
 assert.match(source,/detailHeading\.id='detailTitle';\s+detailHeading\.tabIndex=-1/);
 assert.match(source,/if\(mine&&q\.status==='open'\)/);
 assert.match(source,/querySelector\('details\.resuelve-clarification'\)/);
 assert.match(source,/if\(data\.answers\.length\)\{\s+const back=button\('Volver al inicio de la pregunta'/);
 assert.match(source,/el\('detailTitle'\)\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/el\('resuelveExtras'\)\.querySelector\('\.question-share-toggle'\)/);
 assert.match(source,/if\(toggle\.getAttribute\('aria-expanded'\)!=='true'\)toggle\.click\(\)/);
 assert.match(html,/id="detailPanel"/);
 assert.match(html,/id="answerList"/);
 assert.match(html,/resuelve-detail-navigation-v36441\.css\?v=3\.6\.44\.1/);
 assert.doesNotMatch(helper,/fetch\(|INSERT INTO|write\(|setTimeout|Math\.random|localStorage/);
 assert.doesNotThrow(()=>new Function(source));
});
test('V3.6.44.1: se adapta a móvil sin barras fijas ni tapar la navegación',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/#answerList\{scroll-margin-top:25px/);
 assert.doesNotMatch(css,/position:fixed|pointer-events:none|outline:none|display:none/);
});
