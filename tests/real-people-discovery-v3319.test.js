'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js'),profiles=read('src/routes/profiles.js');
const html=read('public/app.html'),workflow=read('.github/workflows/validate-js.yml');
function person(user,mode='for_you'){
 const a=social.indexOf('function personCardHTML('),b=social.indexOf('async function hideDiscoveryPerson(',a);
 assert.ok(a>=0&&b>a);
 const ctx={Number,Array,String,avatarHTML:()=>'<span>Foto</span>',
  profileLink:(_username,markup)=>markup,interestPillsHTML:()=>'',esc:x=>String(x??'')};
 vm.runInNewContext(social.slice(a,b)+'\nthis.render=personCardHTML;',ctx);
 return ctx.render({id:4,username:'ana',display_name:'Ana',...user},true,mode);
}
function followHarness(reply={ok:true}){
 const a=social.indexOf('async function toggleSuggestedFollow('),b=social.indexOf('async function loadInterestCatalog(',a);
 assert.ok(a>=0&&b>a);
 const calls=[],toasts=[];
 const makeButton=(id='4')=>({dataset:{suggestFollow:id,following:'0'},disabled:false,
  textContent:'Seguir',classList:{following:false,toggle(_name,yes){this.following=yes;}}});
 const one=makeButton(),two=makeButton(),other=makeButton('5');
 const ctx={String,Error,all:()=>[one,two,other],
  api:async(url,opts)=>{calls.push({url,method:opts.method});return {r:reply};},
  toast:message=>toasts.push(message),loadMe:async()=>{},$:()=>null};
 vm.runInNewContext(social.slice(a,b)+'\nthis.follow=toggleSuggestedFollow;',ctx);
 return {one,two,other,calls,toasts,follow:ctx.follow};
}
test('discovery query signals recent joins without leaking hidden profiles',()=>{
 const a=profiles.indexOf("router.get('/suggestions', requireAuth, async (req, res) => {");
 const b=profiles.indexOf('async function ensureFavoritesCircle',a);
 const s=profiles.slice(a,b);
 assert.ok(a>=0&&b>a);
 assert.match(s,/\(u\.created_at>=now\(\)-interval '30 days'\) AS recent_joiner/);
 for(const guard of ["u.status='active'","u.is_admin=false","u.discoverable=true",
  'FROM blocks blocked','FROM mutes muted','FROM discovery_hidden_items hidden']){
  assert.ok(s.includes(guard),guard);
 }
 assert.doesNotMatch(s,/is_online|online_status|INSERT INTO users/i);
});
test('suggestion labels reflect shared interests, real join date, and genuine activity',()=>{
 assert.match(person({shared_interest_count:2}),/2 intereses en común/);
 assert.match(person({recent_joiner:true}),/Se ha unido hace poco/);
 const old=person({recent_joiner:false,follower_count:99});
 assert.match(old,/Descubre su perfil/);
 assert.doesNotMatch(old,/Nuevo por aquí|99 seguidores|En línea/);
 assert.match(person({following:true}),/Ya sigues este perfil/);
 assert.match(person({},'new'),/Se ha unido en los últimos 30 días/);
 assert.match(person({},'active'),/Actividad pública reciente/);
 assert.match(person({recent_public_post:true},'starter'),/publicación pública en los últimos 14 días/);
});
test('server-confirmed follow updates all visible cards for that account',async()=>{
 const h=followHarness();
 await h.follow(h.one);
 assert.equal(h.calls[0].url,'/api/profiles/4/follow');
 assert.deepEqual(h.calls.map(x=>x.method),['POST']);
 for(const b of [h.one,h.two]){
  assert.equal(b.dataset.following,'1');assert.equal(b.textContent,'Siguiendo');
  assert.equal(b.classList.following,true);assert.equal(b.disabled,false);
 }
 assert.equal(h.other.textContent,'Seguir');
 await h.follow(h.two);
 assert.deepEqual(h.calls.map(x=>x.method),['POST','DELETE']);
 assert.equal(h.one.textContent,'Seguir');
 assert.equal(h.two.textContent,'Seguir');
 assert.equal(h.toasts.length,0);
});
test('failed follow leaves every visible button unchanged',async()=>{
 const h=followHarness({ok:false});await h.follow(h.one);
 for(const b of [h.one,h.two]){
  assert.equal(b.dataset.following,'0');assert.equal(b.textContent,'Seguir');assert.equal(b.disabled,false);
 }
 assert.equal(h.toasts.length,1);assert.equal(h.other.disabled,false);
});
test('pending writes for a person do not trigger a second request',async()=>{
 const h=followHarness();h.one.disabled=true;
 await h.follow(h.two);
 assert.equal(h.calls.length,0);
 assert.match(html,/social\.js\?[^"]*connections=3\.3\.19/);
 assert.match(workflow,/node --test tests\/real-people-discovery-v3319\.test\.js/);
});
