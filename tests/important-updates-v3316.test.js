'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {createImportantUpdatesService}=require('../src/services/important-updates-v3316');
const routes=read('src/routes/important-updates-v3316.js');
const app=read('public/app.html'),js=read('public/social.js'),admin=read('public/admin.js');
function mockDatabase({opted=false,claim=[]}={}){
 const calls=[];
 const db={
  query:async(sql,args=[])=>{
   calls.push({sql,args});
   if(sql.includes('SELECT enabled FROM important_update_optins'))return {rows:[{enabled:opted}],rowCount:1};
   if(sql.includes('UPDATE important_update_optins'))return {rows:[{user_id:9}],rowCount:1};
   if(sql.startsWith('WITH due AS'))return {rows:claim,rowCount:claim.length};
   if(sql.includes('SELECT u.email,u.status,s.enabled')){
    return {rows:[{email:'reader@example.org',status:'active',enabled:opted,
      unsubscribe_token:'a'.repeat(48),title:'Nueva función',summary:'Esta mejora permite descubrir contenido real.'}],rowCount:1};
   }
   return {rows:[],rowCount:0};
  },
  pool:{connect:async()=>{throw Error('queue not used in this test');}}
 };
 return {db,calls};
}
test('newsletter defaults to OFF for every member, and delivery flag OFF',async()=>{
 const h=mockDatabase();
 const svc=createImportantUpdatesService({db:h.db,env:{},logger:{warn(){}}});
 assert.equal(await svc.preference(9),false);
 assert.deepEqual(await svc.queue({title:'Test',summary:'Long enough summary for a bulletin.'}),{disabled:true});
 assert.equal((await svc.poll()).skipped,'disabled');
 assert.equal(h.calls.filter(x=>x.sql.includes('CREATE TABLE')).length,3);
 assert.match(read('.env.example'),/IMPORTANT_UPDATES_EMAIL_ENABLED=false/);
});
test('subscription changes are explicit, unique token and scanner-safe unsubscribe',async()=>{
 const h=mockDatabase();
 const svc=createImportantUpdatesService({db:h.db,env:{},logger:{warn(){}}});
 await svc.savePreference(9,true);
 const insert=h.calls.find(x=>x.sql.startsWith('INSERT INTO important_update_optins'));
 assert.equal(insert.args[1],true);
 assert.match(insert.args[2],/^[0-9a-f]{48}$/);
 assert.equal(await svc.unsubscribe('garbage'),false);
 assert.equal(await svc.unsubscribe('a'.repeat(48)),true);
 assert.match(routes,/router\.get\('\/unsubscribe'/);
 assert.match(routes,/router\.post\('\/unsubscribe'/);
 assert.doesNotMatch(routes.slice(routes.indexOf("router.get('/unsubscribe'"),routes.indexOf("router.post('/unsubscribe'")),/service\.unsubscribe\(/);
});
test('mail uses escaped curator text, fixed site URLs and unsubscribe headers',async()=>{
 const h=mockDatabase({opted:true,claim:[{campaign_id:7,user_id:9,attempts:1}]});
 let request=null;
 const svc=createImportantUpdatesService({db:h.db,logger:{warn(){}},
  env:{IMPORTANT_UPDATES_EMAIL_ENABLED:'true',RESEND_API_KEY:'long-resend-test-key',MESSAGE_EMAIL_FROM:'avisos@redlibertad.com'},
  fetchFn:async(url,opts)=>{request={url,opts};return {ok:true};}});
 const body=svc.content({title:'<img src=x>',summary:'A&B',token:'a'.repeat(48)});
 assert.match(body.html,/&lt;img src=x&gt;/);
 assert.doesNotMatch(body.html,/<img src=x>/);
 assert.match(body.text,/A&B/);
 await svc.poll();
 assert.equal(request.url,'https://api.resend.com/emails');
 const data=JSON.parse(request.opts.body);
 assert.equal(data.to[0],'reader@example.org');
 assert.match(data.headers['List-Unsubscribe'],/^<https:\/\/redlibertad\.com\/api\/important-updates\/unsubscribe\?token=/);
 assert.equal(data.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal(request.opts.headers['Idempotency-Key'],'rl-important-7-9');
 assert.ok(h.calls.some(x=>x.sql.includes("status=$3")&&x.args[2]==='sent'));
});
test('disabled recipients never transmit emails even if queued previously',async()=>{
 const h=mockDatabase({opted:false,claim:[{campaign_id:7,user_id:9,attempts:1}]});
 let sends=0;
 const svc=createImportantUpdatesService({db:h.db,logger:{warn(){}},
  env:{IMPORTANT_UPDATES_EMAIL_ENABLED:'true',RESEND_API_KEY:'long-resend-test-key',MESSAGE_EMAIL_FROM:'avisos@redlibertad.com'},
  fetchFn:async()=>{sends++;return {ok:true};}});
 await svc.poll();
 assert.equal(sends,0);
 assert.ok(h.calls.some(x=>x.sql.includes('status=$3')&&x.args[2]==='skipped'));
});
test('admin-only and account-only endpoints; no auto-send on news or posts',()=>{
 assert.match(routes,/router\.put\('\/preferences',requireAuth/);
 assert.match(routes,/router\.get\('\/admin\/status',requireAdmin/);
 assert.match(routes,/router\.post\('\/admin\/send',requireAdmin/);
 assert.match(routes,/z\.object\(\{[\s\S]*title:z\.string\(\)[\s\S]*summary:z\.string\(\)/);
 assert.match(read('server.js'),/app\.use\('\/api\/important-updates'/);
 assert.match(read('server.js'),/importantUpdates\.start\(\)/);
 assert.match(app,/id="importantUpdatesPreferencesForm"/);
 assert.match(js,/loadImportantUpdatesPreferencesV3316\(\)\.catch/);
 assert.match(read('public/admin.html'),/id="importantUpdatesAdminFormV3316"/);
 assert.match(admin,/window\.confirm\('¿Enviar este comunicado/);
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/important-updates-v3316\.test\.js/);
});
