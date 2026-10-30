'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function loadQuestionQuery(){
 const source=read('src/services/resuelve-v350.js');
 const start=source.indexOf('async function list({');
 const end=source.indexOf('// V3.5.16:',start);
 assert.ok(start>0&&end>start);
 const code=source.slice(start,end);
 const calls=[];
 const context=vm.createContext({
  ensureSchema:async()=>{},
  validId:value=>/^[1-9]\d{0,15}$/.test(String(value||'')),
  CATEGORIES:['consejo','ayuda','busco','experiencia'],
  db:{query:async(sql,args)=>{calls.push({sql,args:Array.from(args)});return {rows:[]};}}
 });
 vm.runInContext(code+';globalThis.runList=list;',context);
 return {run:context.runList,calls};
}

test('V3.6.21: SQL identifica solo preguntas públicas sin respuestas visibles',async()=>{
 const {run,calls}=loadQuestionQuery();
 await run({filter:'open',unansweredOnly:true,category:'consejo',query:' fotos '});
 assert.equal(calls.length,1);
 const {sql,args}=calls[0];
 assert.match(sql,/FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'/);
 assert.match(sql,/WHERE q.status <> 'hidden'/);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM resuelve_answers a_unanswered/);
 assert.match(sql,/a_unanswered.question_id=q.id AND a_unanswered.status='visible'/);
 assert.match(sql,/ORDER BY q.id DESC LIMIT 24/);
 assert.deepEqual(Array.from(args),['open',null,'consejo','fotos',false,true]);
 assert.doesNotMatch(sql,/INSERT|DELETE|UPDATE|users\.email|recipient_id|a_unanswered\.body/i);
 await run({filter:'open'});
 assert.equal(calls[1].args[5],false);
 await run({filter:'open',before:'79',unansweredOnly:true});
 assert.equal(calls[2].args[1],'79');
 assert.equal(calls[2].args[5],true);
});

async function renderList(filter,extra={}){
 const js=read('public/resuelve-v350.js');
 const start=js.indexOf(' async function loadList(more=false){');
 const end=js.indexOf('// V3.5.7',start);
 assert.ok(start>=0&&end>start);
 const code=js.slice(start,end);
 const state={filter,loading:false,category:null,search:'',professionalOnly:false,next:null,helpTopics:[],...extra};
 let url='';
 const list={items:[],replaceChildren(){this.items=[];},append(v){this.items.push(v);},
  get childElementCount(){return this.items.length;}};
 const nodes={questionList:list,listStatus:{textContent:''},moreButton:{hidden:false}};
 const el=id=>nodes[id];
 const ctx=vm.createContext({state,el,URLSearchParams,request:async path=>{
  url=path;return {items:[],next:null};
 },card:q=>q});
 vm.runInContext(code+';globalThis.runLoadList=loadList;',ctx);
 await ctx.runLoadList();
 return {url,state,status:nodes.listStatus.textContent};
}

test('V3.6.21: el filtro público carga solo preguntas abiertas sin respuesta y admite búsqueda',async()=>{
 const result=await renderList('unanswered',{category:'consejo',search:'fotos',professionalOnly:true});
 const parsed=new URL(result.url,'https://redlibertad.com');
 assert.equal(parsed.pathname,'/api/resuelve/questions');
 assert.equal(parsed.searchParams.get('estado'),'open');
 assert.equal(parsed.searchParams.get('sin_respuestas'),'si');
 assert.equal(parsed.searchParams.get('categoria'),'consejo');
 assert.equal(parsed.searchParams.get('q'),'fotos');
 assert.equal(parsed.searchParams.get('profesional'),'si');
 assert.match(result.status,/no hay peticiones abiertas sin respuestas visibles/);
 assert.equal(result.state.loading,false);
 const normal=await renderList('open');
 assert.equal(new URL(normal.url,'https://redlibertad.com').searchParams.get('sin_respuestas'),null);
 const resolved=await renderList('resolved');
 assert.equal(new URL(resolved.url,'https://redlibertad.com').searchParams.get('sin_respuestas'),null);
});

test('V3.6.21: API valida el nuevo filtro y no mezcla preguntas resueltas',()=>{
 const router=read('src/routes/resuelve-v350.js');
 const start=router.indexOf("router.get('/questions',wrap(");
 const end=router.indexOf("router.get('/help-topics'",start);
 assert.ok(start>=0&&end>start);
 const code=router.slice(start,end);
 assert.match(code,/const unanswered=req.query\?\.sin_respuestas/);
 assert.match(code,/if\(unanswered!==undefined&&unanswered!=='si'\)return fail\(res,400/);
 assert.match(code,/if\(unanswered==='si'&&filter!=='open'\)return fail\(res,400,'filtros_incompatibles'\)/);
 assert.match(code,/unansweredOnly:unanswered==='si'/);
 assert.match(code,/service\.list\(/);
 assert.doesNotMatch(code,/requireAuth|sendEmail|sendNotification|INSERT|DELETE|UPDATE/);
});

test('V3.6.21: la nueva pestaña es accesible y puede explorarse en pantallas pequeñas',()=>{
 const html=read('public/resuelve.html');
 assert.match(html,/data-filter="unanswered" type="button" aria-pressed="false">Sin respuestas/);
 assert.match(html,/data-filter="open" class="active" type="button" aria-pressed="true"/);
 assert.match(html,/id="resuelveRegisterForm"/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 const css=read('public/resuelve-v350.css');
 const part=css.slice(css.lastIndexOf('/* V3.6.21'));
 assert.ok(part.startsWith('/* V3.6.21'));
 assert.match(part,/@media\(max-width:650px\)/);
 assert.match(part,/overflow-x:auto/);
 assert.match(part,/min-height:44px/);
 assert.match(part,/:focus-visible/);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(part,/display:none|pointer-events:none|visibility:hidden/);
});
