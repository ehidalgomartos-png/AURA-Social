/* V3.2.131 - Solo confirmar mediante gesto del usuario y respuesta del servidor. */
(function(){
  'use strict';
  var button=document.getElementById('confirmEmailButton');
  var status=document.getElementById('verificationStatus');
  if(!button || !status)return;
  var token='';
  try{
    token=(new URLSearchParams(window.location.search)).get('token')||'';
    // No dejar el token en la barra del navegador tras cargarlo.
    window.history.replaceState(null,'','/verificar-email/');
  }catch(_){}
  if(!/^[A-Za-z0-9_-]{40,64}$/.test(token)){
    button.hidden=true;
    status.textContent='El enlace no es válido. Solicita uno nuevo desde RedLibertad.';
    return;
  }
  button.addEventListener('click',async function(){
    button.disabled=true;
    status.textContent='Comprobando el enlace de confirmación...';
    try{
      var response=await fetch('/api/auth/verify-email/confirm',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        cache:'no-store',
        body:JSON.stringify({token:token})
      });
      var data={};
      try{data=await response.json()}catch(_){}
      if(!response.ok || data.ok!==true || data.emailVerified!==true){
        status.textContent=data.error==='verification_unavailable'
          ?'No se pudo verificar ahora. Vuelve a intentarlo más tarde.'
          :'El enlace no es válido, ya se usó o ha caducado.';
        // No permitir repetir un enlace que podría haber sido consumido.
        return;
      }
      token='';
      status.textContent='Correo confirmado correctamente. Ya puedes seguir disfrutando de RedLibertad.';
      button.hidden=true;
      if(window.RedLibertadGoogleAds)window.RedLibertadGoogleAds.trackVerifiedRegistration(data);
    }catch(_){
      status.textContent='No se ha podido completar la verificación. Comprueba tu conexión.';
      button.disabled=false;
    }
  });
})();
