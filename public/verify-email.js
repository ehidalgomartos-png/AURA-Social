/* V3.2.131.3 — Una sola acción según el estado del enlace. */
(function(){
  'use strict';
  var button=document.getElementById('confirmEmailButton');
  var panel=document.getElementById('confirmPanel');
  var anonymous=document.getElementById('anonymousVerifyForm');
  var intro=document.getElementById('verificationIntro');
  var status=document.getElementById('verificationStatus');
  if(!button || !panel || !anonymous || !intro || !status)return;

  var token='';
  var suppliedToken=false;
  try{
    token=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('token')||'';
    if(!token)token=new URLSearchParams(window.location.search).get('token')||'';
    suppliedToken=Boolean(token);
    // Retirar el código de la URL antes de cargar las etiquetas publicitarias.
    window.history.replaceState(null,'','/verificar-email/');
  }catch(_){}

  function setStatus(message,kind){
    status.textContent=message;
    status.dataset.state=kind||'info';
    status.hidden=false;
  }
  function showRequest(){
    token='';
    panel.hidden=true;
    anonymous.hidden=false;
    intro.textContent='Introduce tu correo para recibir un nuevo enlace de confirmación.';
  }
  function showConfirmation(){
    panel.hidden=false;
    anonymous.hidden=true;
    intro.textContent='Ya puedes confirmar tu dirección de correo electrónico.';
  }

  if(/^[A-Za-z0-9_-]{40,64}$/.test(token)){
    showConfirmation();
  }else{
    showRequest();
    if(suppliedToken)setStatus('El enlace no es válido. Puedes pedir uno nuevo aquí.','error');
  }

  anonymous.addEventListener('submit',async function(event){
    event.preventDefault();
    var submit=anonymous.querySelector('button[type="submit"]');
    submit.disabled=true;
    setStatus('Solicitando el enlace...');
    try{
      var email=anonymous.querySelector('[name="email"]').value.trim();
      var response=await fetch('/api/auth/verify-email/request',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})
      });
      if(response.ok)setStatus('Si tu cuenta existe y está pendiente de confirmar, recibirás un enlace. Comprueba también la carpeta de correo no deseado.');
      else if(response.status===503)setStatus('El envío de correos no está disponible ahora. Prueba más tarde.','error');
      else if(response.status===429)setStatus('Demasiadas solicitudes. Prueba más tarde.','error');
      else setStatus('Revisa el correo electrónico indicado.','error');
    }catch(_){setStatus('No se pudo conectar. Prueba de nuevo.','error');}
    submit.disabled=false;
  });

  button.addEventListener('click',async function(){
    if(!token)return;
    button.disabled=true;
    setStatus('Comprobando el enlace...');
    try{
      var response=await fetch('/api/auth/verify-email/confirm',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',cache:'no-store',
        body:JSON.stringify({token:token})
      });
      var data={};
      try{data=await response.json()}catch(_){}
      if(!response.ok || data.ok!==true || data.emailVerified!==true){
        if(response.status===400 || data.error==='invalid_or_expired'){
          showRequest();
          setStatus('Este enlace ha caducado o ya se ha utilizado. Solicita uno nuevo aquí.','error');
        }else{
          setStatus('No se pudo verificar el correo ahora. Puedes intentarlo de nuevo.','error');
          button.disabled=false;
        }
        return;
      }
      token='';
      panel.hidden=true;
      anonymous.hidden=true;
      intro.textContent='Tu correo está confirmado y puedes seguir utilizando RedLibertad.';
      setStatus('Correo confirmado correctamente.');
      if(window.RedLibertadGoogleAds)window.RedLibertadGoogleAds.trackVerifiedRegistration(data);
    }catch(_){
      setStatus('No se ha podido completar la verificación. Comprueba tu conexión.','error');
      button.disabled=false;
    }
  });
})();
