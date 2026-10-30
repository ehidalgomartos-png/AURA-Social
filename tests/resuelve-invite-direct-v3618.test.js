'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function loadInvite(search){
 const js=read('public/resuelve-v350.js');
 const start=js.indexOf(' function bindHelpInvitation(){');
 const end=js.indexOf(' // V3.5.2: solo enlaces',start);
 assert.ok(start>=0&&end>start);
 const source=js.slice(start,end);
 const nodes={};
 let sent=0;
 const el=id=>nodes[id]??=( {
  hidden:true,href:'',textContent:'',attrs:{},events:{},
  setAttribute(name,value){this.attrs[name]=value;},
  addEventListener(type,fn){this.events[type]=fn;}
 });
 const location={origin:'https://redlibertad.com',search};
 const navigator={share:()=>{sent++;return Promise.resolve();}};
 const context=vm.createContext({URL,URLSearchParams,location,navigator,el,window:{}});
 vm.runInContext(source+'\nbindHelpInvitation();',context);
 return {nodes,sent:()=>sent};
}

test('V3.6.18: invitación desde la landing abre métodos de envío, sin segundo registro',()=>{
 const html=read('public/resuelve-como-funciona-v3533.html');
 assert.match(html,/href="\/resuelve\?invitar=1#inviteHelpSection"/);
 assert.match(html,/href="\/resuelve\?registro=1"/);
 assert.match(html,/Una buena respuesta puede cambiarte el día/);
 assert.match(html,/No tienes que registrarte dos veces/);
 const home=read('public/resuelve.html');
 assert.match(home,/id="inviteHelpSection"/);
 assert.match(home,/id="inviteHelpOptions" class="invite-help-options" hidden/);
 assert.match(home,/No se enviará nada automáticamente/);
 for(const id of ['inviteWhatsApp','inviteTelegram','inviteEmail','inviteNativeShare','inviteCopyLink'])
  assert.match(home,new RegExp('id="'+id+'"'));
 assert.match(home,/name="robots" content="noindex,follow"/);
});

test('V3.6.18: el enlace voluntario muestra opciones pero nunca las envía',()=>{
 const {nodes,sent}=loadInvite('?invitar=1');
 assert.equal(nodes.inviteHelpOptions.hidden,false);
 assert.equal(nodes.inviteHelpToggle.attrs['aria-expanded'],'true');
 assert.match(nodes.inviteWhatsApp.href,/^https:\/\/api\.whatsapp\.com\/send\?/);
 assert.match(nodes.inviteTelegram.href,/^https:\/\/t\.me\/share\/url\?/);
 assert.match(nodes.inviteEmail.href,/^mailto:\?/);
 assert.equal(sent(),0);
 assert.equal(nodes.inviteNativeShare.hidden,false);
 nodes.inviteHelpToggle.events.click();
 assert.equal(nodes.inviteHelpOptions.hidden,true);
 assert.equal(nodes.inviteHelpToggle.attrs['aria-expanded'],'false');
 assert.equal(sent(),0);
});

test('V3.6.18: la llegada normal mantiene invitación cerrada',()=>{
 const {nodes,sent}=loadInvite('');
 assert.equal(nodes.inviteHelpOptions.hidden,true);
 assert.equal(nodes.inviteHelpToggle.attrs['aria-expanded'],undefined);
 assert.equal(sent(),0);
 nodes.inviteHelpToggle.events.click();
 assert.equal(nodes.inviteHelpOptions.hidden,false);
 assert.equal(nodes.inviteHelpToggle.attrs['aria-expanded'],'true');
 assert.equal(sent(),0);
});

test('V3.6.18: diseño no oculta opciones y conserva consentimiento',()=>{
 const css=read('public/resuelve-v350.css');
 const part=css.slice(css.lastIndexOf('/* V3.6.18'));
 assert.ok(part.startsWith('/* V3.6.18'));
 assert.match(part,/\.invite-help-disclaimer-v3618/);
 assert.match(part,/@media\(max-width:650px\)/);
 assert.match(part,/grid-column:1\/-1/);
 assert.doesNotMatch(part,/display:none|visibility:hidden|pointer-events:none/);
 const source=read('public/resuelve-v350.js');
 const snippet=source.slice(source.indexOf(' function bindHelpInvitation(){'),source.indexOf(' // V3.5.2: solo enlaces'));
 assert.match(snippet,/new URLSearchParams\(location\.search\)\.get\('invitar'\)==='1'/);
 assert.doesNotMatch(snippet,/sendBeacon|fetch\(|method:'POST'|localStorage|window\.location\.replace/);
 const service=read('src/services/resuelve-v350.js');
 assert.match(service,/q\.seo_public_opt_in=TRUE AND q\.library_opt_out=FALSE/);
});
