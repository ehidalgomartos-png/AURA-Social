'use strict';
// V3.6.67 — Vista previa real del Reel en el editor existente.
// El archivo permanece local hasta que la persona confirma Publicar Reel.
(()=>{
 const modal=document.getElementById('modal');
 const input=document.getElementById('mediaFile');
 const preview=document.getElementById('preview');
 const info=document.getElementById('composerReelMediaInfoV3667');
 const label=input?.closest('label.upload-drop');
 const text=document.getElementById('uploadText');
 const remove=document.getElementById('removePostMedia');
 if(!modal||!input||!preview||!info||!label||!text)return;

 const isReel=()=>modal.dataset.composerMode==='reel';
 const sizeLabel=n=>Number.isFinite(n)&&n>=0
  ?(n/1048576).toLocaleString('es-ES',{maximumFractionDigits:1})+' MB':'';
 const durationLabel=n=>{
  if(!Number.isFinite(n)||n<=0)return '';
  const seconds=Math.floor(n);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 };
 function sync(){
  const reel=isReel();
  const file=input.files?.[0]||null;
  // El vídeo del preview no debe quedar dentro del <label> de subida:
  // allí el toque sobre Play abre el selector en algunos móviles.
  if(reel&&preview.parentElement===label)label.after(preview);
  else if(!reel&&preview.parentElement!==label){
   preview.querySelector('video')?.pause();
   label.append(preview);
  }
  modal.classList.toggle('pulso-reel-selected-v3667',!!(reel&&file));
  if(!reel||!file){
   info.hidden=true;
   info.textContent='';
   if(!file)text.classList.remove('hidden');
   else if(!reel)text.classList.add('hidden');
   return;
  }
  // El label original sigue permitiendo cambiar el archivo, sin añadir botones.
  text.textContent='Cambiar foto o vídeo';
  text.classList.remove('hidden');
  info.hidden=false;
  const name=String(file.name||'Archivo seleccionado').slice(0,120);
  const kind=String(file.type||'').startsWith('video/')?'Vídeo':'Imagen';
  const base=[kind,name,sizeLabel(file.size)].filter(Boolean).join(' · ');
  info.textContent=base+' · Vista previa local';
  const video=preview.querySelector('video');
  if(!video)return;
  video.controls=true;
  video.preload='metadata';
  video.setAttribute('playsinline','');
  const renderTechnical=()=>{
   if(!isReel()||input.files?.[0]!==file||preview.querySelector('video')!==video)return;
   const duration=durationLabel(video.duration);
   const dimensions=Number(video.videoWidth)>0&&Number(video.videoHeight)>0
    ?video.videoWidth+' × '+video.videoHeight:'';
   const format=video.videoWidth>video.videoHeight
    ?'El formato vertical aprovecha mejor la pantalla de Pulso.':'';
   info.textContent=[base,duration,dimensions,format,'Vista previa local'].filter(Boolean).join(' · ');
  };
  if(video.readyState>=1)renderTechnical();
  else video.addEventListener('loadedmetadata',renderTechnical,{once:true});
 }
 input.addEventListener('change',sync);
 remove?.addEventListener('click',sync);
 if(typeof MutationObserver==='function'){
  new MutationObserver(records=>{
   if(records.some(record=>record.attributeName==='data-composer-mode'))sync();
  }).observe(modal,{attributes:true,attributeFilter:['data-composer-mode']});
 }
 sync();
})();
