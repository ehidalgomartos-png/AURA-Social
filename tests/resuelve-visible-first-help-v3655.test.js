'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/resuelve.html');
const script=read('public/resuelve-v350.js');
const styles=read('public/resuelve-first-help-quick-v3655.css');
const candidateStart=script.indexOf('function firstHelpCandidates(items,user){');
const candidateEnd=script.indexOf('let firstHelpRequestVersion=0;',candidateStart);
const quickStart=script.indexOf('function syncFirstHelpQuickV3655(q){');
const quickEnd=script.indexOf('async function loadFirstHelpSpotlight(){',quickStart);
assert.ok(candidateStart>0&&candidateEnd>candidateStart&&quickStart>candidateEnd&&quickEnd>quickStart);
const candidateCode=script.slice(candidateStart,candidateEnd);
const quickCode=script.slice(quickStart,quickEnd);

function render(items,user=null){
 const panel={hidden:true};
 const heading={textContent:''};
 const link={href:'#questions',dataset:{}};
 const els={firstHelpQuickV3655:panel,firstHelpQuickHeadingV3655:heading,firstHelpQuickLinkV3655:link};
 const ctx={items,user,els,result:null,Number,String,Array,encodeURIComponent,el:id=>els[id]};
 vm.createContext(ctx);
 vm.runInContext(candidateCode+quickCode+
   '\n const eligible=firstHelpCandidates(items,user);'+
   '\n syncFirstHelpQuickV3655(eligible[0]||null);'+
   '\n result=eligible.map(q=>String(q.id));',ctx);
 return {panel,heading,link,ids:Array.from(ctx.result)};
}
const item=(overrides={})=>({
 id:41,title:'¿Cómo preparar una entrevista?',body:'Consejos prácticos para una entrevista',
 category:'consejo',status:'open',answer_count:0,author_id:7,author_username:'persona7',...overrides
});

test('V3.6.55: enlace superior solo muestra preguntas reales abiertas sin respuestas visibles',()=>{
 const real=render([item()]);
 assert.equal(real.panel.hidden,false);
 assert.equal(real.heading.textContent,item().title);
 assert.equal(real.link.href,'/resuelve?id=41');
 assert.equal(real.link.dataset.questionId,'41');
 for(const change of [
  {status:'resolved'},{status:'hidden'},{answer_count:1},{answer_count:-1},
  {answer_count:null},{answer_count:undefined},{answer_count:'desconocido'},
  {my_answer_id:33},{id:'../../../privado'}
 ]){
  const out=render([item(change)]);
  assert.equal(out.panel.hidden,true,JSON.stringify(change));
 }
 assert.equal(render([]).panel.hidden,true);
 assert.equal(render(null).panel.hidden,true);
});

test('V3.6.55: no promociona peticiones propias ni respuestas del usuario',()=>{
 assert.equal(render([item({author_id:10})],{id:10,username:'usuario'}).panel.hidden,true);
 assert.equal(render([item({author_username:'persona7'})],{id:10,username:'PERSONA7'}).panel.hidden,true);
 assert.equal(render([item({author_id:10}),item({id:42,author_id:11})],{id:10,username:'otra'}).link.href,'/resuelve?id=42');
});

test('V3.6.55: título de la petición es texto, no HTML insertado por la web',()=>{
 const payload='<img src=x onerror=alert(1)> & <script>alert(2)</script>';
 const r=render([item({title:payload})]);
 assert.equal(r.heading.textContent,payload);
 assert.match(quickCode,/title\.textContent=String\(q\.title/);
 assert.doesNotMatch(quickCode,/innerHTML|insertAdjacentHTML|Math\.random|localStorage|fetch\(/);
 assert.equal(r.link.href,'/resuelve?id=41');
});

test('V3.6.55: nunca muestra contenido si no hay resultado o falla la consulta',()=>{
 const start=script.indexOf('async function loadFirstHelpSpotlight(){');
 const end=script.indexOf('// V3.6.42.1',start);
 const a=script.slice(start,end);
 assert.match(a,/syncFirstHelpQuickV3655\(null\)/);
 assert.match(a,/const items=firstHelpCandidates\(data\.items,state\.user\)/);
 assert.match(a,/if\(!items\.length\)return;\s*syncFirstHelpQuickV3655\(items\[0\]\)/);
 assert.match(a,/if\(version!==firstHelpRequestVersion\|\|String\(state\.user\?\.id\?\?''\)!==userKey\)return/);
 assert.match(a,/catch\(_\).*syncFirstHelpQuickV3655\(null\)/s);
 assert.match(a,/request\('\/api\/resuelve\/questions\?estado=open&sin_respuestas=si'\)/);
});

test('V3.6.55: el enlace directo conserva modificadores y abre el formulario adecuado',()=>{
 assert.match(script,/el\('firstHelpQuickLinkV3655'\)\.addEventListener\('click'/);
 assert.match(script,/event\.ctrlKey\|\|event\.metaKey\|\|/);
 assert.match(script,/event\.shiftKey\|\|event\.altKey/);
 assert.match(script,/void goToFirstReply\(id\)/);
});

test('V3.6.55: diseño compacto móvil, accesible y oculto por defecto',()=>{
 assert.match(html,/<aside id="firstHelpQuickV3655"[^>]*hidden>/);
 assert.ok(html.indexOf('id="firstHelpQuickV3655"')>html.indexOf('id="heroActions"'));
 assert.ok(html.indexOf('id="firstHelpQuickV3655"')<html.indexOf('id="questions"'));
 assert.match(html,/id="firstHelpQuickHeadingV3655"/);
 assert.match(html,/id="firstHelpQuickLinkV3655"/);
 assert.match(html,/resuelve-first-help-quick-v3655\.css\?v=3\.6\.55/);
 assert.match(html,/resuelve-v350\.js\?v=3\.6\.55/);
 assert.match(styles,/#firstHelpQuickV3655:not\(\[hidden\]\)/);
 assert.match(styles,/@media\(max-width:600px\)/);
 assert.match(styles,/min-height:48px/);
 assert.match(styles,/:focus-visible/);
 assert.doesNotMatch(styles,/position:fixed|pointer-events:none|outline:none/);
});
