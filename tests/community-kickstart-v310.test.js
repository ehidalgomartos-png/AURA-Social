'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const js=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');
const communityRoutes=read('src/routes/communities.js');
const start=js.indexOf('// V3.1.0 — organic community kickstart;');
const end=js.indexOf("let growthInviteCode = '';",start);
assert.ok(start>=0&&end>start,'V3.1 community starter implementation found');

function harness(api=async()=>({r:{ok:true},d:{communities:[]}})){
  const classes=new Set(['hidden']),events={},calls=[];
  const section={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};
  const list={
    innerHTML:'',replaceChildren(){this.innerHTML='';},
    addEventListener:(name,fn)=>{events[name]=fn;},
    contains:()=>true
  };
  const escape=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const ctx={
    $:q=>q==='#growthStarterCommunities'?section:q==='#growthStarterCommunityList'?list:null,
    api:async q=>{calls.push(['api',q]);return api(q);},
    esc:escape,showView:x=>calls.push(['view',x]),
    openCommunityDetail:async id=>calls.push(['open',id])
  };
  const source=js.slice(start,end)+'\n({load:loadStarterCommunities,card:growthCommunityCardHTML})';
  const app=vm.runInNewContext(source,ctx);
  return {app,section,list,classes,events,calls};
}
function community(x={}){
  return {id:31,name:'Cine y libros',description:'Conversaciones para compartir historias',
    reason:'Intereses compartidos',privacy:'public',member_count:3,...x};
}
function deferred(){
  let resolve;
  const promise=new Promise(r=>resolve=r);
  return {promise,resolve};
}
test('first-community area appears only within existing Home onboarding',()=>{
  const homeStart=html.indexOf('id="growthPanel"');
  const homeEnd=html.indexOf('id="growthInviteHint"',homeStart);
  const area=html.slice(homeStart,homeEnd);
  assert.ok(homeStart>=0&&homeEnd>homeStart);
  assert.match(area,/id="growthStarterCommunities" class="growth-community-starter hidden"/);
  assert.match(area,/id="growthStarterCommunityList"/);
  assert.match(area,/data-growth-action="communities"/);
});
test('new users receive at most 3 recommendations with meaningful reasons',async()=>{
  const h=harness(async()=>({r:{ok:true},d:{communities:[community(),community({id:32}),community({id:33}),community({id:34})]}}));
  await h.app.load(true);
  assert.equal((h.list.innerHTML.match(/data-growth-community-open=/g)||[]).length,3);
  assert.ok(h.list.innerHTML.includes('Intereses compartidos'));
  assert.equal(h.classes.has('hidden'),false);
  assert.deepEqual(h.calls,[['api','/api/communities/discover?mode=recommended']]);
});
test('a user already in a community never sees a starter recommendation',async()=>{
  const h=harness();
  await h.app.load(false);
  assert.equal(h.classes.has('hidden'),true);
  assert.equal(h.list.innerHTML,'');
  assert.equal(h.calls.length,0);
});
test('starter follows authentic existing six-step community task',()=>{
  assert.match(js,/loadStarterCommunities\(steps\.some\(step=>step\?\.id==='community' && step\.done!==true\)\)/);
  const growth=read('src/routes/growth.js');
  assert.match(growth,/id:'community'/);
  assert.match(growth,/community_count\|\|0\)>=1/);
  assert.doesNotMatch(js.slice(start,end),/\/join['"\`]|method:'POST'/);
});
test('recommendation texts are escaped before inserting HTML',()=>{
  const h=harness();
  const output=h.app.card(community({
    id:11,
    name:'<img src=x onerror=alert(1)>',
    description:'<svg onload=alert(1)>',
    reason:'<script>bad</script>'
  }));
  assert.doesNotMatch(output,/<img|<svg|<script/);
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('&lt;svg'));
  assert.ok(output.includes('&lt;script'));
});
test('invalid identifiers are rejected, including malicious attributes',()=>{
  const h=harness();
  for(const id of ['1" onclick="alert(1)',0,'-1',null,'999999999999999999999','3;DROP']){
    assert.equal(h.app.card(community({id})), '');
  }
  assert.ok(h.app.card(community({id:'42'})).includes('data-growth-community-open="42"'));
});
test('private communities are labelled accurately and do not auto-join',()=>{
  const h=harness();
  const output=h.app.card(community({privacy:'private'}));
  assert.match(output,/Privada · requiere aprobación/);
  assert.match(output,/Ver comunidad/);
  assert.doesNotMatch(output,/data-join|data-request-join/);
});
test('plural counters display single member correctly without inventing engagement',()=>{
  const h=harness();
  assert.match(h.app.card(community({member_count:1})),/1 miembro/);
  assert.match(h.app.card(community({member_count:2})),/2 miembros/);
  assert.doesNotMatch(h.app.card(community({member_count:0})),/1 miembro/);
});
test('empty results offer exploring existing communities instead of fake suggestions',async()=>{
  const h=harness();
  await h.app.load(true);
  assert.match(h.list.innerHTML,/Todavía no hay recomendaciones/);
  assert.equal(h.classes.has('hidden'),false);
});
test('API errors are handled without leaking diagnostics or crashing',async()=>{
  const h=harness(async()=>{throw Error('postgres_secret');});
  await h.app.load(true);
  assert.match(h.list.innerHTML,/No se pudieron cargar/);
  assert.doesNotMatch(h.list.innerHTML,/postgres_secret/);
});
test('an old pending request cannot overwrite a newly joined user state',async()=>{
  const request=deferred();
  const h=harness(()=>request.promise);
  const pending=h.app.load(true);
  await h.app.load(false);
  request.resolve({r:{ok:true},d:{communities:[community()]}});
  await pending;
  assert.equal(h.classes.has('hidden'),true);
  assert.equal(h.list.innerHTML,'');
});
test('older asynchronous response cannot replace a newer result',async()=>{
  const first=deferred(),second=deferred();
  let n=0;
  const h=harness(()=>++n===1?first.promise:second.promise);
  const a=h.app.load(true),b=h.app.load(true);
  second.resolve({r:{ok:true},d:{communities:[community({id:44,name:'Nueva'})]}});
  await b;
  first.resolve({r:{ok:true},d:{communities:[community({id:45,name:'Vieja'})]}});
  await a;
  assert.match(h.list.innerHTML,/Nueva/);
  assert.doesNotMatch(h.list.innerHTML,/Vieja/);
});
test('tapping a recommendation opens the existing community detail, never joins by itself',async()=>{
  const h=harness();
  let prevented=0;
  await h.events.click({
    target:{closest:()=>({dataset:{growthCommunityOpen:'31'}})},
    currentTarget:h.list,
    preventDefault:()=>prevented++
  });
  assert.equal(prevented,1);
  assert.deepEqual(h.calls,[['view','communities'],['open','31']]);
});
test('invalid card clicks do not navigate or send backend requests',async()=>{
  const h=harness();
  await h.events.click({
    target:{closest:()=>({dataset:{growthCommunityOpen:'-2'}})},
    currentTarget:h.list,
    preventDefault:()=>{throw Error('invalid id must do nothing');}
  });
  assert.equal(h.calls.length,0);
});
test('existing discovery endpoint owns block, mute, membership and hidden item filters',()=>{
  const from=communityRoutes.indexOf("router.get('/discover'");
  const to=communityRoutes.indexOf("router.post('/discover/:communityId/hide'",from);
  const route=communityRoutes.slice(from,to);
  assert.ok(from>=0&&to>from);
  for(const pattern of [
    /router\.use\(requireAuth\)/,/owner\.status='active'/,
    /NOT EXISTS\(\s*SELECT 1 FROM community_members mine/,
    /NOT EXISTS\(\s*SELECT 1 FROM community_hidden_suggestions hidden/,
    /NOT EXISTS\(\s*SELECT 1 FROM blocks b/,
    /NOT EXISTS\(\s*SELECT 1 FROM mutes m/
  ])assert.match(pattern.source.includes('router\\.use')?communityRoutes:route,pattern);
});
test('new community starter uses readable responsive cards and accessible touch targets',()=>{
  assert.match(css,/\.growth-community-starter-list\{display:grid;grid-template-columns:repeat\(2/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.growth-community-starter-list\{grid-template-columns:1fr\}/);
  assert.match(css,/\.growth-community-card:focus-visible/);
  assert.match(css,/\.growth-community-starter \.tiny-action\{min-height:44px\}/);
});
test('V3.1 compatibility suite stays active on V3.2.0',()=>{
  const pkg=require('../package.json');
  assert.equal(pkg.version,'3.2.2');
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.2'/);
  assert.match(pkg.scripts['test:community-kickstart'],/community-kickstart-v310/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:community-kickstart/);
});
