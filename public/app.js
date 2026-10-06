const qs=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const register=qs('#registerForm'),login=qs('#loginForm');
async function jsonFetch(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let d={};try{d=await r.json()}catch{}return {r,d};}
if(register)register.addEventListener('submit',async e=>{e.preventDefault();const m=qs('#formMessage'),fd=new FormData(register);m.textContent='Creando cuenta...';const {r,d}=await jsonFetch('/api/auth/register',{method:'POST',body:JSON.stringify({displayName:fd.get('displayName'),username:fd.get('username'),email:fd.get('email'),password:fd.get('password'),birthDate:fd.get('birthDate'),acceptTerms:fd.get('acceptTerms')==='on',referralUsername:fd.get('referralUsername')||'',referralToken:fd.get('referralToken')||''})});if(!r.ok){m.textContent=({adult_only:'RedLibertad es exclusiva para mayores de 18 años.',account_exists:'Ya existe una cuenta con ese email o usuario.',invalid_data:'Revisa los datos.',registration_failed:'No se pudo completar el registro. Inténtalo de nuevo.'})[d.error]||'No se pudo crear la cuenta.';return}location.href='/app';});
if(login)login.addEventListener('submit',async e=>{e.preventDefault();const m=qs('#loginMessage'),fd=new FormData(login);m.textContent='Entrando...';const {r,d}=await jsonFetch('/api/auth/login',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});if(!r.ok){if(d.error==='account_suspended'){const until=d.suspendedUntil?new Date(d.suspendedUntil).toLocaleString('es-ES'):'hasta nuevo aviso';m.textContent='Cuenta suspendida '+until+(d.reason?' · '+d.reason:'');return}if(d.error==='account_banned'){m.textContent='Esta cuenta ha sido bloqueada por moderación.';return}m.textContent=d.error==='account_unavailable'?'Esta cuenta no está disponible.':'Email o contraseña incorrectos.';return}location.href='/app';});

(async()=>{
  if(!register)return;
  const params=new URLSearchParams(location.search);
  const inviteToken=String(params.get('invite')||'').trim();
  const ref=String(params.get('ref')||'').trim().replace(/^@/,'');
  const hiddenRef=register.querySelector('[name="referralUsername"]');
  const hiddenToken=register.querySelector('[name="referralToken"]');
  const notice=qs('#inviteNotice');
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
