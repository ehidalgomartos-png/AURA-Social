'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {resolveReturnSinceV3322,THIRTY_DAYS_V3322}=require('../src/services/return-since-v3322');
const js=read('public/social.js'),growth=read('src/routes/growth.js'),html=read('public/app.html');

test('valid return baseline stays stable for manual refresh within a tab',()=>{
 const now=Date.parse('2026-10-27T12:00:00.000Z'),old=new Date(now-25*60*60*1000).toISOString();
 const fallback=new Date(now-1000);
 const out=resolveReturnSinceV3322(old,fallback,now);
 assert.equal(out.toISOString(),old);
 assert.notEqual(out,fallback);
 assert.equal(THIRTY_DAYS_V3322,30*86400000);
});
test('malformed, future and older-than-30-day client baselines use safe server fallback',()=>{
 const now=Date.parse('2026-10-27T12:00:00.000Z'),fallback=new Date(now-60000);
 for(const value of [
  null,undefined,'','2026-10-25','2030-01-01T00:00:00.000Z',
  '2026-09-01T00:00:00.000Z',
  '2026-10-27T12:00:00Z','2026-02-30T12:00:00.000Z',
  '2026-10-27T12:00:00.000+01:00','sql injection',
  new Date(now+1).toISOString()
 ])assert.equal(resolveReturnSinceV3322(value,fallback,now),fallback,String(value));
 assert.equal(resolveReturnSinceV3322(new Date(now-THIRTY_DAYS_V3322).toISOString(),fallback,now).getTime(),now-THIRTY_DAYS_V3322);
});
test('server keeps authenticated access, existing privacy-safe counts and unchanged stored visit write',()=>{
 const get=growth.slice(growth.indexOf("router.get('/pulse'"),growth.indexOf("router.post('/pulse/conversation-shown'"));
 assert.match(get,/router\.get\('\/pulse', requireAuth/);
 assert.match(get,/resolveReturnSinceV3322\(req\.query\.since,baseline\)/);
 assert.match(get,/since:since\.toISOString\(\)/);
 for(const snippet of ["JOIN follows f","p.moderation_status='published'",
  "u.status='active'","FROM notifications n","FROM messages m",
  "FROM story_views sv"]){
  assert.ok(get.includes(snippet),snippet);
 }
 const seen=growth.slice(growth.indexOf("router.post('/pulse/seen'"));
 assert.match(seen,/requireAuth/);
 assert.match(seen,/WHERE user_id=\$1|VALUES \(\$1,now\(\),now\(\)\)/);
 assert.doesNotMatch(get,/UPDATE user_experience_state|INSERT INTO user_experience_state/);
});
function pulseSessionHarness(){
 const from=js.indexOf('// V3.3.22 — One genuine home-visit acknowledgement');
 const to=js.indexOf('async function loadReturnPulse(',from);
 assert.ok(from>=0&&to>from);
 const pending=[],calls=[],views=[];
 const ctx={String,me:{id:7},returnConversationPostV32152:{id:22},
  api:async(url,opts)=>{
   calls.push({url,method:opts.method});
   const d={};pending.push(d);
   return new Promise(resolve=>{d.resolve=resolve;});
  }};
 vm.runInNewContext(js.slice(from,to)+
  '\nthis.current=returnPulseSessionForV3322;this.mark=acknowledgeReturnPulseV3322;',ctx);
 return {ctx,pending,calls,views};
}
test('one real view acknowledges once and concurrent refreshes cannot double-write',async()=>{
 const h=pulseSessionHarness(),session=h.ctx.current();
 const first=h.ctx.mark(session),second=h.ctx.mark(session);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].url,'/api/growth/pulse/seen');
 assert.equal(h.calls[0].method,'POST');
 assert.equal(await second,false);
 h.pending[0].resolve({r:{ok:true}});assert.equal(await first,true);
 assert.equal(session.marked,true);
 assert.equal(await h.ctx.mark(session),false);
 assert.equal(h.calls.length,1);
});
test('failed acknowledgement may retry; changing user isolates baseline and pending writes',async()=>{
 const h=pulseSessionHarness(),old=h.ctx.current();old.since='2026-10-26T12:00:00.000Z';
 const fail=h.ctx.mark(old);h.pending[0].resolve({r:{ok:false}});
 assert.equal(await fail,false);assert.equal(old.marked,false);
 const retry=h.ctx.mark(old);h.pending[1].resolve({r:{ok:true}});
 assert.equal(await retry,true);assert.equal(old.marked,true);
 h.ctx.me.id=8;
 const fresh=h.ctx.current();
 assert.notEqual(fresh,old);assert.equal(fresh.since,null);
 assert.equal(fresh.marked,false);assert.equal(h.ctx.returnConversationPostV32152,null);
});
test('refresh uses the original server baseline, retains the visible discussion and never sends emails',()=>{
 const source=js.slice(js.indexOf('async function loadReturnPulse('),js.indexOf('async function handleReturnPulseAction('));
 assert.match(source,/session\.since\?'\?since='\+encodeURIComponent\(session\.since\)/);
 assert.match(source,/session\.since=baseline\.toISOString\(\)/);
 assert.match(source,/let hasConversation=!!returnConversationPostV32152/);
 assert.match(source,/if\(!hasConversation && d\.participation\?\.can_show===true/);
 assert.match(source,/await acknowledgeReturnPulseV3322\(session\)/);
 assert.doesNotMatch(source,/sendEmail|sendPush|setInterval|localStorage|sessionStorage|autoComment|autoFollow/i);
 assert.match(html,/social\.js\?[^"]*return=3\.3\.22/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/real-return-session-v3322\.test\.js/);
});
