'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const client=read('public/social.js'),posts=read('src/routes/posts.js');
const start=client.indexOf('function selectReturnConversationV32152(');
const end=client.indexOf('function renderReturnConversationV32152(',start);
assert.ok(start>=0&&end>start);
const ctx={Array,String,Number,Date};
vm.runInNewContext(client.slice(start,end)+'\nthis.select=selectReturnConversationV32152;',ctx);
const now=Date.parse('2026-10-26T12:00:00Z');
function post(id,extra={}){
 return {id,user_id:42,caption:'Pregunta real con suficiente contenido para conversar en RedLibertad.',
  created_at:new Date(now-3600000).toISOString(),content_level:'normal',audience:'public',
  post_kind:'post',liked_by_me:false,commented_by_me:false,...extra};
}
test('already-commented posts are skipped before claiming or showing another suggestion',()=>{
 const p=ctx.select([post(1,{commented_by_me:true}),post(2)],7,now);
 assert.equal(p.id,2);
 assert.equal(ctx.select([post(1,{commented_by_me:true})],7,now),null);
});
test('retry exclusion is monotone, never repeats one failed candidate',()=>{
 const tried=new Set(['1','2']);
 assert.equal(ctx.select([post(1),post(2),post(3)],7,now,null,tried).id,3);
 tried.add('3');
 assert.equal(ctx.select([post(1),post(2),post(3)],7,now,null,tried),null);
 assert.equal(ctx.select([post(1),post(2),post(3)],7,now,3,tried),null);
});
test('all original privacy and authenticity conditions remain in place',()=>{
 const invalid=[post(1,{liked_by_me:true}),post(2,{user_id:7}),
  post(3,{audience:'vip'}),post(4,{content_level:'sensitive'}),
  post(5,{post_kind:'reel'}),post(6,{created_at:'2025-01-01T00:00:00Z'})];
 assert.equal(ctx.select(invalid,7,now),null);
});
test('latest feed supplies a server-verified commented-by-me boolean without public identity exposure',()=>{
 const a=posts.indexOf("router.get('/feed'"),b=posts.indexOf("router.get('/new-activity'",a);
 assert.ok(a>0&&b>a);
 const q=posts.slice(a,b);
 assert.match(q,/req\.user \? \x60EXISTS\(SELECT 1 FROM comments my_comment WHERE my_comment\.post_id=p\.id AND my_comment\.user_id=\$1\)\x60 : 'false'/);
 assert.match(q,/AS commented_by_me/);
 assert.doesNotMatch(q,/my_comment\.body|my_comment\.text|my_comment\.content/);
});
test('existing return panel tries at most 3 candidates and respects claim, rate limit and server errors',()=>{
 const a=client.indexOf('async function loadReturnPulse('),b=client.indexOf('async function handleReturnPulseAction(',a);
 assert.ok(a>0&&b>a);
 const segment=client.slice(a,b);
 assert.match(segment,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
 assert.match(segment,/triedIds\.add\(String\(match\.id\)\)/);
 assert.match(segment,/if\(claimed\.r\.ok && claimed\.d\?\.recorded===true\)/);
 assert.match(segment,/if\(!claimed\.r\.ok\)break/);
 assert.match(segment,/body:JSON\.stringify\(\{postId:match\.id\}\)/);
 assert.match(segment,/if\(d\.participation\?\.can_show===true && me\?\.id\)/);
 assert.match(read('src/routes/growth.js'),/interval '72 hours'/);
 assert.match(read('src/routes/growth.js'),/interval '7 days'/);
 const html=read('public/app.html');
 assert.equal((html.match(/id="returnConversationV32152"/g)||[]).length,1);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/conversation-fallback-v334\.test\.js/);
});
