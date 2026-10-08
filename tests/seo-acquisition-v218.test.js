'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const {router,GUIDES,guidePath,signupHref,PUBLISHED}=require('../src/public-guides-v218');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

async function serve(fn){
  const app=express();
  app.set('trust proxy',1);
  app.use(router);
  app.use((req,res)=>res.status(404).send('Not found'));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  try{return await fn(url);}
  finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}

function serverNormalize(){
  const code=read('src/routes/auth.js');
  const start=code.indexOf('const PUBLIC_ENTRY_TYPES=');
  const end=code.indexOf('function signUser(',start);
  assert.ok(start>=0 && end>start);
  return vm.runInNewContext(code.slice(start,end)+'\nnormalizeSignupAttribution',{Set});
}
function browserValidate(){
  const code=read('public/app.js');
  const start=code.indexOf('const PUBLIC_ENTRY_STORAGE=');
  const end=code.indexOf('function loadPublicEntry()',start);
  assert.ok(start>=0 && end>start);
  return vm.runInNewContext(code.slice(start,end)+'\nvalidPublicEntry',{Date});
}

test('guide catalog is finite, unique, editorial and static',()=>{
  assert.equal(GUIDES.length,3);
  assert.equal(new Set(GUIDES.map(g=>g.slug)).size,GUIDES.length);
  for(const g of GUIDES){
    assert.match(g.slug,/^[a-z0-9-]{1,80}$/);
    assert.ok(g.title.length>24);
    assert.ok(g.intro.length>100);
    assert.ok(g.sections.length>=4);
    assert.ok(g.sections.reduce((sum,s)=>sum+s.paragraphs.join(' ').length,0)>=900);
    for(const section of g.sections){
      assert.ok(section.link[0].startsWith('/'));
      assert.ok(!section.link[0].startsWith('//'));
    }
  }
  assert.equal(PUBLISHED,'2026-10-08');
});

test('public hub serves discoverable canonical HTML and internal links',()=>serve(async base=>{
  const res=await fetch(base+'/guias');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/text\/html/);
  const body=await res.text();
  assert.match(body,/<html lang="es">/);
  assert.match(body,/<h1>Guías para empezar en RedLibertad<\/h1>/);
  assert.match(body,/<meta name="robots" content="index,follow/);
  assert.match(body,/<link rel="canonical" href="http:\/\/127\.0\.0\.1:[0-9]+\/guias">/);
  for(const g of GUIDES)assert.ok(body.includes('href="'+guidePath(g.slug)+'"'));
  assert.ok(body.includes('id="guide-main"'));
}));

test('individual guides have unique metadata, schema and CTA',()=>serve(async base=>{
  const seen=new Set();
  for(const g of GUIDES){
    const res=await fetch(base+guidePath(g.slug)+'?utm_source=test');
    assert.equal(res.status,200);
    const body=await res.text();
    assert.ok(body.includes('<title>'+g.title+' — RedLibertad</title>'));
    assert.ok(body.includes('<meta name="description" content="'+g.short+'">'));
    assert.ok(body.includes('<meta property="og:type" content="article">'));
    assert.ok(body.includes('<link rel="canonical" href="'+base+guidePath(g.slug)+'">'));
    assert.ok(!body.includes('utm_source=test'));
    assert.ok(body.includes('href="'+signupHref(g.slug).replaceAll('&','&amp;')+'"'));
    assert.ok(body.includes('href="'+signupHref(g.slug,'acceso').replaceAll('&','&amp;')+'"'));
    const schemas=[...body.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)];
    assert.equal(schemas.length,1);
    const data=JSON.parse(schemas[0][1]);
    assert.equal(data[0]['@type'],'BreadcrumbList');
    assert.equal(data[1]['@type'],'Article');
    assert.equal(data[1].mainEntityOfPage,base+guidePath(g.slug));
    assert.ok(!seen.has(data[1].headline));
    seen.add(data[1].headline);
  }
}));

test('unknown guide returns real 404 and noindex, never the homepage shell',()=>serve(async base=>{
  for(const uri of ['/guias/no-existe','/guias/<private>']){
    const res=await fetch(base+uri);
    assert.equal(res.status,404);
    assert.equal(res.headers.get('x-robots-tag'),'noindex');
    assert.doesNotMatch(await res.text(),/<title>RedLibertad/);
  }
}));

test('standalone guide sitemap has exactly the approved public paths',()=>serve(async base=>{
  const res=await fetch(base+'/sitemap-guias.xml');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/xml/);
  const xml=await res.text();
  assert.equal((xml.match(/<loc>/g)||[]).length,GUIDES.length+1);
  assert.ok(xml.includes('<loc>'+base+'/guias</loc>'));
  for(const g of GUIDES)assert.ok(xml.includes('<loc>'+base+guidePath(g.slug)+'</loc>'));
  assert.equal((xml.match(/<lastmod>/g)||[]).length,GUIDES.length+1);
  assert.ok(!xml.includes('/app'));
  assert.ok(!xml.includes('/api/'));
  assert.ok(!xml.includes('/uploads/'));
}));

test('server mounts guide router before public catch-all and adds sitemap index and robots',()=>{
  const src=read('server.js');
  assert.ok(src.indexOf('app.use(publicGuidesV218.router)')>0);
  assert.ok(src.indexOf('app.use(publicGuidesV218.router)')<src.indexOf("app.get('*'"));
  assert.match(src,/sitemap-guias\.xml/);
  assert.match(src,/Allow: \/guias/);
  assert.match(src,new RegExp("const APP_VERSION='"+require('../package.json').version.replace(/\./g,'\\.')+"'"));
  assert.match(src,/seo-acquisition-guides-v2\.18/);
});

test('homepage links to guides from navigation and visitor orientation section',()=>{
  const html=read('public/index.html');
  assert.match(html,/<a href="\/guias">Guías<\/a>/);
  assert.match(html,/href="\/guias">Leer las guías/);
  assert.match(html,/id="guiasHeading"/);
});

test('signup query includes fixed guide attribution and a safe same-site path',()=>{
  for(const g of GUIDES){
    const [part,anchor]=signupHref(g.slug).split('#');
    const url=new URL(part,'https://redlibertad.com');
    assert.equal(anchor,'registro');
    assert.equal(url.searchParams.get('entry'),'guide');
    assert.equal(url.searchParams.get('entryKey'),g.slug);
    assert.equal(url.searchParams.get('next'),guidePath(g.slug));
    assert.equal(new URL(signupHref(g.slug,'acceso'),'https://redlibertad.com').hash,'#acceso');
  }
});

test('server attribution accepts only same-slug guide and local safe path',()=>{
  const normalize=serverNormalize();
  for(const g of GUIDES){
    const params={entryType:'guide',entryKey:g.slug,entryPath:guidePath(g.slug)};
    const result=normalize(params);
    assert.equal(result.path,guidePath(g.slug));
    assert.equal(result.type,'guide');
  }
  for(const params of [
    {entryType:'guide',entryKey:'como-empezar',entryPath:'/guias/privacidad-y-consentimiento'},
    {entryType:'guide',entryKey:'como-empezar',entryPath:'//evil.example'},
    {entryType:'guide',entryKey:'como-empezar',entryPath:'https://evil.example'},
    {entryType:'guide',entryKey:'../admin',entryPath:'/guias/../admin'},
    {entryType:'guide',entryKey:'como-empezar',entryPath:'/guias/como-empezar?next=/admin'}
  ])assert.equal(normalize(params),null);
});

test('browser validates guide attribution and rejects mismatched or unsafe paths',()=>{
  const valid=browserValidate();
  assert.equal(valid({type:'guide',key:'como-empezar',path:'/guias/como-empezar'}).type,'guide');
  assert.equal(valid({type:'guide',key:'como-empezar',path:'/guias/privacidad-y-consentimiento'}),null);
  assert.equal(valid({type:'guide',key:'como-empezar',path:'//evil.example'}),null);
  assert.equal(valid({type:'guide',key:'a',path:'/guias/a?next=/admin'}),null);
  const code=read('public/app.js');
  assert.match(code,/guide:'una guía'/);
  assert.match(code,/returnPath/);
});

test('SEO admin reports guide counts using fixed approved catalog without DB additions',()=>{
  const code=read('src/routes/admin-seo-v190.js');
  assert.match(code,/GUIDES\.length\+1/);
  assert.match(code,/sitemap-guias\.xml/);
  const routeCode=read('src/public-guides-v218.js');
  assert.doesNotMatch(routeCode,/db\.query|INSERT INTO|DELETE FROM|ALTER TABLE|writeFile/);
});

test('guide CSS protects small touch displays, focus and reduced motion',()=>{
  const css=read('public/guides-v218.css');
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/:reduce\)/);
  assert.match(css,/grid-template-columns:1fr/);
});
