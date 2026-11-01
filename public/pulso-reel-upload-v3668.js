'use strict';
// V3.6.68 — Progreso real de subida, nunca porcentaje simulado.
// Solo se activa al publicar un Reel; los demás tipos siguen usando uploadFile().
(()=>{
 function upload(file,onProgress=()=>{}){
  return new Promise((resolve,reject)=>{
   if(!file){reject(new Error('Selecciona un archivo antes de publicar.'));return;}
   if(typeof XMLHttpRequest!=='function'){
    reject(new Error('Este navegador no permite mostrar el progreso de subida.'));return;
   }
   const xhr=new XMLHttpRequest();
   const notify=state=>{try{onProgress(state);}catch(_){/* Estado visual opcional */}};
   let settled=false;
   const finish=(error,media)=>{
    if(settled)return;
    settled=true;
    if(error)reject(error);
    else resolve(media);
   };
   xhr.open('POST','/api/media/upload',true);
   xhr.responseType='json';
   xhr.timeout=600000;
   xhr.upload.onprogress=event=>{
    if(event.lengthComputable&&event.total>0){
     const percent=Math.min(99,Math.max(0,Math.floor(100*event.loaded/event.total)));
     notify({phase:'sending',percent});
    }else notify({phase:'sending'});
   };
   xhr.upload.onload=()=>notify({phase:'processing'});
   xhr.onload=()=>{
    let body=xhr.response;
    if(!body||typeof body!=='object'){
     try{body=JSON.parse(xhr.responseText||'{}');}catch(_){body={};}
    }
    if(xhr.status===201&&body?.media?.url&&body?.media?.mediaType){
     notify({phase:'complete'});
     finish(null,body.media);
     return;
    }
    const code=body?.error;
    if(xhr.status===413||code==='file_too_large'||code==='LIMIT_FILE_SIZE'){
     finish(new Error('El archivo supera el límite de subida. Elige un vídeo más pequeño.'));
    }else if(xhr.status===415||code==='unsupported_media_type'){
     finish(new Error('Formato no compatible. Usa MP4, WebM o MOV.'));
    }else if(xhr.status===401){
     finish(new Error('La sesión ha caducado. Vuelve a entrar antes de subir el vídeo.'));
    }else if(xhr.status===429){
     finish(new Error('Demasiadas subidas seguidas. Prueba de nuevo más tarde.'));
    }else{
     finish(new Error('No se pudo completar la subida. El archivo sigue seleccionado: comprueba tu conexión e inténtalo otra vez.'));
    }
   };
   xhr.onerror=()=>finish(new Error('Se ha interrumpido la conexión. El archivo sigue seleccionado; comprueba Internet antes de volver a publicar.'));
   xhr.ontimeout=()=>finish(new Error('La subida ha tardado demasiado. Comprueba la conexión antes de reintentar.'));
   xhr.onabort=()=>finish(new Error('Se canceló la subida. El archivo sigue seleccionado.'));
   const form=new FormData();
   form.append('file',file);
   try{
    notify({phase:'starting'});
    xhr.send(form);
   }catch(_){
    finish(new Error('No se pudo iniciar la subida. Comprueba tu conexión.'));
   }
  });
 }
 window.RedLibertadPulsoUploadV3668=Object.freeze({upload});
})();
