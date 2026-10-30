'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('V3.6.25: direct help is a visible action, not a login or a commercial CTA',()=>{
 const html=read('public/resuelve.html'),css=read('public/resuelve-v350.css');
 const hero=html.slice(html.indexOf('<section class="hero"'),html.indexOf('</section>',html.indexOf('<section class="hero"')));
 assert.match(hero,/id="helpOthersButton" type="button" class="secondary hero-help-action">Quiero ayudar a otras personas/);
 assert.ok(hero.indexOf('id="viewQuestionsLink"')<hero.indexOf('id="helpOthersButton"'));
 assert.ok(hero.indexOf('id="helpOthersButton"')<hero.indexOf('href="#solutions"'));
 assert.doesNotMatch(hero,/id="helpOthersButton"[^>]*hidden/);
 const block=css.slice(css.indexOf('/* V3.6.25 — acceso directo'),css.indexOf('/* V3.6.23 — Resuelve Desktop:'));
 assert.match(block,/\.hero-actions \.hero-help-action\{/);
 assert.match(block,/grid-column:1\/-1/);
 assert.match(block,/min-height:46px/);
 assert.match(block,/@media\(max-width:650px\)/);
 assert.match(block,/min-height:44px/);
 assert.match(block,/\.resuelve-help-suggestion \.resuelve-help-suggestion-cta/);
 assert.doesNotMatch(block,/display:none|visibility:hidden|position:fixed/);
});

function simulateDirectHelp(user,topics,hiddenTarget=false){
 const script=read('public/resuelve-v350.js');
 const start=script.indexOf('  // V3.6.25 — acceder rápidamente a las preguntas donde se puede ayudar.');
 const end=script.indexOf("  for(const btn of document.querySelectorAll('[data-filter]'))",start);
 assert.ok(start>=0&&end>start);
 const visited=[];
 let clickCallback;
 const button={addEventListener:(type,callback)=>{assert.equal(type,'click');clickCallback=callback;}};
 const target={hidden:hiddenTarget,click:()=>visited.push('click'),focus:options=>visited.push('focus:'+String(options.preventScroll))};
 const section={scrollIntoView:options=>visited.push('scroll:'+options.block+':'+options.behavior)};
 const context=vm.createContext({
  el:id=>id==='helpOthersButton'?button:id==='questions'?section:null,
  state:{user,helpTopics:topics},
  document:{querySelector:selector=>{
   visited.push('select:'+selector);
   return target;
  }}
 });
 vm.runInContext(script.slice(start,end),context);
 assert.equal(typeof clickCallback,'function');
 clickCallback();
 return visited;
}
test('V3.6.25: visitors discover unanswered public questions, without forced signup',()=>{
 assert.deepEqual(simulateDirectHelp(null,[]),[
  'select:[data-filter="unanswered"]','click','scroll:start:auto','focus:true'
 ]);
 const script=read('public/resuelve-v350.js');
 const flow=script.slice(script.indexOf('  // V3.6.25 — acceder rápidamente'),script.indexOf("  for(const btn of document.querySelectorAll('[data-filter]'))",script.indexOf('  // V3.6.25 — acceder rápidamente')));
 assert.doesNotMatch(flow,/openAuth\(|write\(|fetch\(|sendEmail|window\.open|localStorage/i);
});
test('V3.6.25: helpers with selected preferences reach personalized open questions',()=>{
 assert.deepEqual(simulateDirectHelp({id:5},['consejo','ayuda']),[
  'select:[data-filter="help"]','click','scroll:start:auto','focus:true'
 ]);
});
test('V3.6.25: people without chosen preferences can start helping immediately',()=>{
 assert.deepEqual(simulateDirectHelp({id:5},[]),[
  'select:[data-filter="unanswered"]','click','scroll:start:auto','focus:true'
 ]);
 const hidden=simulateDirectHelp(null,[],true);
 assert.deepEqual(hidden,['select:[data-filter="unanswered"]']);
});
test('V3.6.25: helper choices are scoped to the authenticated user and real questions',()=>{
 const js=read('public/resuelve-v350.js');
 const start=js.indexOf('async function loadHelpSuggestions()');
 const end=js.indexOf('async function loadHelpAlerts()',start);
 assert.ok(start>=0&&end>start);
 const block=js.slice(start,end);
 assert.match(block,/if\(!state\.user\)return/);
 assert.match(block,/const currentUserId=String\(state\.user\.id\?\?''\)/);
 assert.equal((block.match(/String\(state\.user\.id\?\?''\)!==currentUserId/g)||[]).length,2);
 assert.match(block,/state\.helpTopics=selected\.filter\(category=>Object\.prototype\.hasOwnProperty\.call\(categories,category\)\)/);
 assert.match(block,/if\(!selected\.length\)return/);
 assert.match(block,/request\('\/api\/resuelve\/questions\/for-me'\)/);
 assert.match(block,/q\.status==='open'&&selected\.includes\(q\.category\)/);
 assert.match(block,/matches\.slice\(0,3\)/);
 assert.match(block,/const action=create\('a','resuelve-help-suggestion-cta','Leer y ayudar'\)/);
 assert.match(block,/action\.href=link\.href/);
 assert.doesNotMatch(block,/sendEmail|notify|write\(|api\/posts/i);
 const api=read('src/routes/resuelve-v350.js');
 assert.match(api,/router\.get\('\/questions\/for-me',requireAuth/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/WHERE q\.status='open' AND q\.author_id<>\$1/);
 assert.match(service,/JOIN users u ON u\.id=q\.author_id AND u\.status='active'/);
});
test('V3.6.25: guests can open and read before choosing to create an account',()=>{
 const js=read('public/resuelve-v350.js');
 assert.match(js,/if\(!state\.user&&!solved\)\{/);
 assert.match(js,/button\('Crear cuenta para ayudar',\(\)=>openAuth\('register'\)/);
 assert.match(js,/button\('Ya tengo cuenta',\(\)=>openAuth\('login'\)/);
 assert.match(js,/form\.hidden=!\(state\.user&&!mine&&!solved\)/);
});
