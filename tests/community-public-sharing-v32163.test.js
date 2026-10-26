'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const register=require('../src/services/public-community-share-v32163');
const js=read('public/social.js'),server=read('server.js'),css=read('public/social.css');

function landing(group){
 let callback,sqlCalls=[];
 const app={get:(path,fn)=>{assert.equal(path,'/comunidad/:id');callback=fn}};
 const db={query:async(sql,args)=>{sqlCalls.push({sql,args});return group?{rowCount:1,rows:[group]}:{rowCount:0,rows:[]}}};
 const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 register(app,{db,publicOrigin:()=> 'https://redlibertad.com',escapeHtml:htmlEscape,
  publicEntryHrefV188:(type,key,_path,anchor)=>'/signup?type='+type+'&id='+key+'&mode='+(anchor||'registro'),
  publicEntryBarV192:()=>'<footer>Entrar o registrarse</footer>',
  publicLegalFooterV197:()=>'<footer>Privacidad y términos</footer>'
 });
 const request=async id=>{
  const res={code:200,html:'',headers:{},
   status(n){this.code=n;return this;},
   setHeader(k,v){this.headers[k]=v;return this;},
   type(t){this.contentType=t;return this;},
   send(h){this.html=h;return this;}
  };
  await callback({params:{id}},res);return res;
 };
 return {request,sqlCalls};
}
test('public landing uses a published public community with an active owner and a bounded identifier',async()=>{
 const h=landing({id:21,name:'Fotografía',description:'Fotos y opinión',owner_username:'fotografo'});
 const good=await h.request('21');
 assert.equal(good.code,200);
 assert.equal(good.contentType,'html');
 assert.equal(h.sqlCalls.length,1);
 assert.match(h.sqlCalls[0].sql,/c\.privacy='public'/);
 assert.match(h.sqlCalls[0].sql,/owner\.status='active'/);
 assert.deepEqual(h.sqlCalls[0].args,['21']);
 assert.match(good.html,/https:\/\/redlibertad\.com\/comunidad\/21/);
 assert.match(good.html,/og:title/);
 assert.match(good.html,/og:description/);
 assert.match(good.html,/og:image/);
 assert.match(good.html,/app\?view=communities&amp;community=21/);
 assert.match(good.html,/signup\?type=community&amp;id=21/);
 const rejected=await h.request('21<script>');
 assert.equal(rejected.code,404);
 assert.equal(h.sqlCalls.length,1);
});
test('missing and private groups return 404 without revealing names or posts',async()=>{
 const h=landing(null);
 const res=await h.request('17');
 assert.equal(res.code,404);
 assert.doesNotMatch(res.html,/miembros|posts|reglas|privada/i);
 const code=read('src/services/public-community-share-v32163.js');
 assert.doesNotMatch(code,/SELECT[^\n]*\bcommunity_posts\b|community_comments|SELECT \*/i);
 assert.doesNotMatch(code,/user_email|email_address|conversation_id|\binvite_token\b/);
});
test('HTML text, SEO metadata and social previews escape community-controlled input',async()=>{
 const h=landing({id:42,name:'<script>alert("1")</script>',
  description:'<img src=x onerror=alert(1)>',owner_username:'<owner>'});
 const output=(await h.request('42')).html;
 assert.doesNotMatch(output,/<script>alert|<img src=x onerror|<owner>/);
 assert.match(output,/&lt;script&gt;/);
 assert.match(output,/&lt;img/);
 assert.match(output,/&lt;owner&gt;/);
});
function sharingHarness(){
 const begin=js.indexOf('async function sharePublicCommunityV32163(');
 const end=js.indexOf('function communityHeroHTML(',begin);
 assert.ok(begin>0&&end>begin);
 const effects={copied:[],opened:[],shared:[],prompted:[],toasts:[]};
 const context={String,encodeURIComponent,publicOrigin:'https://redlibertad.com',
  navigator:{share:async args=>effects.shared.push(args)},
  window:{open:(...args)=>effects.opened.push(args),prompt:(...args)=>effects.prompted.push(args)},
  writeClipboardText:async str=>effects.copied.push(str),
  toast:str=>effects.toasts.push(str)};
 vm.runInNewContext(js.slice(begin,end)+'\nthis.go=sharePublicCommunityV32163;',context);
 return {effects,go:context.go,context};
}
test('private communities and invalid ids never invoke native sharing, WhatsApp or clipboard',async()=>{
 const h=sharingHarness();
 for(const id of ['abc',0,'-1','1"><script>']){
  assert.equal(await h.go({id,privacy:'public',name:'X'},'native'),false);
 }
 assert.equal(await h.go({id:1,privacy:'private',name:'Privada'},'whatsapp'),false);
 assert.deepEqual(h.effects,{copied:[],opened:[],shared:[],prompted:[],toasts:[]});
});
test('public groups can be copied, shared natively or via WhatsApp only on explicit action',async()=>{
 const h=sharingHarness();
 const group={id:51,privacy:'public',name:'Arte y cultura'};
 assert.equal(await h.go(group,'copy'),true);
 assert.match(h.effects.copied[0],/https:\/\/redlibertad\.com\/comunidad\/51/);
 assert.equal(await h.go(group,'native'),true);
 assert.equal(h.effects.shared[0].url,'https://redlibertad.com/comunidad/51');
 assert.equal(await h.go(group,'whatsapp'),true);
 assert.match(h.effects.opened[0][0],/^https:\/\/api\.whatsapp\.com\/send\?text=/);
 assert.equal(h.effects.opened[0][1],'_blank');
 assert.equal(h.effects.opened[0][2],'noopener,noreferrer');
});
test('community buttons exist only for public groups and show in existing hero, not Home',()=>{
 const hero=js.slice(js.indexOf('function communityHeroHTML('),js.indexOf('function renderCommunityRules('));
 assert.match(hero,/community\.privacy==='public'\?/);
 assert.match(hero,/data-community-external-share="native"/);
 assert.match(hero,/data-community-external-share="whatsapp"/);
 assert.match(hero,/data-community-external-share="copy"/);
 assert.match(css,/\.community-share-tools-v32163 button\{min-height:44px/);
 assert.match(css,/@media\(max-width:760px\)/);
});
test('shared community deep link opens the existing detail after login with validated positive id',()=>{
 const start=js.indexOf('async function handleInitialDeepLink()');
 const end=js.indexOf('\n(async () => {',start);
 const block=js.slice(start,end);
 assert.match(block,/const community = params\.get\('community'\)/);
 assert.match(block,/if\(community && \/\^\[1-9\]\[0-9\]\{0,14\}\$\/\.test\(community\)\)/);
 assert.match(block,/showView\('communities'\);\s*await openCommunityDetail\(community\)/);
 assert.match(server,/require\('\.\/src\/services\/public-community-share-v32163'\)/);
 assert.ok(server.indexOf("public-community-share-v32163")<server.indexOf("app.get('/app', sendHtmlShell"));
 assert.match(read('.github/workflows/validate-js.yml'),/tests\/community-public-sharing-v32163\.test\.js/);
});
