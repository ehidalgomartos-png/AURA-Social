'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {canOfferConversation,HOUR}=require('../src/services/participation-v32152');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const growth=read('src/routes/growth.js'),social=read('public/social.js');
const html=read('public/app.html'),css=read('public/social.css');
const now=Date.parse('2026-10-26T12:00:00Z');
const iso=ago=>new Date(now-ago*HOUR).toISOString();

test('only members returning after at least 24h who have published may see conversation suggestion',()=>{
 assert.equal(canOfferConversation({lastHomeSeenAt:iso(25),hasPublishedPosts:true},now),true);
 assert.equal(canOfferConversation({lastHomeSeenAt:iso(23),hasPublishedPosts:true},now),false);
 assert.equal(canOfferConversation({lastHomeSeenAt:iso(25),hasPublishedPosts:false},now),false);
 assert.equal(canOfferConversation({lastHomeSeenAt:null,hasPublishedPosts:true},now),false);
 assert.equal(canOfferConversation({lastHomeSeenAt:new Date(now+HOUR).toISOString(),hasPublishedPosts:true},now),false);
});

test('72h cooldown and 7 day snooze are enforced, including on multiple devices via server state',()=>{
 const data={lastHomeSeenAt:iso(25),hasPublishedPosts:true};
 assert.equal(canOfferConversation({...data,lastPromptAt:iso(71)},now),false);
 assert.equal(canOfferConversation({...data,lastPromptAt:iso(74)},now),true);
 assert.equal(canOfferConversation({...data,snoozedUntil:new Date(now+7*24*HOUR).toISOString()},now),false);
 assert.equal(canOfferConversation({...data,snoozedUntil:iso(2)},now),true);
 assert.equal(canOfferConversation({...data,lastPromptAt:new Date(now+HOUR).toISOString()},now),false);
});

function selector(){
 const a=social.indexOf('function selectReturnConversationV32152(');
 const b=social.indexOf('function renderReturnConversationV32152(',a);
 assert.ok(a>0&&b>a);
 const sandbox={Date,Number,String,Array};
 vm.runInNewContext(social.slice(a,b)+'\nthis.choose=selectReturnConversationV32152;',sandbox);
 return sandbox.choose;
}
const pick=selector();
function post(id,patch={}){
 return {id,user_id:19,caption:'Una pregunta sincera para compartir distintas opiniones en la comunidad.',
   created_at:iso(4),content_level:'normal',audience:'public',post_kind:'post',
   liked_by_me:false,display_name:'Persona real',...patch};
}

test('only an existing, public, normal, recent, authorized-feed post may be offered',()=>{
 assert.equal(pick([post(11)],3,now)?.id,11);
 const invalid=[
 post(1,{user_id:3}),
 post(2,{liked_by_me:true}),
 post(3,{content_level:'sensitive'}),
 post(4,{audience:'vip'}),
 post(5,{post_kind:'reel'}),
 post(6,{created_at:iso(24*8)}),
 post(7,{created_at:new Date(now+HOUR).toISOString()}),
 post(8,{caption:'Hola'}),
 post('id','malicioso'),
 ];
 assert.equal(pick(invalid,3,now),null);
 assert.equal(pick([],3,now),null);
 assert.equal(pick(null,3,now),null);
});

test('selects first eligible recent post without artificially ranking by engagement',()=>{
 const p=pick([post(1,{caption:'Breve'}),post(2),post(3)],3,now);
 assert.equal(p.id,2);
 const a=social.indexOf('function selectReturnConversationV32152(');
 const b=social.indexOf('function renderReturnConversationV32152(',a);
 assert.doesNotMatch(social.slice(a,b),/like_count|ORDER BY|Math\.random|likes.*DESC/);
});

test('renders only escaped text through textContent and opens post using existing visibility checks',()=>{
 const a=social.indexOf('function renderReturnConversationV32152(');
 const b=social.indexOf("$('#returnConversationOpenV32152')?",a);
 assert.ok(a>0&&b>a);
 const classes=new Set(['hidden']);
 const el={
  '#returnConversationV32152':{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},
  '#returnConversationTitleV32152':{textContent:''},
  '#returnConversationExcerptV32152':{textContent:''}
 };
 const sandbox={$:key=>el[key]||null,String};
 vm.runInNewContext('let returnConversationPostV32152=null;\n'+social.slice(a,b)+
    '\nthis.render=renderReturnConversationV32152;',sandbox);
 assert.equal(sandbox.render(post(11,{caption:'<script>alert(1)</script> Ejemplo de texto largo para una conversación respetuosa.'})),true);
 assert.equal(classes.has('hidden'),false);
 assert.match(el['#returnConversationExcerptV32152'].textContent,/^<script>/);
 assert.equal(sandbox.render(null),false);
 assert.equal(classes.has('hidden'),true);
 assert.match(social,/await openPostFocus\(id\)/);
 assert.match(social,/const match=selectReturnConversationV32152\(feed\.d\?\.posts,me\.id\)/);
 assert.match(social,/d\.participation\?\.can_show===true/);
});

test('the existing return summary remains single and opt-in, with persisted snooze and appearance',()=>{
 assert.match(html,/id="returnPulse" class="return-pulse hidden"/);
 assert.match(html,/id="returnConversationV32152"[^>]*hidden/);
 assert.match(html,/id="returnConversationOpenV32152"/);
 assert.match(html,/id="returnConversationSnoozeV32152"/);
 assert.equal((html.match(/id="returnConversationV32152"/g)||[]).length,1);
 assert.match(growth,/ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_shown_at/);
 assert.match(growth,/ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_snoozed_until/);
 const routes=growth.slice(growth.indexOf("router.post('/pulse/conversation-shown'"),growth.indexOf("router.post('/pulse/seen'"));
 assert.match(routes,/requireAuth/);
 assert.match(routes,/WHERE user_id=\$1/);
 assert.match(routes,/interval '72 hours'/);
 assert.match(routes,/interval '7 days'/);
 assert.doesNotMatch(routes,/INSERT INTO notifications|sendEmail|sendPush|sendMail|setTimeout|setInterval/i);
 assert.match(social,/api\('\/api\/growth\/pulse\/conversation-shown',\{method:'POST'\}\)/);
 assert.match(social,/api\('\/api\/growth\/pulse\/conversation-snooze',\{method:'POST'\}\)/);
});

test('mobile styles keep a compact accessible action without extra above-the-feed clutter',()=>{
 const patch=css.slice(css.indexOf('/* V3.2.152'));
 assert.match(patch,/@media\(max-width:760px\)/);
 assert.match(patch,/grid-template-columns:minmax\(0,1fr\) auto/);
 assert.match(patch,/min-height:42px/);
 assert.match(patch,/@media\(max-width:350px\)/);
 assert.match(patch,/overflow-wrap:anywhere/);
 assert.match(html,/No se publica nada por ti/);
 assert.match(social,/section\.classList\.toggle\('hidden',cards\.length===0&&!hasConversation\)/);
});
