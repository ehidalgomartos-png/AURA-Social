'use strict';
// V3.2.66: retire only the old Marketplace-scoped worker; never touch RedLibertad's root PWA.
(function(){
 if(!('serviceWorker' in navigator))return;
 window.addEventListener('load',async()=>{
  try{
   const registrations=await navigator.serviceWorker.getRegistrations();
   const oldScope=new URL('/marketplace/',location.origin).href;
   for(const registration of registrations){
    if(registration.scope===oldScope)await registration.unregister();
   }
  }catch(_){/* Browsing must continue even when worker removal is unavailable. */}
 });
})();
