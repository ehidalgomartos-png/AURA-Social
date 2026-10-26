'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const routes=read('src/routes/communities.js'),client=read('public/social.js');
const css=read('public/social.css'),html=read('public/app.html');

function serverHarness(rows=[]){
  const start=routes.indexOf("router.get('/discover',async(req,res)=>{");
  const end=routes.indexOf("router.post('/discover/:communityId/hide'",start);
  assert.ok(start>0&&end>start);
  const calls=[];
  let handler=null;
  const router={get:(route,fn)=>{assert.equal(route,'/discover');handler=fn}};
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows}}};
  new Function('router','db','COMMUNITY_CATEGORIES',routes.slice(start,end))(
    router,db,['general','cine','tecnologia','deporte']);
  return {calls,async request(query={}){
    let out;
    await handler({user:{id:17},query},{json:value=>out=value});
    return out;
  }};
}
test('the Active tab only includes public communities with real, recent, visible published posts',async()=>{
  const h=serverHarness();
  const response=await h.request({mode:'active'});
  const {sql,params}=h.calls[0];
  assert.equal(response.mode,'active');
  assert.deepEqual(params,[17,'','','active']);
  assert.match(sql,/LEFT JOIN LATERAL\s*\(\s*SELECT count\(\*\)::int AS visible_recent_post_count/);
  assert.match(sql,/cp\.moderation_status='published'/);
  assert.match(sql,/cp\.created_at>=now\(\)-interval '14 days'/);
  assert.match(sql,/c\.privacy='public'/);
  assert.match(sql,/author\.status='active'/);
  assert.match(sql,/blocked_post\.blocker_id=\$1 AND blocked_post\.blocked_id=cp\.user_id/);
  assert.match(sql,/blocked_post\.blocker_id=cp\.user_id AND blocked_post\.blocked_id=\$1/);
  assert.match(sql,/muted_post\.muter_id=\$1 AND muted_post\.muted_id=cp\.user_id/);
  assert.match(sql,/\(\$4<>'active' OR COALESCE\(recent\.visible_recent_post_count,0\)>0\)/);
  assert.match(sql,/WHEN \$4='active' THEN recent\.latest_visible_post_at/);
});
test('New tab returns genuine recent communities and default discovery keeps original privacy exclusions',async()=>{
  const h=serverHarness();
  const response=await h.request({mode:'new',category:'cine',q:'pintura'});
  const {sql,params}=h.calls[0];
  assert.deepEqual(params,[17,'cine','pintura','new']);
  assert.equal(response.mode,'new');
  assert.match(sql,/\(\$4<>'new' OR c\.created_at>=now\(\)-interval '30 days'\)/);
  for(const piece of ["owner.status='active'","community_members mine",
    "community_hidden_suggestions hidden","blocked.blocker_id=$1",
    "blocked.blocked_id=$1","FROM mutes m","m.muter_id=$1",
    "($2='' OR c.category=$2)"]){
    assert.ok(sql.includes(piece),piece);
  }
  assert.doesNotMatch(sql,/\bemail\b|password_hash|is_online|INSERT INTO community_posts/i);
});
test('private groups never export post totals or recent activity counts in discovery',async()=>{
  const h=serverHarness();
  await h.request();
  const sql=h.calls[0].sql;
  assert.match(sql,/CASE WHEN c\.privacy='public'\s+THEN \(SELECT count\(\*\)::int FROM community_posts cp/);
  assert.match(sql,/ELSE NULL END AS post_count/);
  assert.match(sql,/COALESCE\(recent\.visible_recent_post_count,0\) AS recent_post_count/);
});
test('activity and newness reasons are truthful instead of inferred from update timestamps',async()=>{
  const h=serverHarness([
    {id:1,name:'Cine',privacy:'public',shared_interest_count:3,connection_member_count:0,
      recent_post_count:2},
    {id:2,name:'Pintura',privacy:'public',shared_interest_count:0,connection_member_count:0,
      recent_post_count:0}
  ]);
  const active=await h.request({mode:'active'});
  assert.match(active.communities[0].reason,/2 publicaciones recientes · últimos 14 días/);
  const newest=await h.request({mode:'new'});
  assert.match(newest.communities[0].reason,/creada en los últimos 30 días/);
  const recommended=await h.request({mode:'recommended'});
  assert.match(recommended.communities[0].reason,/3 intereses compartidos/);
  assert.match(recommended.communities[1].reason,/Comunidad que podrías explorar/);
});
function card(group,mode='recommended'){
  const from=client.indexOf('function communityDiscoveryCardHTML(community){');
  const to=client.indexOf('function renderCommunityDiscovery()',from);
  assert.ok(from>0&&to>from);
  const ctx={
    Number,Array,
    communityDiscoveryMode:mode,
    COMMUNITY_CATEGORY_LABELS:{cine:'Cine',general:'General'},
    communityAvatarHTML:()=>'<span class="avatar">C</span>',
    esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  };
  vm.runInNewContext(client.slice(from,to)+'\nthis.card=communityDiscoveryCardHTML;',ctx);
  return ctx.card(group);
}
test('public activity cards lead to real community detail, never joining automatically',()=>{
  const publicGroup={id:31,name:'Cine real',privacy:'public',category:'cine',
    description:'Películas',member_count:2,post_count:4,recent_post_count:2,
    reason:'2 publicaciones recientes · últimos 14 días'};
  const rendered=card(publicGroup,'active');
  assert.match(rendered,/data-community-open="31"/);
  assert.match(rendered,/Ver conversaciones recientes/);
  assert.match(rendered,/2 publicaciones recientes/);
  assert.doesNotMatch(rendered,/data-community-join|requestJoin|autojoin/);
});
test('private cards never imply a visitor can see their posts or read internal conversations',()=>{
  const privateGroup={id:37,name:'Amistad',privacy:'private',category:'general',
    description:'Solo miembros',member_count:5,post_count:null,recent_post_count:0};
  const rendered=card(privateGroup);
  assert.match(rendered,/Privada/);
  assert.match(rendered,/Publicaciones reservadas a miembros/);
  assert.doesNotMatch(rendered,/0 publicaciones|Ver conversaciones recientes/);
  assert.match(rendered,/Explorar comunidad/);
});
test('the existing mobile Community view provides correct empty states, without new Home cards',()=>{
  const start=client.indexOf('function renderCommunityDiscovery(){');
  const end=client.indexOf('async function loadCommunityDiscovery()',start);
  const block=client.slice(start,end);
  assert.match(block,/No hay comunidades públicas con publicaciones recientes/);
  assert.match(block,/No hay comunidades creadas en los últimos 30 días/);
  assert.match(html,/data-community-discovery-mode="active"/);
  assert.match(html,/data-community-discovery-mode="new"/);
  assert.match(css,/\.community-discovery-open-v32161/);
  assert.match(read('.github/workflows/validate-js.yml'),
    /tests\/honest-active-communities-v32161\.test\.js/);
});
