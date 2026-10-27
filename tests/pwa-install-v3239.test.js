'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const code=read('public/pwa.js'),html=read('public/index.html'),
  app=read('public/app.html'),css=read('public/pwa-install.css'),sw=read('public/sw.js');

function simulate({agent='Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit Chrome/121 Mobile',standalone=false,persisted={},withSidebar=false,appShell=false}={}){
  const windowEvents={},docEvents={},storage=new Map(Object.entries(persisted));
  const events={};const buttons={};
  function button(key){
    return buttons[key]??=({textContent:'',hidden:false,disabled:false,attrs:{},
      addEventListener(name,fn){events[key+':'+name]=fn},
      setAttribute(n,value){this.attrs[n]=value},
      focus(){}});
  }
  const banner={
    hidden:true,className:'',innerHTML:'',attrs:{},
    setAttribute(n,v){this.attrs[n]=v},
    querySelector(sel){return button(sel)}
  };
  const body={
    appended:[],cls:new Set(),appendChild(n){this.appended.push(n)},
    classList:{add(n){body.cls.add(n)}}
  };
  const sidebar=withSidebar?{classList:{hidden:true,toggle(_,hidden){this.hidden=hidden}},onclick:null}:null;
  const document={
    body,readyState:'complete',visibilityState:'visible',
    addEventListener(n,fn){docEvents[n]=fn},
    createElement(tag){assert.equal(tag,'aside');return banner},
    querySelector(sel){if(sel==='#installApp')return sidebar;if(sel==='.social-shell')return appShell?{}:null;return null}
  };
  const mmCallbacks=[];
  const window={
    addEventListener(n,fn){windowEvents[n]=fn},
    matchMedia(q){return {matches:standalone && q.includes('standalone'),addEventListener(n,fn){mmCallbacks.push(fn)}}}
  };
  const navigator={
    userAgent:agent,standalone:standalone,platform:'',maxTouchPoints:0
  };
  const localStorage={
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,v),
    removeItem:k=>storage.delete(k)
  };
  vm.runInNewContext(code,{window,document,navigator,localStorage,Date});
  return {window,document,navigator,banner,buttons,events,windowEvents,docEvents,storage,sidebar,mmCallbacks};
}
test('install offer appears for Android visitors without login and falls back to manual guide',async()=>{
  const a=simulate();
  assert.equal(a.banner.hidden,false);
  assert.equal(a.buttons['.pwa-install-primary-v3239'].textContent,'Cómo instalarla');
  await a.events['.pwa-install-primary-v3239:click']();
  assert.equal(a.buttons['.pwa-install-guide-v3239'].hidden,false);
  assert.match(a.buttons['.pwa-install-guide-v3239'].textContent,/Añadir a pantalla de inicio/);
});
test('native Android prompt stays behind a real user gesture and appinstalled hides offer',async()=>{
  const a=simulate({withSidebar:true,appShell:true});
  let prompts=0;const event={preventDefault(){this.prevented=true},async prompt(){prompts++},
    userChoice:Promise.resolve({outcome:'accepted'})};
  a.windowEvents.beforeinstallprompt(event);
  assert.equal(prompts,0);
  assert.equal(event.prevented,true);
  assert.equal(a.buttons['.pwa-install-primary-v3239'].textContent,'Instalar');
  assert.equal(a.sidebar.classList.hidden,false);
  assert.ok(a.document.body.cls.has('pwa-install-inside-app-v3239'));
  await a.events['.pwa-install-primary-v3239:click']();
  assert.equal(prompts,1);
  assert.equal(a.banner.hidden,true);
  assert.equal(a.storage.has('redlibertad-pwa-installed-v3239'),false);
  a.windowEvents.appinstalled();
  assert.equal(a.storage.get('redlibertad-pwa-installed-v3239'),'1');
  assert.equal(a.banner.hidden,true);
  assert.equal(a.sidebar.classList.hidden,true);
});
test('installed app (Android standalone and iOS home-screen mode) never displays install offer',()=>{
  for(const agent of ['Mozilla Android Mobile','Mozilla iPhone Safari']){
    const a=simulate({agent,standalone:true,withSidebar:true});
    assert.equal(a.banner.hidden,true);
    assert.equal(a.sidebar.classList.hidden,true);
    a.windowEvents.pageshow();
    assert.equal(a.banner.hidden,true);
  }
});
test('installed confirmation from previous visit prevents repeated offer',()=>{
  const a=simulate({persisted:{'redlibertad-pwa-installed-v3239':'1'}});
  assert.equal(a.banner.hidden,true);
  const event={preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})};
  a.windowEvents.beforeinstallprompt(event);
  assert.equal(a.banner.hidden,false,'fresh native installability allows reinstall after uninstall');
});
test('iPhone Safari provides honest instructions and manual confirmation stops prompts',async()=>{
  const a=simulate({agent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari'});
  assert.equal(a.banner.hidden,false);
  await a.events['.pwa-install-primary-v3239:click']();
  assert.match(a.buttons['.pwa-install-guide-v3239'].textContent,/Safari, toca Compartir/);
  a.events['.pwa-install-already-v3239:click']();
  assert.equal(a.banner.hidden,true);
  assert.equal(a.storage.get('redlibertad-pwa-installed-v3239'),'1');
});
test('iOS alternate browser mentions Safari because native prompt cannot be forced',async()=>{
  const a=simulate({agent:'Mozilla/5.0 (iPhone) AppleWebKit CriOS/118'});
  await a.events['.pwa-install-primary-v3239:click']();
  assert.match(a.buttons['.pwa-install-guide-v3239'].textContent,/Abre RedLibertad en Safari/);
});
test('closing banner saves time-bounded dismissal, not a fake installation',()=>{
  const a=simulate();a.events['.pwa-install-close-v3239:click']();
  assert.equal(a.banner.hidden,true);
  assert.equal(a.storage.has('redlibertad-pwa-installed-v3239'),false);
  const until=Number(a.storage.get('redlibertad-pwa-dismiss-until-v3239'));
  assert.ok(until>Date.now()+6*24*60*60*1000);
  const b=simulate({persisted:Object.fromEntries(a.storage)});
  assert.equal(b.banner.hidden,true);
  const c=simulate({persisted:{'redlibertad-pwa-dismiss-until-v3239':'1'}});
  assert.equal(c.banner.hidden,false);
});
test('desktop does not show intrusive banner; installs only through native browser readiness',()=>{
  const a=simulate({agent:'Mozilla/5.0 (X11; Linux x86_64) Chrome/122',withSidebar:true});
  assert.equal(a.document.body.appended.length,0);
  assert.equal(a.sidebar.classList.hidden,true);
  a.windowEvents.beforeinstallprompt({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'dismissed'})});
  assert.equal(a.document.body.appended.length,0);
  assert.equal(a.sidebar.classList.hidden,false);
});
test('PWA pages load shared style and versioned script; browser cache refreshes on rollout',()=>{
  for(const page of [html,app]){
    assert.match(page,/href="\/manifest\.webmanifest"/);
    assert.match(page,/\/pwa-install\.css\?v=3\.2\.39/);
    assert.match(page,/\/pwa\.js\?v=3\.2\.39/);
  }
  assert.match(css,/pwa-install-banner-v3239\[hidden\]/);
  assert.match(css,/@media\(display-mode:standalone\)/);
  assert.match(css,/body\.pwa-install-inside-app-v3239/);
  assert.match(sw,/redlibertad-v3323-shell/);
  assert.match(sw,/\/pwa-badges-v3323\.js/);
  assert.match(sw,/\/pwa-install\.css/);
  assert.match(read('public/manifest.webmanifest'),/"display": "standalone"/);
  assert.match(read('public/social.js'),/shared \/pwa\.js handles installability/);
  assert.doesNotMatch(read('public/social.js'),/redlibertad-install-ready/);
  assert.equal(JSON.parse(read('package.json')).version,'3.2.77');
  assert.match(read('server.js'),/APP_VERSION='3\.2\.77'/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:pwa-install/);
});

test('mobile notice stays out of the way during form entry and returns after blur',()=>{
  const a=simulate();
  assert.equal(a.banner.hidden,false);
  const field={tagName:'INPUT'};
  a.docEvents.focusin({target:field});
  assert.equal(a.banner.hidden,true);
  a.docEvents.focusout({target:field});
  assert.equal(a.banner.hidden,false);
  assert.match(code,/authFormInView=visibleForms.size>0/);
});
