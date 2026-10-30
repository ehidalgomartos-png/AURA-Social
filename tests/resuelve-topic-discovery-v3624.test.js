'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const topics=['hogar','tecnologia','tramites','estudios','vida-cotidiana'];

function databaseList(){
 const source=read('src/services/resuelve-v350.js');
 const start=source.indexOf('async function list({');
 const end=source.indexOf('// V3.5.16:',start);
 assert.ok(start>=0&&end>start);
 const calls=[];
 const ctx=vm.createContext({
  ensureSchema:async()=>{},
  validId:x=>/^[1-9][0-9]{0,15}$/.test(String(x||'')),
  CATEGORIES:['consejo','busco','ayuda','experiencia'],
  TOPICS:topics,
  db:{query:async(sql,args)=>{calls.push({sql,args:Array.from(args)});return {rows:[]};}}
 });
 vm.runInContext(source.slice(start,end)+';globalThis.executeList=list;',ctx);
 return {list:ctx.executeList,calls};
}
test('V3.6.24: topic SQL is parameterized, preserves public protections and existing filters',async()=>{
 const {list,calls}=databaseList();
 await list({filter:'open',topic:'tramites',category:'consejo',query:'ayuda',unansweredOnly:true});
 assert.equal(calls.length,1);
 const {sql,args}=calls[0];
 assert.match(sql,/FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'/);
 assert.match(sql,/q.status <> 'hidden'/);
 assert.match(sql,/q.topic=\$7::text/);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM resuelve_answers a_unanswered/);
 assert.match(sql,/a_unanswered.status='visible'/);
 assert.match(sql,/ORDER BY q.id DESC LIMIT 24/);
 assert.deepEqual(args,['open',null,'consejo','ayuda',false,true,'tramites']);
 assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|users.email|recipient_id/i);
 await list({filter:'resolved'});
 assert.equal(calls[1].args.length,6);
 assert.doesNotMatch(calls[1].sql,/q.topic=\$7/);
 await list({filter:'open',topic:"tramites' OR true --"});
 assert.equal(calls[2].args.length,6);
 assert.doesNotMatch(calls[2].sql,/ OR true --/);
});
test('V3.6.24: the public endpoint validates the topic against an allowlist',()=>{
 const router=read('src/routes/resuelve-v350.js');
 const start=router.indexOf("router.get('/questions',wrap(");
 const end=router.indexOf("router.get('/help-topics'",start);
 assert.ok(start>=0&&end>start);
 const code=router.slice(start,end);
 assert.match(code,/const topic=req.query\?\.tema;/);
 assert.match(code,/typeof topic!=='string'\|\|!service.TOPICS.includes\(topic\)/);
 assert.match(code,/return fail\(res,400,'tema_invalido'\)/);
 assert.match(code,/unansweredOnly:unanswered==='si',topic:topic\|\|null/);
 assert.match(code,/if\(unanswered==='si'&&filter!=='open'\)/);
});
test('V3.6.24: visible theme chips are accessible and opt-in, without fabricated counts',()=>{
 const html=read('public/resuelve.html');
 const start=html.indexOf('id="questionTopicDiscovery"');
 const end=html.indexOf('id="helpTopicsPanel"',start);
 assert.ok(start>=0&&end>start);
 const panel=html.slice(start,end);
 assert.match(panel,/Explora preguntas por tema/);
 assert.match(panel,/role="group" aria-label="Elegir tema de las peticiones"/);
 for(const t of topics)assert.match(panel,new RegExp('data-question-topic="'+t+'" aria-pressed="false"'));
 assert.match(panel,/data-question-topic="" class="active" aria-pressed="true"/);
 assert.doesNotMatch(panel,/\b(?:[0-9]+ preguntas|[0-9]+ ayudas)\b/);
 const css=read('public/resuelve-v350.css');
 const style=css.slice(css.indexOf('/* V3.6.24'));
 assert.match(style,/overflow-x:auto/);
 assert.match(style,/@media \(max-width:650px\)/);
 assert.match(style,/min-height:44px/);
 assert.match(style,/:focus-visible/);
});
function listSimulator(stateOverrides={},requestFn=async()=>({items:[],next:null})){
 const source=read('public/resuelve-v350.js');
 const start=source.indexOf(' async function loadList(more=false){');
 const end=source.indexOf('// V3.5.7',start);
 assert.ok(start>=0&&end>start);
 const state={filter:'open',loading:false,category:'',topic:'',search:'',professionalOnly:false,next:null,helpTopics:[],...stateOverrides};
 const children=[];
 const list={replaceChildren(){children.length=0;},append(item){children.push(item);},get childElementCount(){return children.length;}};
 const nodes={questionList:list,listStatus:{textContent:''},moreButton:{hidden:false}};
 let requested=[];
 const ctx=vm.createContext({state,el:id=>nodes[id],URLSearchParams,topicLabels:[
  ['hogar','Hogar'],['tecnologia','Tecnología'],['tramites','Trámites'],
  ['estudios','Estudios'],['vida-cotidiana','Vida cotidiana']],
  request:url=>{requested.push(url);return requestFn(url);},card:q=>q
 });
 vm.runInContext(source.slice(start,end)+';globalThis.renderList=loadList;',ctx);
 return {load:ctx.renderList,state,nodes,children,requested};
}
test('V3.6.24: topic combines with unanswered status, category, keyword and pagination',async()=>{
 const sim=listSimulator({filter:'unanswered',topic:'hogar',category:'consejo',search:'avería',professionalOnly:true},
  async()=>({items:[{id:'88'}],next:'88'}));
 await sim.load();
 const url=new URL(sim.requested[0],'https://redlibertad.com');
 assert.equal(url.pathname,'/api/resuelve/questions');
 assert.equal(url.searchParams.get('estado'),'open');
 assert.equal(url.searchParams.get('sin_respuestas'),'si');
 assert.equal(url.searchParams.get('tema'),'hogar');
 assert.equal(url.searchParams.get('categoria'),'consejo');
 assert.equal(url.searchParams.get('q'),'avería');
 assert.equal(url.searchParams.get('profesional'),'si');
 assert.match(sim.nodes.listStatus.textContent,/Peticiones de Hogar/);
 await sim.load(true);
 assert.equal(new URL(sim.requested[1],'https://redlibertad.com').searchParams.get('antes'),'88');
 const empty=listSimulator({topic:'estudios'});
 await empty.load();
 assert.match(empty.nodes.listStatus.textContent,/No hay peticiones visibles de Estudios/);
});
test('V3.6.24: stale server responses do not overwrite the newly selected topic',async()=>{
 const callbacks=[];
 const sim=listSimulator({topic:'hogar'},()=>new Promise(resolve=>callbacks.push(resolve)));
 const first=sim.load();
 sim.state.topic='tecnologia';
 const second=sim.load();
 assert.equal(callbacks.length,2);
 callbacks[1]({items:[{id:2}],next:null});
 await second;
 callbacks[0]({items:[{id:1}],next:null});
 await first;
 assert.deepEqual(sim.children.map(x=>x.id),[2]);
 assert.match(sim.nodes.listStatus.textContent,/Tecnología/);
 assert.equal(sim.state.loading,false);
});
test('V3.6.24: quick topic controls sync selection and allow returning to all topics',()=>{
 const source=read('public/resuelve-v350.js');
 const start=source.indexOf('  function syncQuestionTopics(){');
 const end=source.indexOf("  el('questionSearchForm').addEventListener('submit'",start);
 assert.ok(start>=0&&end>start);
 function makeButton(topic){
  const handlers={};
  const attributes={};
  const state={active:false};
  return {dataset:{questionTopic:topic},handlers,attributes,state,
   classList:{toggle:(name,value)=>{if(name==='active')state.active=value;}},
   setAttribute:(name,value)=>{attributes[name]=value;},
   addEventListener:(name,callback)=>{handlers[name]=callback;}
  };
 }
 const buttons=['','hogar','tecnologia','tramites','estudios','vida-cotidiana','invalid'].map(makeButton);
 const state={topic:''};let loads=0;
 const ctx=vm.createContext({document:{querySelectorAll:()=>buttons},
  state,topicLabels:[['','Todos'],...topics.map(t=>[t,t])],loadList:()=>{loads++;return Promise.resolve();}});
 vm.runInContext(source.slice(start,end),ctx);
 buttons[1].handlers.click();
 assert.equal(state.topic,'hogar');
 assert.equal(buttons[1].attributes['aria-pressed'],'true');
 assert.equal(buttons[0].attributes['aria-pressed'],'false');
 buttons[0].handlers.click();
 assert.equal(state.topic,'');
 assert.equal(buttons[0].state.active,true);
 buttons[6].handlers.click();
 assert.equal(state.topic,'');
 assert.equal(loads,2);
 const css=read('public/resuelve-v350.css');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(source,/el\('questionTopicDiscovery'\).hidden=\['mine','help','contributed'\].includes\(state.filter\)/);
 assert.match(source,/state.professionalOnly=false;state.topic='';\s+syncQuestionTopics\(\)/);
});
