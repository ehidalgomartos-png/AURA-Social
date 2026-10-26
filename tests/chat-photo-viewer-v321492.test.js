'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const social=read('public/social.js');
const html=read('public/app.html');
const css=read('public/social.css');

function renderMessage(message){
  const start=social.indexOf('function messageHTML(m,other,conversation=activeConversationMeta)');
  const end=social.indexOf('async function acceptSensitiveMessages(',start);
  assert.ok(start>0&&end>start);
  const context={
    me:{id:1},activeConversationMeta:{is_group:false},
    esc:s=>String(s||''),gateText:()=> 'Acceso restringido',
    mediaHTML:m=>m.media_type==='image'?'<img src="/uploads/photo.jpg" alt="Foto">':'<video src="/uploads/clip.mp4"></video>',
    sharedPostMessageHTML:()=>'',sharedStoryMessageHTML:()=>'',sharedProfileMessageHTML:()=>'',MESSAGE_REACTIONS:{like:'❤️'},
    Date,Map,Number,String,Object,Array
  };
  vm.runInNewContext(social.slice(start,end)+'\nthis.render=messageHTML;',context);
  return context.render({id:20,sender_id:2,created_at:'2026-10-26T09:00:00Z',content_level:'normal',...message});
}

test('tocar una foto de mensaje autorizado abre el visor mediante botón accesible',()=>{
  const output=renderMessage({media_url:'/uploads/photo.jpg',media_type:'image'});
  assert.match(output,/class="message-photo-open" data-message-photo-open aria-label="Ampliar fotografía del mensaje"/);
  assert.match(output,/src="\/uploads\/photo.jpg"/);
  assert.match(output,/<div class="message-media">/);
});

test('vídeos y mensajes sensibles bloqueados NO abren visor de fotos',()=>{
  const video=renderMessage({media_url:'/uploads/clip.mp4',media_type:'video'});
  assert.match(video,/<video/);
  assert.doesNotMatch(video,/data-message-photo-open/);
  const gated=renderMessage({media_url:'/uploads/photo.jpg',media_type:'image',gated:true,gate_reason:'permission_required'});
  assert.match(gated,/Contenido sensible oculto/);
  assert.doesNotMatch(gated,/data-message-photo-open|<img/);
});

function viewerHarness(){
  const handlers={};
  let imageSource='/uploads/photo.jpg';
  const image={currentSrc:imageSource,src:imageSource,alt:'Foto original'};
  const trigger={querySelector:query=>query==='img'?image:null};
  const names=new Set(['hidden']);
  const modal={
    classList:{
      add:n=>names.add(n),
      remove:n=>names.delete(n),
      contains:n=>names.has(n)
    },
    addEventListener:(name,handler)=>handlers['modal-'+name]=handler
  };
  const enlarged={
    src:'',alt:'',
    removeAttribute(name){if(name==='src')this.src='';}
  };
  const closeButton={addEventListener:(name,handler)=>handlers['close-'+name]=handler};
  const els={'#messagePhotoModal':modal,'#messagePhotoFull':enlarged,'#closeMessagePhoto':closeButton};
  const sandbox={
    $:key=>els[key]||null,
    all:selector=>selector==='[data-message-photo-open]'?[trigger]:[],
    String
  };
  const start=social.indexOf('function openMessagePhoto(button)');
  const end=social.indexOf('\nfunction conversationPresence(',start);
  assert.ok(start>0&&end>start);
  vm.runInNewContext(social.slice(start,end)+'\nthis.openPhoto=openMessagePhoto;this.closePhoto=closeMessagePhoto;',sandbox);
  return {sandbox,trigger,modal,enlarged,handlers,names};
}

test('clic abre la imagen a tamaño grande usando el src ya mostrado, sin URLs inventadas',()=>{
  const h=viewerHarness();
  h.sandbox.bindMessageActions();
  assert.equal(typeof h.trigger.onclick,'function');
  h.trigger.onclick();
  assert.equal(h.names.has('hidden'),false);
  assert.equal(h.enlarged.src,'/uploads/photo.jpg');
  assert.equal(h.enlarged.alt,'Foto original');
  h.handlers['close-click']();
  assert.equal(h.names.has('hidden'),true);
  assert.equal(h.enlarged.src,'');
});

test('cierra tocando fuera y deja cierre por Escape mediante el controlador global de modales',()=>{
  const h=viewerHarness();
  h.sandbox.openPhoto(h.trigger);
  h.handlers['modal-click']({target:h.modal,currentTarget:h.modal});
  assert.equal(h.names.has('hidden'),true);
  assert.match(social,/if\(event\.key==='Escape'\)\{[\s\S]*?close\.click\(\)/);
});

test('estilos de visor adaptados a móvil, con accesibilidad y sin alterar otros modales',()=>{
  assert.match(html,/id="messagePhotoModal" class="modal message-photo-modal hidden"/);
  assert.match(html,/id="messagePhotoFull"/);
  assert.match(html,/id="closeMessagePhoto"[^>]*aria-label="Cerrar fotografía"/);
  assert.match(css,/#messagePhotoModal \.message-photo-modal-card\{/);
  assert.match(css,/#messagePhotoModal #messagePhotoFull\{/);
  assert.match(css,/max-height:100dvh/);
  assert.match(css,/env\(safe-area-inset-top\)/);
  assert.match(css,/\.message-photo-open:focus-visible/);
  assert.match(social,/all\('\[data-message-photo-open\]',root\)/);
  assert.match(social,/bindMessageActions\(thread\)/);
});
