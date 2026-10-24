/* V3.2.131 - Solo confirmar mediante gesto del usuario y respuesta del servidor. */
(function(){
  'use strict';
  var button=document.getElementById('confirmEmailButton');
  var status=document.getElementById('verificationStatus');
  if(!button || !status)return;
  var token='';
  try{
    token=(new URLSearchParams(window.location.hash.replace(/^#/,''))).get('token')||'';
    if(!token)token=(new URLSearchParams(window.location.search)).get('token')||'';
    // No dejar el token en la barra del navegador tras cargarlo.
    window.history.replaceState(null,'','/verificar-email/');
  }catch(_){}
  if(!/^[A-Za-z0-9_-]{40,64}$/.test(token)){
    button.hidden=true;
    status.textContent='El enlace no es válido. Solicita uno nuevo desde RedLibertad.';
  }
  var resend=document.getElementById('resendEmailButton');
  if(resend)resend.addEventListener('click',async function(){
    resend.disabled=true;
    status.textContent='Solicitando otro enlace...';
    try{
      var reply=await fetch('/api/auth/verify-email/resend',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},cache:'no-store',body:'{}'
      });
      if(reply.ok)status.textContent='Te hemos enviado otro enlace de confirmación. Revisa tu correo.';
      else if(reply.status===401)status.textContent='Primero inicia sesión en RedLibertad para reenviar el correo.';
      else status.textContent='No se pudo enviar otro enlace todavía. Prueba más tarde.';
    }catch(_){status.textContent='No se pudo solicitar el enlace. Comprueba tu conexión.';}
    resend.disabled=false;
  });
  var anonymous=document.getElementById('anonymousVerifyForm');
  if(anonymous)anonymous.addEventListener('submit',async function(event){
    event.preventDefault();
    var submit=anonymous.querySelector('button[type="submit"]');
    submit.disabled=true;
    status.textContent='Solicitando confirmación...';
    try{
      var email=anonymous.querySelector('[name="email"]').value.trim();
      var response=await fetch('/api/auth/verify-email/request',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})
      });
      if(response.ok)status.textContent='Si tu cuenta existe y aún necesita confirmación, te enviaremos un enlace. Comprueba también la carpeta de spam.';
      else if(response.status===503)status.textContent='El envío de correos no está disponible. Contacta con el administrador.';
      else if(response.status===429)status.textContent='Demasiadas solicitudes. Prueba más tarde.';
      else status.textContent='Comprueba el correo electrónico que has escrito.';
    }catch(_){status.textContent='No se pudo conectar. Vuelve a intentarlo.';}
    submit.disabled=false;
  });
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
