'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
const growth=read('src/routes/growth.js');
const html=read('public/app.html');

function select(now=Date.parse('2026-10-26T12:00:00Z')){
  const start=social.indexOf('function selectReturnConversationV32152(');
  const end=social.indexOf('function renderReturnConversationV32152(',start);
  assert.ok(start>0&&end>start);
  const sandbox={Date,Array,String,Number};
  vm.runInNewContext(social.slice(start,end)+'\nthis.select=selectReturnConversationV32152;',sandbox);
  return {choose:sandbox.select,now};
}
function post(id,now){
  return {id,user_id:23,caption:'¿Qué opináis sobre una conversación útil y respetuosa en RedLibertad?',
    created_at:new Date(now-2*3600000).toISOString(),content_level:'normal',audience:'public',
    post_kind:'post',liked_by_me:false};
}
test('elige una publicación distinta a la última recomendada, sin olvidar las reglas de privacidad V3.2.152',()=>{
  const {choose,now}=select();
  const posts=[post(12,now),post(13,now)];
  assert.equal(choose(posts,3,now,null).id,12);
  assert.equal(choose(posts,3,now,'12').id,13);
  assert.equal(choose([post(12,now)],3,now,12),null);
  assert.equal(choose([post(12,now),{...post(13,now),audience:'vip'}],3,now,12),null);
  assert.equal(choose([{...post(12,now),user_id:3},post(13,now)],3,now,null)?.id,13);
});

function clickHarness(detail){
  const handlers={};
  const button={disabled:false};
  const calls=[];
  const codeStart=social.indexOf("$('#returnConversationOpenV32152')?.addEventListener('click'");
  const codeEnd=social.indexOf("$('#returnConversationSnoozeV32152')?.addEventListener('click'",codeStart);
  assert.ok(codeStart>0&&codeEnd>codeStart);
  const sandbox={
    $:selector=>selector==='#returnConversationOpenV32152'
      ? {addEventListener:(type,fn)=>{handlers[type]=fn;}}
      : {children:[],classList:{add:name=>calls.push('hide:'+name)}},
    api:async path=>{calls.push('GET:'+path);return detail;},
    openComments:async (id,opts)=>calls.push('comments:'+id+':'+opts.focusComposer+':'+opts.initialPosition),
    renderReturnConversationV32152:post=>calls.push('render:'+post),
    toast:text=>calls.push('toast:'+text),
    encodeURIComponent,
    String,
    returnConversationPostV32152:{id:12}
  };
  vm.runInNewContext(social.slice(codeStart,codeEnd),sandbox);
  return {calls,button,click:()=>handlers.click({currentTarget:button})};
}
test('Ver y comentar comprueba que la publicación sigue visible y entra directamente a comentarios',async()=>{
  const h=clickHarness({r:{ok:true},d:{post:{id:12,audience:'public',content_level:'normal'}}});
  await h.click();
  assert.deepEqual(h.calls,['GET:/api/posts/detail/12','comments:12:false:start']);
  assert.equal(h.button.disabled,false);
});
test('si la publicación se eliminó o dejó de ser pública no abre comentarios',async()=>{
  for(const response of [
    {r:{ok:false},d:{}},
    {r:{ok:true},d:{post:{id:12,audience:'vip',content_level:'normal'}}},
    {r:{ok:true},d:{post:{id:13,audience:'public',content_level:'normal'}}},
    {r:{ok:true},d:{post:{id:12,audience:'public',content_level:'sensitive'}}}
  ]){
    const h=clickHarness(response);
    await h.click();
    assert.equal(h.calls.some(call=>call.startsWith('comments:')),false);
    assert.equal(h.calls.some(call=>call.startsWith('toast:')),true);
    assert.equal(h.button.disabled,false);
  }
});

test('GET incluye última publicación ofrecida y la reclama antes de mostrarla',()=>{
  assert.match(growth,/ALTER TABLE user_experience_state ADD COLUMN IF NOT EXISTS participation_prompt_post_id BIGINT/);
  assert.match(growth,/last_post_id:state\.rows\[0\]\?\.participation_prompt_post_id \|\| null/);
  assert.match(social,/selectReturnConversationV32152\(feed\.d\?\.posts,me\.id,Date\.now\(\),d\.participation\?\.last_post_id,triedIds\)/);
  const segment=social.slice(social.indexOf('if(d.participation?.can_show===true'),social.indexOf("section.classList.toggle('hidden',cards.length===0&&!hasConversation)"));
  const claim=segment.indexOf("const claimed=await api('/api/growth/pulse/conversation-shown'");
  const render=segment.indexOf('hasConversation=renderReturnConversationV32152(match)');
  assert.ok(claim>=0 && render>claim);
  assert.match(segment,/claimed\.r\.ok && claimed\.d\?\.recorded===true/);
  assert.match(segment,/body:JSON\.stringify\(\{postId:match\.id\}\)/);
  assert.doesNotMatch(segment,/openPostFocus\(/);
});
test('servidor rechaza ids arbitrarios y valida post público, no visto/oculto, y estado del usuario antes de registrar',()=>{
  const section=growth.slice(growth.indexOf("router.post('/pulse/conversation-shown'"),growth.indexOf("router.post('/pulse/conversation-snooze'"));
  assert.match(section,/requireAuth/);
  assert.match(section,/if\(!\/\^\[1-9\]\[0-9\]\{0,15\}\$\/\.test\(postId\)\)return res\.status\(400\)/);
  assert.match(section,/UPDATE user_experience_state/);
  assert.match(section,/participation_prompt_post_id=\$2::bigint/);
  assert.match(section,/participation_prompt_post_id IS DISTINCT FROM \$2::bigint/);
  assert.match(section,/last_home_seen_at<=now\(\)-interval '24 hours'/);
  assert.match(section,/participation_prompt_shown_at<=now\(\)-interval '72 hours'/);
  assert.match(section,/participation_prompt_snoozed_until<=now\(\)/);
  for(const pattern of [
    /p\.moderation_status='published'/,
    /p\.audience='public'/,
    /p\.content_level='normal'/,
    /COALESCE\(p\.post_kind,'post'\)='post'/,
    /p\.created_at>=now\(\)-interval '7 days'/,
    /FROM blocks b/,
    /FROM mutes m/,
    /FROM discovery_hidden_items h/,
    /FROM likes l/,
    /FROM comments c/,
    /FROM posts own/
  ])assert.match(section,pattern);
  assert.doesNotMatch(section,/INSERT INTO notifications|sendEmail|sendPush|sendMail/);
  assert.match(section,/res\.json\(\{ok:true,recorded:result\.rowCount===1\}\)/);
});
test('sin tarjetas nuevas, sin comentarios automáticos ni teclado forzado',()=>{
  assert.equal((html.match(/id="returnConversationV32152"/g)||[]).length,1);
  const handler=social.slice(social.indexOf("$('#returnConversationOpenV32152')?.addEventListener"),social.indexOf("$('#returnConversationSnoozeV32152')?.addEventListener"));
  assert.doesNotMatch(handler,/\/api\/posts\/\$\{.*\/comments|requestSubmit|\.submit\(|postFocusModal/);
  assert.match(handler,/openComments\(id,\{focusComposer:false,initialPosition:'start'\}\)/);
});
