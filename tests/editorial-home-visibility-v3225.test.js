'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function createNode(tag='div'){
  return {tagName:tag,textContent:'',href:'',target:'',rel:'',children:[],className:'',
    listeners:new Map(),
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=[...items]},
    addEventListener(event,listener){this.listeners.set(event,listener)}
  };
}
function diagnosticHarness(response){
  const selectorMap={
    '#editorialVisibilityStatusV3225':createNode(),
    '#editorialVisibilityMetricsV3225':createNode(),
    '#editorialVisibilityLatestV3225':createNode(),
    '#editorialVisibilityReloadV3225':createNode('button')
  };
  const source=read('public/admin.js');
  const start=source.indexOf('// V3.2.25 — Show the real number');
  const end=source.indexOf('// V3.2.23 — Manual article-from-URL',start);
  assert.ok(start>=0&&end>start,'Visibility dashboard exists');
  const requests=[];
  const sandbox={
    '$':selector=>selectorMap[selector]||null,
    document:{createElement:createNode},
    api:async url=>{requests.push(url);return response},
    Number,String,Math,Array,encodeURIComponent
  };
  vm.runInNewContext(source.slice(start,end)+'\nthis.run=loadEditorialHomeVisibilityV3225;',sandbox);
  return {run:()=>sandbox.run(),map:selectorMap,requests};
}
test('diagnostic endpoint is admin-only, read-only, no-store and requires published schema',()=>{
  const src=read('src/routes/admin-editorial-v320.js');
  const routePos=src.indexOf("router.get('/home-visibility'");
  assert.ok(routePos>src.indexOf('router.use(requireAdmin)'));
  const tail=src.slice(routePos,src.indexOf("router.get('/overview'",routePos));
  assert.match(tail,/await ensurePublicationSchema\(\)/);
  assert.match(tail,/unpublished_at IS NULL AND ep.status='ready'/);
  assert.match(tail,/unpublished_at IS NULL AND ep.status<>'ready'/);
  assert.match(tail,/unpublished_at IS NOT NULL/);
  assert.match(tail,/JOIN editorial_profiles ep ON ep.id=p.profile_id/);
  assert.match(tail,/COUNT\(\*\) FILTER/);
  assert.match(tail,/LIMIT 3/);
  assert.match(tail,/Cache-Control','private, no-store'/);
  assert.doesNotMatch(tail,/INSERT INTO|UPDATE editorial_|DELETE FROM|res\.redirect/);
  const discovery=read('src/routes/editorial-social-v324.js');
  assert.match(discovery,/WHERE p.unpublished_at IS NULL AND ep.status='ready'/);
});
test('real news render as counts and safe same-origin links without HTML interpolation',async()=>{
  const h=diagnosticHarness({r:{ok:true},d:{ok:true,counts:{
    eligible:4,localPhoto:2,withoutLocalPhoto:2,pausedProfile:1,unpublished:3
  },latest:[{id:'17',title:'La noticia <script>alert(1)</script>',profile_name:'Editorial'},
    {id:'0',title:'An invalid identifier'}, {id:'18',title:'Otra noticia',profile_name:'Cultura'}]}});
  await h.run();
  assert.deepEqual(h.requests,['/api/admin/editorial/home-visibility']);
  const stats=h.map['#editorialVisibilityMetricsV3225'];
  assert.deepEqual(stats.children.map(tile=>tile.children[0].textContent),['4','2','2','1','3']);
  const panel=h.map['#editorialVisibilityLatestV3225'];
  const links=panel.children[1].children;
  assert.equal(links.length,2);
  assert.equal(links[0].children[0].href,'/noticias/p/17');
  assert.equal(links[0].children[0].textContent,'La noticia <script>alert(1)</script>');
  assert.equal(links[0].children[0].rel,'noopener noreferrer');
  assert.match(h.map['#editorialVisibilityStatusV3225'].textContent,/4 noticias/);
});
test('zero eligible items produces accurate diagnostic, not invented content',async()=>{
  const h=diagnosticHarness({r:{ok:true},d:{ok:true,counts:{
    eligible:0,localPhoto:0,withoutLocalPhoto:0,pausedProfile:2,unpublished:5
  },latest:[]}});
  await h.run();
  assert.match(h.map['#editorialVisibilityStatusV3225'].textContent,/perfil editorial no está preparado/);
  assert.equal(h.map['#editorialVisibilityLatestV3225'].children.length,0);
});
test('the admin diagnostic tolerates API failures without exposing stack traces',async()=>{
  const h=diagnosticHarness({r:{ok:false},d:{error:'editorial_request_failed'}});
  await h.run();
  assert.match(h.map['#editorialVisibilityStatusV3225'].textContent,/No se pudo comprobar/);
});
test('mobile-first admin UI and manual-only publishing are preserved',()=>{
  const html=read('public/admin.html');
  const css=read('public/admin.css');
  const js=read('public/admin.js');
  assert.ok(html.includes('id="editorialVisibilityMetricsV3225"'));
  assert.ok(html.includes('id="editorialVisibilityReloadV3225"'));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes('después de cada 2 publicaciones sociales'));
  assert.ok(css.includes('@media(max-width:620px)'));
  assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(js.includes('void loadEditorialHomeVisibilityV3225()'));
  assert.ok(read('src/services/editorial-v320.js').includes('auto_publish_enabled'));
});
test('release asset versions and public Home remain unchanged',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.2.35');
  assert.ok(read('server.js').includes("APP_VERSION='3.2.35'"));
  assert.ok(read('public/admin.html').includes('/admin.js?v=3.2.25'));
  assert.ok(read('public/admin.html').includes('/admin.css?v=3.2.25'));
  assert.ok(read('public/app.html').includes('/editorial-home-v324.js?v=3.2.24.2'));
  assert.ok(read('public/editorial-home-v324.js').includes('posts[insertAt[i]-1].after(card)'));
});
