'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../src/db');
const seo=require('../src/routes/marketplace-seo-v3251');
const read=p=>fs.readFileSync(p,'utf8');
const market=read('public/marketplace.html'),script=read('public/marketplace-v3250.js'),
 style=read('public/marketplace-v3250.css'),app=read('public/app.html'),
 appStyle=read('public/marketplace-entry-v3250.css'),
 returnScript=read('public/marketplace-return-v32581.js'),
 publicSeo=read('src/routes/marketplace-seo-v3251.js');
function route(path){return seo.router.stack.find(x=>x.route?.path===path)?.route.stack[0]?.handle;}
function res(){
 return {statusCode:200,body:'',
 setHeader(){return this;},status(v){this.statusCode=v;return this;},
 type(){return this;},send(v){this.body=v;return this;}};
}
test('Hotfix release version, caches, scripts are valid',()=>{
 assert.equal(JSON.parse(read('package.json')).version,'3.2.76');
 assert.ok(read('server.js').includes("APP_VERSION='3.2.76'"));
 assert.ok(market.includes('/marketplace-v3250.js?v=3.2.75'));
 assert.ok(app.includes('/social.css?v=3.2.75'));
 assert.ok(publicSeo.includes('marketplace-seo-v3251.css?v=3.2.75'));
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotThrow(()=>new vm.Script(returnScript));
});
test('Publishing and advanced private search are collapsed, not removed',()=>{
 assert.ok(market.includes('<details id="marketQuickStart"'));
 assert.ok(market.includes('<details id="marketAdvanced"'));
 assert.ok(market.includes('class="filters market-filters-clean"'));
 assert.ok(market.includes('name="q"'));
 for(const name of ['city','province','category','maxPrice','sort'])
  assert.ok(market.includes('name="'+name+'"'));
 for(const deal of ['','sale','buy','rent','offer'])
  assert.ok(market.includes('data-deal="'+deal+'"'));
 for(const kind of ['product','service','property'])
  assert.ok(market.includes('data-kind="'+kind+'"'));
 assert.ok(style.includes('.market-advanced-content'));
 assert.ok(style.includes('.market-search-main'));
 assert.ok(script.includes("path+='?'"));
});
test('Visitors only see a real public catalogue, no inert private controls',()=>{
 assert.ok(script.includes("document.body.classList.toggle('market-guest',status==='guest')"));
 assert.ok(script.includes("banner.classList.toggle('hidden',status!=='unavailable')"));
 for(const id of ['#marketQuickStart','#filters','.subnav'])
  assert.ok(style.includes(id));
 assert.ok(style.includes('.market-guest #marketQuickStart'));
 assert.ok(market.includes('href="/marketplace/explorar">Explorar anuncios sin iniciar sesión'));
 assert.ok(market.includes('href="/"')); // authentication remains available from the normal button
});
test('Marketplace -> RedLibertad -> Marketplace navigation is explicit',()=>{
 assert.ok(market.includes('href="/app?marketReturn=1"'));
 assert.ok(market.includes('view=explore&amp;marketReturn=1'));
 assert.ok(app.includes('id="marketReturnLink"'));
 assert.ok(app.includes('href="/marketplace">← Volver al Marketplace'));
 assert.ok(app.includes('/marketplace-return-v32581.js?v=3.2.63.2'));
 assert.ok(appStyle.includes('.market-return-link-v32581'));
 assert.ok(returnScript.includes("params.get('marketReturn')!=='1'"));
 const target={classList:{removed:[],remove(x){this.removed.push(x);}}};
 const context={URLSearchParams,document:{getElementById:x=>x==='marketReturnLink'?target:null},location:{search:'?marketReturn=1'}};
 vm.runInNewContext(returnScript,context);
 assert.deepEqual(target.classList.removed,['hidden']);
 target.classList.removed=[];
 context.location.search='';
 vm.runInNewContext(returnScript,context);
 assert.deepEqual(target.classList.removed,[]);
});
test('Public catalogue search is compact and keeps parameterized safe filters',async()=>{
 assert.ok(publicSeo.includes('class="market-public-search"'));
 assert.ok(publicSeo.includes('<details class="market-public-advanced"'));
 assert.ok(publicSeo.includes("advanced?' open'"));
 assert.ok(publicSeo.includes('const searching=Boolean(q||city||kind||category||nationalOnly||maxPrice!==null||sort'));
 const fn=route('/marketplace/explorar');assert.equal(typeof fn,'function');
 const original=db.query;
 db.query=async()=>({rowCount:0,rows:[]});
 try{
  const guest=res();
  await fn({query:{}},guest,e=>{throw e;});
  assert.ok(guest.body.includes('class="market-public-advanced"'));
  assert.ok(!guest.body.includes('class="market-public-advanced" open'));
  const filtered=res();
  await fn({query:{ciudad:'Valencia',orden:'price_asc'}},filtered,e=>{throw e;});
  assert.ok(filtered.body.includes('class="market-public-advanced" open'));
  assert.ok(filtered.body.includes('noindex,follow'));
  assert.ok(filtered.body.includes('value="Valencia"'));
 }finally{db.query=original;}
});
