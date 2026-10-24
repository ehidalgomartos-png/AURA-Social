/* V3.2.131.1 — recuperación auto-servicio, sin cargar etiquetas publicitarias. */
(function(){
  'use strict';
  const ask=document.getElementById('requestResetForm');
  const confirm=document.getElementById('confirmResetForm');
  const status=document.getElementById('status');
  let token='';
  try{
    token=new URLSearchParams(window.location.hash.replace(/^#/,'')).get('token')||'';
    window.history.replaceState(null,'','/recuperar-contrasena/');
  }catch(_){}
  if(/^[A-Za-z0-9_-]{40,64}$/.test(token)){
    ask.hidden=true;
    confirm.hidden=false;
  }else{
    token='';
  }
  async function submit(form,url,body){
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true;
    try{
      const response=await fetch(url,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      let data={};try{data=await response.json()}catch(_){}
      return {response,data};
    }finally{button.disabled=false;}
  }
  ask.addEventListener('submit',async e=>{
    e.preventDefault();
    status.textContent='Solicitando enlace...';
    try{
      const email=ask.querySelector('[name="email"]').value.trim();
      const {response}=await submit(ask,'/api/auth/password-reset/request',{email});
      if(response.status===503){
        status.textContent='El envío de correos no está disponible. Contacta con el administrador.';
      }else if(response.status===429){
        status.textContent='Demasiadas solicitudes. Prueba de nuevo más tarde.';
      }else if(response.ok){
        status.textContent='Si existe una cuenta con ese correo, recibirás un enlace para recuperar la contraseña. Revisa también el correo no deseado.';
      }else{
        status.textContent='No se ha podido tramitar la solicitud. Comprueba el correo.';
      }
    }catch(_){status.textContent='No se pudo conectar. Vuelve a intentarlo.';}
  });
  confirm.addEventListener('submit',async e=>{
    e.preventDefault();
    const password=confirm.querySelector('[name="password"]').value;
    const repeated=confirm.querySelector('[name="repeatPassword"]').value;
    if(password!==repeated){status.textContent='Las contraseñas no coinciden.';return;}
    status.textContent='Guardando nueva contraseña...';
    try{
      const {response}=await submit(confirm,'/api/auth/password-reset/confirm',{token,newPassword:password});
      if(response.ok){
        token='';
        confirm.hidden=true;
        status.textContent='Contraseña cambiada correctamente. Vuelve a la página de acceso para entrar con la nueva contraseña.';
      }else if(response.status===400){
        status.textContent='El enlace no es válido o ha caducado. Solicita otro desde la página de recuperación.';
      }else if(response.status===429){
        status.textContent='Demasiados intentos. Prueba más tarde.';
      }else{
        status.textContent='No se pudo cambiar la contraseña ahora. Prueba de nuevo.';
      }
    }catch(_){status.textContent='No se pudo conectar. Vuelve a intentarlo.';}
  });
})();
