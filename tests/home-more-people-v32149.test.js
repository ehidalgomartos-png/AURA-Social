'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');

const start=social.indexOf('function activePersonHTML(user)');
const finish=social.indexOf('function readLastHomeVisit()',start);
// Include the request sequence declaration now guarding overlapping responses.
const loaderStart=social.indexOf('let activePeopleRequestSequenceV3310=0;');
const loaderEnd=social.indexOf('async function loadHomeMomentum()',loaderStart);
assert.ok(start>0&&finish>start&&loaderStart>finish&&loaderEnd>loaderStart);

function harness({newUsers=[],recommended=[],newOk=true,recommendedOk=true}={}){
  const root={innerHTML:''},hint={hidden:true},calls=[];
  const sandbox={
    $:selector=>({'#activePeople':root,'#activePeopleHint':hint})[selector],
    api:async url=>{
      calls.push(url);
      if(url.includes('mode=new'))return {r:{ok:newOk},d:{users:newUsers}};
      if(url.includes('mode=for_you'))return {r:{ok:recommendedOk},d:{users:recommended}};
      throw Error('unexpected endpoint');
    },
    Date,
    Set,
    Number,
    String,
    Array,
    esc:s=>String(s??''),
    profileLink:(_user,markup)=>markup,
    avatarHTML:()=>'<i>avatar</i>',
    compactTimeAgo:()=> '2 d'
  };
  vm.runInNewContext(social.slice(start,finish)+social.slice(loaderStart,loaderEnd)+
    '\nthis.loadActivePeople=loadActivePeople;this.activePersonHTML=activePersonHTML;',sandbox);
  return {root,hint,calls,load:sandbox.loadActivePeople,render:sandbox.activePersonHTML};
}

test('la portada ofrece perfiles nuevos aunque no hayan publicado ni tengan actividad',async()=>{
  const newcomer={id:5,username:'ana',display_name:'Ana',created_at:new Date().toISOString(),following:false};
  const h=harness({newUsers:[newcomer]});
  const users=await h.load();
  assert.equal(users.length,1);
  assert.match(h.root.innerHTML,/Nuevo por aquí/);
  assert.match(h.root.innerHTML,/@ana/);
  assert.doesNotMatch(h.root.innerHTML,/NaN|undefined|Actividad reciente|<i><\/i>/);
  assert.equal(h.hint.hidden,true);
  assert.ok(h.calls.includes('/api/profiles/suggestions?limit=5&mode=new'));
});

test('sugerencias mixtas sin duplicados con prioridad de recién llegados y máximo de 12',async()=>{
  const fresh=[1,2,3,4].map(id=>({id,username:'u'+id,display_name:'Usuario '+id}));
  const all=Array.from({length:16},(_,i)=>({id:i+2,username:'u'+(i+2),display_name:'Usuario '+(i+2)}));
  const h=harness({newUsers:fresh,recommended:all});
  const users=await h.load();
  assert.equal(users.length,12);
  assert.deepEqual(Array.from(users.slice(0,3),p=>p.id),[1,2,3]);
  assert.equal(new Set(users.map(p=>p.id)).size,12);
  assert.equal(h.hint.hidden,false);
  assert.equal(h.calls.length,2);
});

test('si falla una lista se sigue usando la otra sin inventar perfiles',async()=>{
  const h=harness({newOk:false,recommended:[{id:44,username:'p',display_name:'Persona'}]});
  assert.equal((await h.load()).length,1);
  assert.match(h.root.innerHTML,/Persona/);
  const empty=harness({newOk:false,recommendedOk:false});
  assert.equal((await empty.load()).length,0);
  assert.match(empty.root.innerHTML,/Aún hay pocas personas/);
});

test('no se finge estado en línea ni actividad privada',()=>{
  const h=harness();
  const profile=h.render({id:1,username:'pepe',display_name:'Pepe',last_activity_at:null,created_at:'2020-01-01T00:00:00Z'});
  assert.match(profile,/Descubre su perfil/);
  assert.doesNotMatch(profile,/Actividad pública reciente|NaN|class="active-person-avatar">.*<i><\/i>/);
});

test('la API mantiene las restricciones de privacidad y no inventa perfiles',()=>{
  const routes=read('src/routes/profiles.js');
  const i=routes.indexOf("router.get('/suggestions', requireAuth");
  const j=routes.indexOf('async function ensureFavoritesCircle(',i);
  assert.ok(i>=0&&j>i);
  const query=routes.slice(i,j);
  for(const value of ["u.status='active'","u.is_admin=false","u.discoverable=true",
      "blocked.blocker_id","blocked.blocked_id","FROM mutes muted",
      "FROM discovery_hidden_items hidden","u.id<>$1","CASE WHEN u.show_activity"]){
    assert.ok(query.includes(value),value);
  }
  assert.doesNotMatch(query,/random\(\)|GENERATE_SERIES|INSERT INTO users/i);
});

test('el diseño muestra dos perfiles en móvil y tiene acceso a descubrir todos',()=>{
  const html=read('public/app.html');
  const css=read('public/social.css');
  assert.match(html,/Descubre personas/);
  assert.match(html,/data-explore-target="people">Ver todas/);
  assert.match(html,/id="activePeopleHint"[^>]*hidden/);
  assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(social,/\/api\/profiles\/suggestions\?limit=12&mode=for_you/);
  assert.doesNotMatch(social.slice(loaderStart,loaderEnd),/\/api\/profiles\/active\?/);
});
