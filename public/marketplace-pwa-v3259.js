'use strict';
// Marketplace: independent app identity and install prompt; same origin, accounts and API.
(function(){
 const banner=document.getElementById('marketPwaInstall');
 const button=document.getElementById('marketPwaInstallButton');
 const help=document.getElementById('marketPwaInstallHelp');
 if(!banner||!button||!help)return;
 const standalone=()=>navigator.standalone===true||!!window.matchMedia?.('(display-mode: standalone)')?.matches;
 const agent=String(navigator.userAgent||'');
 const ios=/iPhone|iPad|iPod/.test(agent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const safari=ios&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent);
 let promptEvent=null,installed=false;
 function update(){
  banner.hidden=installed||standalone()||(!promptEvent&&!safari);
  button.textContent=promptEvent?'Instalar Marketplace':'Cómo instalar en iPhone';
 }
 if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
   navigator.serviceWorker.register('/marketplace-sw-v3259.js',{scope:'/marketplace',updateViaCache:'none'})
    .then(reg=>reg.update().catch(()=>{})).catch(()=>{});
  });
 }
 window.addEventListener('beforeinstallprompt',event=>{
  if(standalone())return;
  event.preventDefault();promptEvent=event;update();
 });
 button.addEventListener('click',async()=>{
  if(promptEvent){
   const event=promptEvent;promptEvent=null;
   try{
    await event.prompt();
    const decision=await event.userChoice;
    if(decision?.outcome!=='accepted')help.textContent='Puedes instalar Marketplace cuando quieras desde el menú del navegador.';
   }catch(_){help.textContent='Usa el menú de tu navegador para instalar Marketplace.';}
   update();return;
  }
  if(safari){help.textContent='En Safari, pulsa Compartir y después «Añadir a pantalla de inicio». Usa el nombre Marketplace.';}
 });
 window.addEventListener('appinstalled',()=>{installed=true;promptEvent=null;update();});
 window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',update);
 update();
})();
