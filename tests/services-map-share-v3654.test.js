'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {renderMap}=require('../src/services/services-map-v3645');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const URL_TO_SHARE='https://redlibertad.com/explorar';

test('V3.6.54: compartir el mapa es opcional, solo con enlaces públicos',()=>{
 const html=renderMap();
 assert.match(html,/<section class="sm-share-v3654" aria-labelledby="sm-share-title-v3654">/);
 assert.match(html,/id="sm-share-copy-v3654" disabled/);
 assert.match(html,/id="sm-share-link-v3654"[^>]*readonly hidden/);
 assert.match(html,/id="sm-share-status-v3654" role="status" aria-live="polite"/);
 assert.match(html,/rel="noopener noreferrer external"/);
 assert.match(html,/Tú decides cuándo y con quién/);
 const whats=html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1];
 const email=html.match(/href="(mailto:\?subject=[^"]+)"/)?.[1];
 assert.ok(whats&&email);
 const publicText=new URL(whats).searchParams.get('text');
 const emailText=new URL(email.replace(/&amp;/g,'&')).searchParams.get('body');
 assert.ok(publicText.includes(URL_TO_SHARE));
 assert.ok(emailText.includes(URL_TO_SHARE));
 assert.doesNotMatch(publicText,/\/api\/|token=|usuario=|mensaje=/);
 assert.doesNotMatch(emailText,/\/api\/|token=|usuario=|mensaje=/);
 assert.match(html,/services-map-v3645\.js\?v=3\.6\.54/);
 assert.match(html,/services-map-v3645\.css\?v=3\.6\.54/);
});
function runtime(clipboard){
 const listeners={};
 const input={value:'',addEventListener:(type,cb)=>listeners['input:'+type]=cb};
 const clear={addEventListener:(type,cb)=>listeners['clear:'+type]=cb};
 const copy={disabled:true,addEventListener:(type,cb)=>listeners['copy:'+type]=cb};
 const link={value:URL_TO_SHARE,hidden:true,focus(){this.focused=true;},select(){this.selected=true;}};
 const status={textContent:''};
 const els={'sm-search':input,'sm-search-status':{textContent:''},'sm-no-results':{hidden:true},
  'sm-clear':clear,'sm-share-copy-v3654':copy,'sm-share-link-v3654':link,'sm-share-status-v3654':status};
 const card={dataset:{search:'ayuda consejo'},hidden:false};
 const section={querySelectorAll:()=>[card],hidden:false};
 const document={getElementById:id=>els[id],querySelectorAll:()=>[section]};
 const script=read('public/services-map-v3645.js');
 const sandbox={document,Number,String,Array};
 if(clipboard)sandbox.navigator={clipboard};
 vm.runInNewContext(script,sandbox,{timeout:2500});
 return {copy,link,status,listeners};
}
test('V3.6.54: copiar es opt-in y se confirma únicamente tras acción',async()=>{
 const copied=[];
 const app=runtime({writeText:async value=>{copied.push(value);}});
 assert.equal(app.copy.disabled,false);
 assert.deepEqual(copied,[]);
 await app.listeners['copy:click']();
 assert.deepEqual(copied,[URL_TO_SHARE]);
 assert.equal(app.link.hidden,true);
 assert.match(app.status.textContent,/Enlace copiado/);
});
test('V3.6.54: si el navegador no ofrece portapapeles hay alternativa manual',async()=>{
 const app=runtime(null);
 await app.listeners['copy:click']();
 assert.equal(app.link.hidden,false);
 assert.equal(app.link.focused,true);
 assert.equal(app.link.selected,true);
 assert.match(app.status.textContent,/cópialo/);
});
test('V3.6.54: diseño compacto responsive; sin rastrear consultas',()=>{
 const css=read('public/services-map-v3645.css');
 const js=read('public/services-map-v3645.js');
 assert.match(css,/@media\(max-width:600px\)\{\.sm-share-v3654/);
 assert.match(css,/\.sm-share-actions-v3654 :is\(a,button\)\{min-height:48px/);
 assert.match(css,/\.sm-share-v3654 :is\(a,button,input\):focus-visible/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
 assert.doesNotMatch(css,/\.sm-share-v3654[^}]*position:fixed/);
});
