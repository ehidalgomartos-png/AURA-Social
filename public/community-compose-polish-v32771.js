'use strict';
// Community-only visual enhancements; actual upload and publishing remain in social.js.
(()=>{
 const form=document.getElementById('communityPostForm');
 if(!form)return;
 const body=document.getElementById('communityPostBody');
 const fileInput=document.getElementById('communityPostFile');
 const pick=document.getElementById('communityPostPickFile');
 const remove=document.getElementById('communityPostRemoveFile');
 const length=document.getElementById('communityPostLength');
 const preview=document.getElementById('communityPostMediaPreview');
 const thumbnail=document.getElementById('communityPostMediaThumbnail');
 const name=document.getElementById('communityPostMediaName');
 const details=document.getElementById('communityPostMediaDetails');
 if(!body||!fileInput||!pick||!remove||!length||!preview||!thumbnail||!name||!details)return;
 let objectUrl=null;
 function clearObjectUrl(){
   if(objectUrl&&typeof URL.revokeObjectURL==='function')URL.revokeObjectURL(objectUrl);
   objectUrl=null;
 }
 function updateLength(){
   length.textContent=String(body.value.length)+' / 2200';
 }
 function updatePreview(){
   clearObjectUrl();
   const file=fileInput.files?.[0];
   if(!file){
     preview.classList.add('hidden');
     thumbnail.classList.add('hidden');
     thumbnail.removeAttribute('src');
     name.textContent='';
     details.textContent='';
     return;
   }
   preview.classList.remove('hidden');
   name.textContent=file.name;
   details.textContent=(file.type.startsWith('video/')?'Vídeo':'Fotografía')+' · '+Math.max(1,Math.round(file.size/1024))+' KB';
   if(file.type.startsWith('image/')&&typeof URL.createObjectURL==='function'){
     objectUrl=URL.createObjectURL(file);
     thumbnail.src=objectUrl;
     thumbnail.classList.remove('hidden');
   }else{
     thumbnail.classList.add('hidden');
     thumbnail.removeAttribute('src');
   }
 }
 pick.addEventListener('click',()=>fileInput.click());
 remove.addEventListener('click',()=>{
   fileInput.value='';
   updatePreview();
   pick.focus();
 });
 body.addEventListener('input',updateLength);
 fileInput.addEventListener('change',updatePreview);
 // social.js resets the same form on successful publication.
 form.addEventListener('reset',()=>queueMicrotask(()=>{
   updateLength();
   updatePreview();
 }));
 window.addEventListener('pagehide',clearObjectUrl);
 updateLength();
 updatePreview();
})();
