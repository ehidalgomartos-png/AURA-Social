'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const growth=fs.readFileSync(path.join(__dirname,'../src/routes/growth.js'),'utf8');
const social=fs.readFileSync(path.join(__dirname,'../public/social.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');

function routeHarness(profile){
  const start=growth.indexOf("router.get('/me', requireAuth");
  const end=growth.indexOf("router.get('/pulse'",start);
  assert.ok(start>=0&&end>start,'growth /me route missing');
  const sql=[];
  let handler;
  const router={get:(url,auth,fn)=>{assert.equal(url,'/me');handler=fn;}};
  const db={query:async(statement,params)=>{
    sql.push({statement,params});
    if(statement.includes('FROM referrals r'))return {rows:[{total:0,activated:0}]};
    if(statement.includes('FROM users u')&&statement.includes('u.id<>$1'))return {rows:[{id:41,username:'suggested_person'}]};
    return {rowCount:1,rows:[profile]};
  }};
  new Function('router','requireAuth','db','ensurePersonalInvite',
    growth.slice(start,end))(router,()=>{},db,async()=>({token:'test_invitation',open_count:0,join_count:0}));
  return {
    sql,
    async read(){
      let body;
      await handler({user:{id:7}},{json(value){body=value;},status(){throw Error('unexpected status');}});
      return body;
    }
  };
}
const baseUser={
 id:7,username:'new_member',display_name:'New Member',
 avatar_url:'',bio:'',created_at:new Date().toISOString(),
 interest_count:0,following_count:0,community_count:0,
 post_count:0,interaction_count:0
};

test('new member gets one clear first step, accurate zero progress and first-week hint',async()=>{
  const h=routeHarness(baseUser);
  const data=await h.read();
  assert.equal(data.progress,0);
  assert.equal(data.completed,0);
  assert.equal(data.totalSteps,6);
  assert.equal(data.nextStep.id,'avatar');
  assert.equal(data.nextStep.action,'profile');
  assert.equal(data.firstWeek,true);
  assert.equal(data.starterProfiles.length,1);
});

test('partially activated account gets first incomplete action and a real follow count',async()=>{
  const h=routeHarness({
    ...baseUser,created_at:'2024-01-01T10:00:00Z',
    avatar_url:'/uploads/avatar.jpg',interest_count:2,
    community_count:1,following_count:2,interaction_count:1
  });
  const data=await h.read();
  assert.equal(data.completed,4);
  assert.equal(data.progress,67);
  assert.equal(data.firstWeek,false);
  assert.equal(data.nextStep.id,'follow');
  assert.equal(data.nextStep.detail,'2 de 3 personas seguidas');
});

test('fully activated account has 100 percent progress and no artificial pending action',async()=>{
  const h=routeHarness({...baseUser,
    avatar_url:'/uploads/ok.jpg',bio:'Hola',following_count:4,
    community_count:1,post_count:1,interaction_count:1
  });
  const data=await h.read();
  assert.equal(data.completed,6);
  assert.equal(data.progress,100);
  assert.equal(data.nextStep,null);
  assert.equal(data.steps.find(step=>step.id==='follow').detail,'3 de 3 personas seguidas');
});

test('starter people recommendations retain block, mute, discoverability, and hidden-item boundaries',async()=>{
  const h=routeHarness(baseUser);await h.read();
  const starter=h.sql.find(x=>x.statement.includes('SELECT u.id,u.username,u.display_name,u.avatar_url,u.bio,u.creator_verified'));
  assert.ok(starter,'starter query exists');
  for(const pattern of [
    /u\.status='active'/,/u\.is_admin=false/,/u\.discoverable=true/,
    /NOT EXISTS\(SELECT 1 FROM blocks/,/NOT EXISTS\(SELECT 1 FROM mutes/,
    /NOT EXISTS\(SELECT 1 FROM discovery_hidden_items/,
    /h\.item_type='user'/,/u\.id<>\$1/
  ])assert.match(starter.statement,pattern);
  assert.deepEqual(starter.params,[7]);
});

function clientHarness(response){
  const node=()=>({textContent:'',innerHTML:'',attributes:{},
    classList:{classes:new Set(),add(name){this.classes.add(name);},remove(name){this.classes.delete(name);}},
    setAttribute(k,v){this.attributes[k]=v},
    style:{setProperty(k,v){this[k]=v}}
  });
  const nodes=Object.fromEntries([
    'growthProgressValue','growthProgressDescription','growthNextStep','growthSteps',
    'growthReferralTotal','growthReferralActivated','growthStarterPeople','growthInviteHint'
  ].map(k=>['#'+k,node()]));
  const heading=node(),copy=node(),ring=node();
  const panel=node();
  panel.querySelector=selector=>({
    '.growth-progress-ring':ring,
    '.growth-onboarding h2':heading,
    '.growth-onboarding .growth-heading p':copy
  })[selector]||null;
  nodes['#growthPanel']=panel;
  const $=query=>nodes[query]||null;
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const start=social.indexOf('function growthStepHTML(step) {');
  const end=social.indexOf('async function shareGrowthInvite(kind',start);
  assert.ok(start>=0&&end>start,'growth view renderer missing');
  const app=new Function('$','api','esc','personCardHTML','growthInviteUrl','me',
    social.slice(start,end)+'\nreturn {render:loadGrowthPanel,step:growthStepHTML};')(
    $,async()=>({r:{ok:true},d:response}),esc,
    item=>'<article>'+esc(item.username)+'</article>',
    ()=>'https://redlibertad.com/?invite=test',
    {username:'myuser'}
  );
  return {...app,nodes,panel,heading,copy,ring};
}

test('next action is displayed with a safe button and accurate accessible progress',async()=>{
  const route=routeHarness(baseUser);
  const response=await route.read();
  const ui=clientHarness(response);
  await ui.render();
  assert.equal(ui.nodes['#growthProgressValue'].textContent,'0%');
  assert.equal(ui.ring.attributes['aria-valuenow'],'0');
  assert.match(ui.nodes['#growthProgressDescription'].textContent,/0 de 6 pasos completados/);
  assert.match(ui.nodes['#growthNextStep'].innerHTML,/data-growth-action="profile"/);
  assert.match(ui.nodes['#growthNextStep'].innerHTML,/Añade una foto de perfil/);
});

test('completion state is clear and does not present a pending step',async()=>{
  const route=routeHarness({...baseUser,
    avatar_url:'ok',bio:'Hello',following_count:3,community_count:1,post_count:1,interaction_count:1
  });
  const response=await route.read();
  const ui=clientHarness(response);
  await ui.render();
  assert.equal(ui.ring.attributes['aria-valuenow'],'100');
  assert.match(ui.nodes['#growthNextStep'].innerHTML,/primeros pasos están completos/);
  assert.doesNotMatch(ui.nodes['#growthNextStep'].innerHTML,/data-growth-action/);
  assert.equal(ui.panel.classList.classes.has('growth-complete'),true);
});

test('unrecognized action from response never creates an executable action button',async()=>{
  const data={progress:0,steps:[{id:'test',label:'<svg onload=alert(1)>',done:false,action:'javascript:alert(1)'}],
    nextStep:{id:'test',label:'<img src=x>',action:'javascript:alert(1)'},firstWeek:false};
  const ui=clientHarness(data);
  await ui.render();
  assert.doesNotMatch(ui.nodes['#growthNextStep'].innerHTML,/javascript:alert/);
  assert.doesNotMatch(ui.nodes['#growthNextStep'].innerHTML,/<img/);
  assert.doesNotMatch(ui.nodes['#growthSteps'].innerHTML,/<svg/);
});

test('activation layout exposes real progress state and live next step to accessibility tools',()=>{
  assert.match(html,/id="growthProgressDescription"[^>]*aria-live="polite"/);
  assert.match(html,/id="growthNextStep"[^>]*aria-live="polite"/);
  assert.match(html,/class="growth-progress-ring" role="progressbar"/);
  assert.match(social,/ring\.setAttribute\('aria-valuenow',String\(progress\)\)/);
});

test('activation relies on existing steps and does not require sending invitations',async()=>{
  const data=(await routeHarness(baseUser).read());
  assert.equal(data.steps.length,6);
  assert.equal(data.steps.some(step=>step.action==='invite'),false);
  assert.equal(data.nextStep.action,'profile');
});
