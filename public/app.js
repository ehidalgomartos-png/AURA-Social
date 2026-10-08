const qs=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const register=qs('#registerForm'),login=qs('#loginForm');
async function jsonFetch(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let d={};try{d=await r.json()}catch{}return {r,d};}
// Avoid duplicate requests on slow mobile connections and always restore controls.
const activeAuthSubmissions=new WeakSet();
async function submitOnce(form,messageSelector,run){
  if(activeAuthSubmissions.has(form))return;
  activeAuthSubmissions.add(form);
  const button=form.querySelector('[type="submit"]');
  const previouslyDisabled=Boolean(button?.disabled);
  if(button)button.disabled=true;
  try{
    await run();
  }catch(_){
    const message=qs(messageSelector);
    if(message)message.textContent='No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.';
  }finally{
    if(button)button.disabled=previouslyDisabled;
    activeAuthSubmissions.delete(form);
  }
}
const PUBLIC_ENTRY_STORAGE='redlibertad-public-entry-v188';
function validPublicEntry(value){
  const type=String(value?.type||'').trim().toLowerCase();
  const key=String(value?.key||'').trim().slice(0,120);
  const path=String(value?.path||'').trim();
  const ts=Number(value?.ts||0);
  if(ts && (Date.now()-ts>2*60*60*1000 || ts>Date.now()+60*1000))return null;
  const patterns={
    profile:{key:/^[A-Za-z0-9_.]{3,30}$/,path:/^\/perfil\/[A-Za-z0-9_.]{3,30}$/},
    post:{key:/^\d+$/,path:/^\/p\/\d+$/},
    community:{key:/^\d+$/,path:/^\/comunidad\/\d+(?:\/[a-z0-9-]{1,100})?$/},
    event:{key:/^\d+$/,path:/^\/evento\/\d+(?:\/[a-z0-9-]{1,100})?$/},
    reel:{key:/^\d+$/,path:/^\/reel\/\d+(?:\/[a-z0-9-]{1,100})?$/},
    topic:{key:/^[a-z0-9-]{1,80}$/,path:/^\/tema\/[a-z0-9-]{1,80}$/},
    guide:{key:/^[a-z0-9-]{1,80}$/,path:/^\/guias\/[a-z0-9-]{1,80}$/},
    story:{key:/^\d+$/,path:/^\/historia\/\d+$/}
  };
  const rule=patterns[type];
  return rule&&rule.key.test(key)&&rule.path.test(path)&&
    (type!=='guide'||path==='/guias/'+key)?{type,key,path,ts:ts||Date.now()}:null;
}
function loadPublicEntry(){
  const params=new URLSearchParams(location.search);
  const direct=validPublicEntry({type:params.get('entry'),key:params.get('entryKey'),path:params.get('next')});
  if(direct){
    try{sessionStorage.setItem(PUBLIC_ENTRY_STORAGE,JSON.stringify(direct));}catch{}
    return direct;
  }
  try{return validPublicEntry(JSON.parse(sessionStorage.getItem(PUBLIC_ENTRY_STORAGE)||'null'));}catch{return null;}
}
const publicEntry=loadPublicEntry();
function finishPublicEntry(serverPath=''){
  const path=publicEntry&&(!serverPath||serverPath===publicEntry.path)?publicEntry.path:'';
  if(path){try{sessionStorage.removeItem(PUBLIC_ENTRY_STORAGE);}catch{} location.href=path;return;}
  location.href='/app';
}
function registrationValidationMessage(data){
  const fields=data?.details?.fieldErrors||{};
  const messages=[];
  if(fields.displayName?.length)messages.push('Nombre visible: escribe entre 1 y 80 caracteres.');
  if(fields.username?.length)messages.push('Usuario: usa de 3 a 30 caracteres, solo letras, números, punto y guion bajo.');
  if(fields.email?.length)messages.push('Email: introduce una dirección de correo válida.');
  if(fields.password?.length)messages.push('Contraseña: debe tener entre 10 y 128 caracteres.');
  if(fields.birthDate?.length)messages.push('Fecha de nacimiento: selecciona una fecha válida.');
  if(fields.acceptTerms?.length)messages.push('Debes confirmar que eres mayor de 18 años y aceptar las condiciones.');
  return messages.length?messages.join(' '):'Hay datos que no son válidos. Revisa los campos indicados e inténtalo de nuevo.';
}
if(register)register.addEventListener('submit',async e=>{e.preventDefault();await submitOnce(register,'#formMessage',async()=>{const m=qs('#formMessage'),fd=new FormData(register);m.textContent='Creando cuenta...';const {r,d}=await jsonFetch('/api/auth/register',{method:'POST',body:JSON.stringify({displayName:fd.get('displayName'),username:fd.get('username'),email:fd.get('email'),password:fd.get('password'),birthDate:fd.get('birthDate'),acceptTerms:fd.get('acceptTerms')==='on',referralUsername:fd.get('referralUsername')||'',referralToken:fd.get('referralToken')||'',entryType:publicEntry?.type||'',entryKey:publicEntry?.key||'',entryPath:publicEntry?.path||''})});if(!r.ok){m.textContent=({adult_only:'RedLibertad es exclusiva para mayores de 18 años.',account_exists:'Ya existe una cuenta con ese email o usuario.',invalid_data:registrationValidationMessage(d),invalid_birth_date:'La fecha de nacimiento no es válida. Selecciona una fecha correcta.',registration_failed:'No se pudo completar el registro. Inténtalo de nuevo.',too_many_registration_attempts:(()=>{const mins=Math.max(1,Math.ceil(Number(d.retryAfterSeconds||0)/60));return `Hemos detectado varios intentos con estos datos o desde esta red. Espera ${mins} ${mins===1?'minuto':'minutos'} y vuelve a intentarlo.`;})()})[d.error]||'No se pudo crear la cuenta.';return}finishPublicEntry(d.returnPath||'');});});
if(login)login.addEventListener('submit',async e=>{e.preventDefault();await submitOnce(login,'#loginMessage',async()=>{const m=qs('#loginMessage'),fd=new FormData(login);m.textContent='Entrando...';const {r,d}=await jsonFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});if(!r.ok){if(d.error==='too_many_login_attempts'){m.textContent='Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.';return}if(d.error==='account_suspended'){const until=d.suspendedUntil?new Date(d.suspendedUntil).toLocaleString('es-ES'):'hasta nuevo aviso';m.textContent='Cuenta suspendida '+until+(d.reason?' · '+d.reason:'');return}if(d.error==='account_banned'){m.textContent='Esta cuenta ha sido bloqueada por moderación.';return}m.textContent=d.error==='account_unavailable'?'Esta cuenta no está disponible.':'Email o contraseña incorrectos.';return}finishPublicEntry();});});

(async()=>{
  if(!register)return;
  const params=new URLSearchParams(location.search);
  const inviteToken=String(params.get('invite')||'').trim();
  const ref=String(params.get('ref')||'').trim().replace(/^@/,'');
  const hiddenRef=register.querySelector('[name="referralUsername"]');
  const hiddenToken=register.querySelector('[name="referralToken"]');
  const notice=qs('#inviteNotice');
  if(notice&&publicEntry){
    const labels={profile:'un perfil',post:'una publicación',community:'una comunidad',event:'un evento',reel:'un Reel',topic:'un tema',guide:'una guía',story:'una historia'};
    notice.innerHTML='<span class="invite-notice-avatar">↩</span><span>Continúa donde estabas.<small>Después de entrar o crear tu cuenta volverás a '+esc(labels[publicEntry.type]||'ese contenido')+'.</small></span>';
    notice.classList.remove('hidden');
  }
  const showInviter=profile=>{
    if(!notice||!profile)return;
    notice.innerHTML='<span class="invite-notice-avatar">'+(profile.avatar_url?'<img src="'+esc(profile.avatar_url)+'" alt="">':esc((profile.display_name||profile.username||'R').slice(0,1).toUpperCase()))+'</span><span><b>'+esc(profile.display_name||profile.username)+'</b> te ha invitado a RedLibertad.<small>Crea tu cuenta y empieza a conectar.</small></span>';
    notice.classList.remove('hidden');
    register.scrollIntoView({behavior:'smooth',block:'center'});
  };
  if(/^[A-Za-z0-9_-]{16,64}$/.test(inviteToken)){
    if(hiddenToken)hiddenToken.value=inviteToken;
    try{
      const {r,d}=await jsonFetch('/api/growth/invites/'+encodeURIComponent(inviteToken));
      if(r.ok&&d.invite?.inviter){
        showInviter(d.invite.inviter);
        const key='redlibertad-invite-open:'+inviteToken;
        if(!sessionStorage.getItem(key)){
          sessionStorage.setItem(key,'1');
          jsonFetch('/api/growth/invites/'+encodeURIComponent(inviteToken)+'/open',{method:'POST'}).catch(()=>{});
        }
        return;
      }
    }catch{}
  }
  if(!/^[a-zA-Z0-9_.]{3,30}$/.test(ref))return;
  if(hiddenRef)hiddenRef.value=ref;
  try{
    const {r,d}=await jsonFetch('/api/profiles/'+encodeURIComponent(ref));
    if(!r.ok||!d.profile)return;
    showInviter(d.profile);
  }catch{}
})();
