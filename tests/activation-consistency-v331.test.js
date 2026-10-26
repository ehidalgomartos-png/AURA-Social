'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {nextWelcomeStep,welcomeEligibility,welcomeVisible}=require('../src/services/welcome-v32150');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const route=read('src/routes/growth.js'),adminGrowth=read('src/routes/admin-growth-v219.js');
const base={id:12,username:'new_member',created_at:new Date().toISOString(),status:'active',
  is_admin:false,avatar_url:'/media/avatar.png',bio:'',interest_count:0,
  following_count:0,community_count:0,post_count:0,interaction_count:0};
async function onboarding(profile){
  const begin=route.indexOf("router.get('/me', requireAuth");
  const end=route.indexOf('// A one-time welcome',begin);
  assert.ok(begin>=0&&end>begin);
  const queries=[];let handler;
  const router={get:(p,auth,fn)=>{assert.equal(p,'/me');handler=fn;}};
  const db={query:async(sql)=>{
    queries.push(sql);
    if(sql.includes('FROM referrals r'))return {rows:[{total:0,activated:0}]};
    if(sql.includes('FROM user_welcome_state_v32150'))return {rowCount:0,rows:[]};
    if(sql.includes('u.id<>$1'))return {rows:[]};
    return {rowCount:1,rows:[profile]};
  }};
  new Function('router','requireAuth','db','ensurePersonalInvite','welcomeEligibility','welcomeVisible','nextWelcomeStep',
    route.slice(begin,end))(router,()=>{},db,async()=>({token:'test',open_count:0,join_count:0}),
      welcomeEligibility,welcomeVisible,nextWelcomeStep);
  let data;
  await handler({user:{id:12}},{json:x=>{data=x;},status:()=>{throw Error('unexpected status');}});
  return {data,queries};
}
const step=(data,id)=>data.steps.find(x=>x.id===id);
test('bio alone and interests alone do not overstate a finished profile',async()=>{
  for(const profile of [{...base,bio:'Hola RedLibertad'},{...base,interest_count:2}]){
    const {data}=await onboarding(profile);
    assert.equal(step(data,'profile').done,false);
    assert.equal(data.completed,1);
    assert.equal(data.welcome.nextStep.id,'profile');
  }
});
test('avatar, presentation and interests match growth center completion',async()=>{
  const {data}=await onboarding({...base,bio:'Me gusta la fotografía',interest_count:1});
  assert.equal(step(data,'avatar').done,true);
  assert.equal(step(data,'profile').done,true);
  assert.equal(step(data,'post').done,false);
  assert.equal(data.welcome.nextStep.id,'post');
  assert.equal(data.progress,33);
});
test('only ordinary published posts complete the first post and welcome gate',async()=>{
  const {data,queries}=await onboarding(base);
  assert.equal(step(data,'post').done,false);
  assert.match(queries.find(sql=>sql.includes('post_count')),/p\.moderation_status='published' AND p\.post_kind='post'\) post_count/);
  const welcome=route.slice(route.indexOf("router.post('/welcome/activate'"),route.indexOf("router.post('/welcome/preference'"));
  assert.match(welcome,/NOT EXISTS\(SELECT 1 FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published' AND p.post_kind='post'\)/);
  assert.match(adminGrowth,/first_post\.moderation_status='published' AND first_post\.post_kind='post'/);
});
test('one genuine first post advances unchanged existing steps',async()=>{
  const {data}=await onboarding({...base,bio:'Hola',interest_count:1,post_count:1});
  assert.equal(step(data,'post').done,true);
  assert.equal(data.welcome.nextStep.id,'follow');
  assert.equal(data.steps.length,6);
  assert.equal((read('public/app.html').match(/id="homeWelcomeV32150"/g)||[]).length,1);
  assert.match(read('.github/workflows/validate-js.yml'),/activation-consistency-v331\.test\.js/);
});
