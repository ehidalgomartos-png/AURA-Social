'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const moduleCode=read('public/facebook-auto-v3413.js');
const parserCode=read('public/social-embeds-v341.js');
const example='https://www.facebook.com/pagina/posts/pfbid01XYabcde';

function createEnvironment({supportsObserver=true,storeFails=false,viewerCards=1}={}){
 const values=new Map();
 const inputs={id:'facebookAutoEmbedV3413',checked:false,disabled:false};
 const status={id:'facebookAutoEmbedStatusV3413',textContent:''};
 const cards=Array.from({length:viewerCards},(_,i)=>({
   dataset:{socialCard:'facebook',socialKind:'post'},
   innerHTML:'<button>Ver aquí</button>',isConnected:true,
   querySelector(selector){if(selector!=='[data-social-activate]')return null;
     if(this.innerHTML==='<iframe>')return null;
     return {dataset:{socialUrl:example},isConnected:true};}
 }));
 const draft={dataset:{socialCard:'facebook',socialKind:'post'},innerHTML:'Vista previa de borrador',
   querySelector(){return {dataset:{socialUrl:example},isConnected:true};}};
 const events={};
 const doc={
   getElementById:id=>id===inputs.id?inputs:id===status.id?status:null,
   addEventListener:(name,handler)=>{events[name]=handler;},
   querySelectorAll:selector=>selector==='article.post [data-social-card="facebook"]'?cards:
     selector==='[data-social-card="facebook"]'?[...cards,draft]:[]
 };
 const watchers=[];
 class IO{
   constructor(callback,options){this.callback=callback;this.options=options;this.watching=new Set();watchers.push(this);}
   observe(card){this.watching.add(card);}
   unobserve(card){this.watching.delete(card);}
   disconnect(){this.watching.clear();}
   fire(){
     this.callback([...this.watching].map(target=>({target,isIntersecting:true})));
   }
 }
 const global={
   document:doc,URL,
   localStorage:{
     getItem(key){if(storeFails)throw Error('storage disabled');return values.get(key)||null;},
     setItem(key,val){if(storeFails)throw Error('storage disabled');values.set(key,val);}
   }
 };
 if(supportsObserver)global.IntersectionObserver=IO;
 const context={window:global,URL};
 vm.runInNewContext(parserCode,context);
 vm.runInNewContext(moduleCode,context);
 const api=global.RedLibertadFacebookAutoV3413;
 const rawParser=global.RedLibertadSocialEmbedsV341;
 const calls=[];
 const provider={
   parse:rawParser.parse,playerUrl:rawParser.playerUrl,
   async activate(info,root){
     calls.push(info);
     root.innerHTML='<iframe>';
     return true;
   }
 };
 return {api,calls,cards,draft,doc,events,inputs,status,watchers,provider,values};
}

test('default OFF never makes remote requests or creates observers',()=>{
 const e=createEnvironment();
 e.api.setViewer(17,e.provider);
 e.api.scan(e.doc);
 assert.equal(e.api.isEnabled(),false);
 assert.equal(e.inputs.checked,false);
 assert.equal(e.calls.length,0);
 assert.equal(e.watchers.length,0);
 assert.equal(e.cards[0].innerHTML,'<button>Ver aquí</button>');
});

test('explicit opt-in loads only a saved Facebook post when it enters viewport',async()=>{
 const e=createEnvironment();
 e.api.setViewer(17,e.provider);
 e.events.change({target:{id:'facebookAutoEmbedV3413',checked:true}});
 assert.equal(e.api.isEnabled(),true);
 assert.equal(e.inputs.checked,true);
 assert.equal(e.watchers.length,1);
 assert.equal(e.watchers[0].watching.size,1);
 assert.equal(e.calls.length,0);
 assert.equal(e.draft.innerHTML,'Vista previa de borrador');
 assert.equal(e.watchers[0].options.threshold,0.15);
 e.watchers[0].fire();
 await Promise.resolve();
 assert.equal(e.calls.length,1);
 assert.equal(e.cards[0].innerHTML,'<iframe>');
 assert.equal(e.api.canAutoEmbed(e.cards[0]),null);
 assert.equal(e.draft.innerHTML,'Vista previa de borrador');
});

test('revoking restores auto-loaded cards, disconnects observer and blocks further auto-loading',async()=>{
 const e=createEnvironment({viewerCards:2});
 e.api.setViewer(21,e.provider);
 assert.equal(e.api.save(true),true);
 e.watchers[0].fire();
 await Promise.resolve();
 assert.equal(e.calls.length,2);
 assert.equal(e.api.save(false),true);
 assert.equal(e.api.isEnabled(),false);
 for(const card of e.cards)assert.equal(card.innerHTML,'<button>Ver aquí</button>');
 assert.equal(e.watchers[0].watching.size,0);
 assert.match(e.status.textContent,/Desactivado/);
 e.api.scan(e.doc);
 assert.equal(e.watchers.length,1);
});

test('per-account/per-browser setting is not inherited when switching users',async()=>{
 const e=createEnvironment();
 e.api.setViewer(17,e.provider);
 e.api.save(true);
 e.watchers[0].fire();
 await Promise.resolve();
 e.api.setViewer(18,e.provider);
 assert.equal(e.api.isEnabled(),false);
 assert.equal(e.inputs.checked,false);
 assert.equal(e.cards[0].innerHTML,'<button>Ver aquí</button>');
 assert.equal(e.api.save(true),true);
 e.api.setViewer(17,e.provider);
 assert.equal(e.api.isEnabled(),true);
 assert.equal(e.inputs.checked,true);
});

test('disabled localStorage, absent login and browsers without IO keep manual buttons usable',()=>{
 const noStore=createEnvironment({storeFails:true});
 noStore.api.setViewer(17,noStore.provider);
 assert.equal(noStore.api.save(true),false);
 assert.equal(noStore.api.isEnabled(),false);
 assert.match(noStore.status.textContent,/No se pudo guardar/);
 const noUser=createEnvironment();
 noUser.api.setViewer(null,noUser.provider);
 assert.equal(noUser.inputs.disabled,true);
 assert.equal(noUser.api.save(true),false);
 const noIO=createEnvironment({supportsObserver:false});
 noIO.api.setViewer(17,noIO.provider);
 assert.equal(noIO.api.save(true),true);
 assert.equal(noIO.watchers.length,0);
 assert.equal(noIO.calls.length,0);
});

test('short Facebook links and non-Facebook providers never auto-load',()=>{
 const e=createEnvironment();
 e.cards[0].dataset.socialKind='short';
 e.api.setViewer(1,e.provider);
 e.api.save(true);
 assert.equal(e.watchers.length,1);
 assert.equal(e.watchers[0].watching.size,0);
 e.cards[0].dataset.socialKind='post';
 e.cards[0].dataset.socialCard='instagram';
 e.api.scan(e.doc);
 assert.equal(e.watchers[0].watching.size,0);
});

test('automatic insertions are bounded for feed performance, with manual links intact',async()=>{
 const e=createEnvironment({viewerCards:20});
 e.api.setViewer(4,e.provider);
 e.api.save(true);
 assert.equal(e.watchers[0].watching.size,20);
 e.watchers[0].fire();
 await Promise.resolve();
 assert.equal(e.calls.length,e.api.MAX_AUTO_PER_PAGE);
 assert.equal(e.cards[e.api.MAX_AUTO_PER_PAGE].innerHTML,'<button>Ver aquí</button>');
});

test('full app has a clear reversible consent, viewer linkage, no draft autoload and cache references',()=>{
 const app=read('public/app.html'),social=read('public/social.js'),
       sw=read('public/sw.js'),css=read('public/social.css'),ci=read('.github/workflows/validate-js.yml');
 assert.match(app,/id="facebookAutoEmbedV3413" type="checkbox"/);
 assert.doesNotMatch(app,/id="facebookAutoEmbedV3413"[^>]*checked/);
 assert.match(app,/IP y sus cookies/);
 assert.match(app,/Desactivado por defecto/);
 assert.match(app,/Preferencia guardada solo en este dispositivo/);
 assert.match(app,/\/facebook-auto-v3413\.js\?v=3\.4\.1\.3/);
 assert.ok(app.indexOf('/facebook-auto-v3413.js')<app.indexOf('/social.js?v='));
 assert.match(social,/RedLibertadFacebookAutoV3413\?\.setViewer\(me\?\.id/);
 assert.match(social,/RedLibertadFacebookAutoV3413\?\.scan\(root\)/);
 assert.match(moduleCode,/article\.post \[data-social-card="facebook"\]/);
 assert.ok(!moduleCode.includes('fetch('));
 assert.match(css,/\.facebook-auto-consent-v3413/);
 assert.match(sw,/\/facebook-auto-v3413\.js/);
 assert.match(ci,/facebook-auto-v3413\.test\.js/);
});
