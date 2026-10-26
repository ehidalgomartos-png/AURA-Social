'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {nextWelcomeStep,welcomeEligibility,welcomeVisible,DAY}=require('../src/services/welcome-v32150');
const read=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
const route=read('src/routes/growth.js'),html=read('public/app.html'),js=read('public/social.js'),css=read('public/social.css');
const steps=[
 {id:'avatar',done:false,action:'profile'},
 {id:'profile',done:false,action:'profile'},
 {id:'follow',done:false,action:'explore'},
 {id:'community',done:false,action:'communities'},
 {id:'post',done:false,action:'create'},
 {id:'interact',done:false,action:'feed'}
];

test('welcome prioritizes profile and first post without inventing activity',()=>{
 assert.equal(nextWelcomeStep(steps).id,'post');
 const avatarComplete=steps.map(step=>({...step,done:['avatar','profile'].includes(step.id)}));
 assert.equal(nextWelcomeStep(avatarComplete).id,'post');
 const onlyFollow=steps.map(step=>({...step,done:step.id!=='follow'}));
 assert.equal(nextWelcomeStep(onlyFollow).id,'follow');
 assert.equal(nextWelcomeStep(steps.map(step=>({...step,done:true}))),null);
});

test('new signups and older accounts without posts are eligible; established active and complete are not',()=>{
 const now=Date.parse('2026-10-26T12:00:00Z');
 const recent={created_at:new Date(now-2*DAY).toISOString(),post_count:1,status:'active',is_admin:false};
 const older={created_at:new Date(now-365*DAY).toISOString(),post_count:0,status:'active',is_admin:false};
 assert.equal(welcomeEligibility(recent,steps,now),true);
 assert.equal(welcomeEligibility(older,steps,now),true);
 assert.equal(welcomeEligibility({...older,post_count:20},steps,now),false);
 assert.equal(welcomeEligibility({...recent,is_admin:true},steps,now),false);
 assert.equal(welcomeEligibility(recent,steps.map(step=>({...step,done:true})),now),false);
 assert.equal(welcomeEligibility({...recent,status:'suspended'},steps,now),false);
});

test('snooze seven days and dismissal are durable visibility controls',()=>{
 const now=Date.parse('2026-10-26T12:00:00Z');
 assert.equal(welcomeVisible(true,null,now),true);
 assert.equal(welcomeVisible(true,{snoozed_until:new Date(now+7*DAY).toISOString()},now),false);
 assert.equal(welcomeVisible(true,{snoozed_until:new Date(now-DAY).toISOString()},now),true);
 assert.equal(welcomeVisible(true,{dismissed_at:new Date(now-DAY).toISOString()},now),false);
 assert.equal(welcomeVisible(false,null,now),false);
});

test('server creates a one-time in-app welcome per eligible user, no mass mail, with persistent snooze',()=>{
 const text=route.slice(route.indexOf("router.post('/welcome/activate'"),route.indexOf("router.get('/pulse'"));
 assert.match(route,/CREATE TABLE IF NOT EXISTS user_welcome_state_v32150/);
 assert.match(route,/user_id BIGINT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(text,/router\.post\('\/welcome\/activate',requireAuth/);
 assert.match(text,/NOT EXISTS\(SELECT 1 FROM posts p WHERE p.user_id=u.id AND p.moderation_status='published' AND p.post_kind='post'\)/);
 assert.match(text,/u\.status='active' AND u\.is_admin=false/);
 assert.match(text,/ON CONFLICT \(user_id\) DO NOTHING/);
 assert.match(text,/INSERT INTO notifications\(user_id,actor_id,type,entity_type,entity_id,text\)/);
 assert.match(text,/SELECT user_id,NULL,'system','welcome',NULL/);
 assert.match(text,/router\.post\('\/welcome\/preference',requireAuth/);
 assert.match(text,/\['later','dismiss'\]\.includes\(choice\)/);
 assert.match(text,/interval '7 days'/);
 assert.match(text,/user_welcome_state_v32150\.dismissed_at IS NOT NULL/);
 assert.doesNotMatch(text,/sendEmail|resend|fetch\(|MESSAGE_EMAIL|INSERT INTO email_/i);
});

test('the old detailed checklist remains and the welcome banner has real accessible actions',()=>{
 assert.match(html,/id="homeWelcomeV32150"[^>]*aria-label="Bienvenida y primeros pasos"/);
 assert.match(html,/id="homeWelcomeActionV32150"[^>]*data-growth-action="profile"/);
 assert.match(html,/id="homeWelcomeMoreV32150"/);
 assert.match(html,/data-welcome-preference="later"/);
 assert.match(html,/data-welcome-preference="dismiss"/);
 assert.match(html,/id="homeGrowthDetailsV3224"/);
 assert.match(html,/id="growthSteps"/);
 assert.match(js,/renderHomeWelcomeV32150\(d\)/);
 assert.match(js,/api\('\/api\/growth\/welcome\/activate',\{method:'POST'\}\)/);
 assert.match(js,/welcomeActivationUserV32150!==String\(me\?\.id\)/);
 assert.match(js,/await saveWelcomePreferenceV32150\(welcomePreference\.dataset\.welcomePreference\)/);
 assert.match(js,/if\(type==='system' && entityType==='welcome'\)/);
 assert.match(css,/@media\(max-width:760px\)\{\s*#feedView \.home-welcome-v32150/);
});

test('personalized banner matches action and protects against invalid actions',()=>{
 const start=js.indexOf('function renderHomeWelcomeV32150(data){');
 const end=js.indexOf('async function saveWelcomePreferenceV32150(',start);
 assert.ok(start>0&&end>start);
 const classNames=new Set(['hidden']),fields={};
 for(const id of ['homeWelcomeV32150','homeWelcomeTitleV32150','homeWelcomeCopyV32150','homeWelcomeActionV32150']){
   fields['#'+id]={textContent:'',dataset:{},classList:{add:c=>classNames.add(c),remove:c=>classNames.delete(c)}};
 }
 const ctx={$:key=>fields[key]||null,Set,Number};
 vm.runInNewContext(js.slice(start,end)+'\nthis.render=renderHomeWelcomeV32150;',ctx);
 ctx.render({firstWeek:true,welcome:{visible:true,nextStep:{id:'post',action:'create'}}});
 assert.equal(fields['#homeWelcomeActionV32150'].textContent,'Escribir mi post');
 assert.equal(fields['#homeWelcomeActionV32150'].dataset.growthAction,'create');
 assert.equal(classNames.has('hidden'),false);
 ctx.render({firstWeek:true,welcome:{visible:true,nextStep:{id:'post',action:'external'}}});
 assert.equal(classNames.has('hidden'),true);
 ctx.render({welcome:{visible:false,nextStep:{id:'post',action:'create'}}});
 assert.equal(classNames.has('hidden'),true);
});
