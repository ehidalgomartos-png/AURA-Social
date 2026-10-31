'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {createResuelveReplyActivity}=require('../src/services/resuelve-reply-activity-v3626');

test('V3.6.26: read-only owner query selects only visible answers and active users',async()=>{
 const calls=[];let schemaCalls=0;
 const rows=[{id:'17',title:'Pregunta propia',answer_count:2,last_answer_at:'2026-10-30T20:00:00Z'}];
 const service=createResuelveReplyActivity({
  ensureResuelve:async()=>{schemaCalls++;},
  db:{query:async(sql,args)=>{calls.push({sql,args});return {rows};}}
 });
 const response=await service.listForOwner(24);
 assert.deepEqual(response,rows);
 assert.equal(schemaCalls,1);assert.equal(calls.length,1);
 const {sql,args}=calls[0];
 assert.deepEqual(args,[24]);
 assert.match(sql,/WHERE q.author_id=\$1 AND q.status IN \('open','resolved'\)/);
 assert.match(sql,/JOIN users author ON author.id=q.author_id AND author.status='active'/);
 assert.match(sql,/JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'/);
 assert.match(sql,/a.question_id=q.id AND a.status='visible'/);
 assert.match(sql,/count\(a.id\)::int AS answer_count/);
 assert.match(sql,/max\(a.created_at\) AS last_answer_at/);
 assert.match(sql,/ORDER BY last_answer_at DESC,q.id DESC LIMIT 6/);
 assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|users\.email|users\.phone|password|a\.body/i);
});

test('V3.6.26: authenticated GET exists before generic question route; no write endpoints',()=>{
 const route=read('src/routes/resuelve-v350.js');
 const entry="router.get('/questions/mine/reply-activity',requireAuth,wrap(async(req,res)=>{";
 assert.match(route,/const \{resuelveReplyActivity\}=require\('\.\.\/services\/resuelve-reply-activity-v3626'\)/);
 assert.ok(route.includes(entry));
 assert.ok(route.indexOf(entry)<route.indexOf("router.get('/questions/mine',requireAuth"));
 assert.ok(route.indexOf(entry)<route.indexOf("router.get('/questions/:id',"));
 const section=route.slice(route.indexOf(entry),route.indexOf("router.get('/questions/mine',requireAuth"));
 assert.match(section,/resuelveReplyActivity\.listForOwner\(req\.user\.id\)/);
 assert.match(section,/res\.json\(\{ok:true,items\}\)/);
 assert.doesNotMatch(section,/req\.query|req\.params|req\.body|limiter|write|resend|email/i);
});

test('V3.6.26: collapsed private panel preserves email opt-in and explains read status',()=>{
 const html=read('public/resuelve.html');
 const block=html.slice(html.indexOf('<details id="myReplyActivityPanel"'),html.indexOf('<details id="resuelveReplyEmailSettings"'));
 assert.match(block,/id="myReplyActivityPanel" class="resuelve-reply-activity" hidden/);
 for(const id of ['myReplyActivityList','myReplyActivityStatus','refreshMyReplyActivity'])
  assert.ok(block.includes('id="'+id+'"'));
 assert.match(block,/no indica si ya las has leído/);
 assert.match(block,/role="status" aria-live="polite"/);
 assert.match(block,/href="\/app\?view=notifications"/);
 assert.ok(html.includes('id="resuelveReplyEmailToggle"'));
 const css=read('public/resuelve-v350.css');
 const rules=css.slice(css.indexOf('/* V3.6.26 — últimas respuestas'),css.indexOf('/* V3.6.23 — Resuelve Desktop:'));
 assert.match(rules,/\.resuelve-reply-activity-item/);
 assert.match(rules,/@media\(max-width:650px\)/);
 assert.match(rules,/min-height:44px/);
 assert.match(rules,/:focus-visible/);
 assert.doesNotMatch(rules,/display:none|position:fixed/);
});

function simulateList(rows, user={id:5}){
 const js=read('public/resuelve-v350.js');
 const start=js.indexOf(' async function loadRecentReplyActivity(){');
 const end=js.indexOf(' function bindRecentReplyActivity(){',start);
 assert.ok(start>0&&end>start);
 const items=[];
 const list={replaceChildren(){items.length=0;},append(item){items.push(item);},get childElementCount(){return items.length;}};
 const panel={open:true};
 const status={textContent:''};
 const refresh={disabled:false};
 const nodes={myReplyActivityPanel:panel,myReplyActivityList:list,myReplyActivityStatus:status,refreshMyReplyActivity:refresh};
 const state={user};
 const requests=[];
 const ctx=vm.createContext({
  state,el:id=>nodes[id],
  request:async url=>{requests.push(url);return {items:rows};},
  date:value=>String(value).slice(0,10),
  create:(tag,cls,value)=>({tag,cls,textContent:value,children:[],append(...nodes){this.children.push(...nodes);}})
 });
 vm.runInContext(js.slice(start,end)+';globalThis.load=loadRecentReplyActivity;',ctx);
 return {run:ctx.load,items,refresh,status,requests,state,panel};
}

test('V3.6.26: safe DOM links to only own server-returned question IDs',async()=>{
 const script=read('public/resuelve-v350.js');
 const input=[
  {id:'17',title:'<img src=x onerror=alert(1)>',answer_count:3,last_answer_at:'2026-10-30T20:00:00Z'},
  {id:'0',title:'Invalid',answer_count:2,last_answer_at:'2026-10-30T20:00:00Z'},
  {id:'18',title:'Empty',answer_count:0,last_answer_at:'2026-10-30T20:00:00Z'}
 ];
 const sim=simulateList(input);
 await sim.run();
 assert.deepEqual(sim.requests,['/api/resuelve/questions/mine/reply-activity']);
 assert.equal(sim.items.length,1);
 const link=sim.items[0].children[0];
 assert.equal(link.href,'/resuelve?id=17');
 assert.equal(link.textContent,input[0].title);
 assert.equal(link.tag,'a');
 assert.match(sim.status.textContent,/No significa que estén sin leer/);
 assert.equal(sim.refresh.disabled,false);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(script));
});

test('V3.6.26: guest access is disabled and empty response makes no invented claims',async()=>{
 const sim=simulateList([]);
 await sim.run();
 assert.equal(sim.items.length,0);
 assert.match(sim.status.textContent,/Todavía no hay respuestas visibles/);
 sim.state.user=null;
 await sim.run();
 assert.equal(sim.requests.length,1);
 const js=read('public/resuelve-v350.js');
 assert.match(js,/el\('myReplyActivityPanel'\)\.hidden=guest/);
 assert.match(js,/if\(guest\)\{el\('myReplyActivityPanel'\)\.open=false;el\('myReplyActivityList'\)\.replaceChildren\(\);\}/);
 assert.match(js,/bindRecentReplyActivity\(\)/);
 assert.match(js,/if\(panel.open&&state.user\)void loadRecentReplyActivity\(\)/);
 assert.match(js,/el\('refreshMyReplyActivity'\)\.addEventListener\('click'/);
 const method=js.slice(js.indexOf('async function loadRecentReplyActivity(){'),js.indexOf('function bindRecentReplyActivity(){'));
 assert.doesNotMatch(method,/write\(|sendEmail|localStorage|setInterval|notify/i);
});
