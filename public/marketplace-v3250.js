'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={product:'Producto',service:'Servicio',property:'Inmueble',sale:'Venta',rent:'Alquiler',offer:'Servicio',active:'Activo',reserved:'Reservado',sold:'Finalizado',paused:'Pausado'};
const state={kind:'',mode:'discover',page:1,items:[],editing:null,images:[],admin:false};
const errorMessage={authentication_required:'Inicia sesión para continuar.',invalid_session:'Tu sesión ha caducado.',invalid_listing:'Revisa los campos del anuncio.',listing_not_found:'Este anuncio ya no está disponible.',listing_not_available:'El anuncio ya no está disponible.',marketplace_unavailable:'Marketplace no disponible. Prueba de nuevo.'};
function note(s){$('#notice').textContent=s||'';}
async function request(url,options={}){
  let response;
  try{
    response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body && !(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  }catch{return {ok:false,error:'network'};}
  let data={};try{data=await response.json()}catch{}
  if(response.status===401){note('Necesitas iniciar sesión.');return {ok:false,error:'authentication_required'};}
  return {ok:response.ok,...data,error:response.ok?null:(data.error||'network')};
}
function slugifyMarket(value){return String(value||'anuncio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75)||'anuncio';}
function currency(cents){return (Number(cents||0)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});}
function firstImage(item){const url=(item.image_urls||[])[0];return typeof url==='string'&&/^\/uploads\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(url)?url:null;}
function card(item){
 const img=firstImage(item),own=state.mode==='mine';
 return '<article class="card"><div class="thumb">'+(img?'<img loading="lazy" src="'+esc(img)+'" alt="">':'<span aria-hidden="true">'+({product:'📦',service:'🛠️',property:'🏠'}[item.kind]||'▣')+'</span>')+'</div><div class="cardbody"><span class="chip">'+esc(label[item.kind]||item.kind)+'</span><h3>'+esc(item.title)+'</h3><div class="price">'+currency(item.price_cents)+(item.deal==='rent'?' / mes':'')+'</div><p class="muted">📍 '+esc(item.city)+' · '+esc(item.seller_name||item.seller_username)+'</p>'+(own?'<span class="muted">Estado: '+esc(label[item.status]||item.status)+(item.moderation_status==='hidden'?' · Oculto por moderación':'')+'</span>':'')+'<div class="actions">'+((item.status==='active'&&item.moderation_status==='published')?'<a class="market-seo-link" href="/marketplace/p/'+esc(item.id)+'/'+slugifyMarket(item.title)+'">Ver anuncio</a>':'<button data-open="'+esc(item.id)+'">Ver anuncio</button>')+(own?'<button data-edit="'+esc(item.id)+'">Editar</button><button data-delete="'+esc(item.id)+'">Eliminar</button>':state.mode==='reports'?'<button data-mod="'+esc(item.id)+'">Moderar</button>':'<button data-fav="'+esc(item.id)+'">'+(item.is_favorite?'♥ Guardado':'♡ Guardar')+'</button>')+'</div></div></article>';
}
async function load(reset=true){
 if(reset)state.page=1;
 note('Cargando anuncios…');
 let path='/api/marketplace';
 if(state.mode==='mine')path+='/mine';
 else if(state.mode==='favorites')path+='/favorites';
 else if(state.mode==='reports')path+='/admin/reports';
 else{
  const f=new FormData($('#filters'));
  path+='?'+new URLSearchParams({kind:state.kind,q:String(f.get('q')||''),city:String(f.get('city')||''),maxPrice:String(f.get('maxPrice')||''),page:String(state.page)});
 }
 const data=await request(path);
 if(!data.ok){note(errorMessage[data.error]||'No se pudo cargar. Vuelve a intentarlo.');return;}
 if(state.mode==='reports'){
   $('#list').innerHTML=(data.reports||[]).map(x=>'<article class="card"><div class="cardbody"><h3>'+esc(x.title)+'</h3><p>Motivo: '+esc(x.reason)+'</p><p>'+esc(x.details)+'</p><p class="muted">Denunciante: '+esc(x.reporter)+'</p><div class="actions"><button data-mod="'+esc(x.listing_id)+'">Gestionar</button></div></div></article>').join('');
   note(data.reports?.length?'':'No hay denuncias pendientes.');$('#more').classList.add('hidden');return;
 }
 const items=data.items||[];
 state.items=reset?items:[...state.items,...items];
 $('#list').innerHTML=state.items.map(card).join('');
 $('#more').classList.toggle('hidden',state.mode!=='discover'||!data.hasMore);
 note(state.items.length?'':'Todavía no hay anuncios con estos filtros. ¡Puedes publicar el primero!');
}
function setKind(k){state.kind=k;$$('[data-kind]').forEach(b=>b.classList.toggle('active',b.dataset.kind===k));load();}
function setMode(mode){state.mode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#filters').classList.toggle('hidden',mode!=='discover');load();}
function syncKind(){
 const kind=$('#listingForm [name=kind]').value,deal=$('#listingForm [name=deal]');
 const allowed=kind==='property'?['sale','rent']:kind==='service'?['offer']:['sale'];
 [...deal.options].forEach(opt=>opt.hidden=!allowed.includes(opt.value));
 if(!allowed.includes(deal.value))deal.value=allowed[0];
}
function openEditor(item=null){
 state.editing=item||null;state.images=item?[...(item.image_urls||[])]:[];
 const form=$('#listingForm');form.reset();
 const f=n=>form.elements.namedItem(n);
 if(item){
   for(const n of ['kind','deal','title','description','category','city','status'])f(n).value=n==='status'?item.status:(item[n]||'');
   f('price').value=(Number(item.price_cents)/100).toFixed(2);
 }
 syncKind();renderPhotos();$('#formError').textContent='';
 $('#editorTitle').textContent=item?'Editar anuncio':'Publicar anuncio';$('#editor').showModal();
}
function renderPhotos(){$('#imagesPreview').innerHTML=state.images.map((url,i)=>'<span><img alt="Fotografía '+(i+1)+'" src="'+esc(url)+'"><button type="button" data-remove-photo="'+i+'" aria-label="Quitar fotografía '+(i+1)+'">×</button></span>').join('');}
function closeDialog(id){$('#'+id).close();}
async function saveListing(event){
 event.preventDefault();
 const btn=$('#saveListing');btn.disabled=true;$('#formError').textContent='';
 try{
  const f=new FormData($('#listingForm'));
  const pics=[...$('#listingForm [name=photos]').files];
  if(pics.length+state.images.length>6)throw Error('Máximo 6 fotografías.');
  const images=[...state.images];
  for(const file of pics){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Solo JPG, PNG o WebP hasta 15 MB.');
   const body=new FormData();body.set('file',file);
   const result=await request('/api/media/upload',{method:'POST',body});
   if(!result.ok||!result.media?.url)throw Error('Falló la subida de una fotografía.');
   images.push(result.media.url);
  }
  const price=Number(f.get('price'));if(!Number.isFinite(price)||price<0)throw Error('Precio no válido.');
  const body={kind:f.get('kind'),deal:f.get('deal'),title:f.get('title'),description:f.get('description'),category:f.get('category'),city:f.get('city'),priceCents:Math.round(price*100),images,details:{}};
  if(state.editing)body.status=f.get('status');
  const result=await request('/api/marketplace'+(state.editing?'/'+encodeURIComponent(state.editing.id):''),{method:state.editing?'PATCH':'POST',body:JSON.stringify(body)});
  if(!result.ok)throw Error(errorMessage[result.error]||'No se pudo guardar el anuncio.');
  closeDialog('editor');state.mode='mine';$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='mine'));$('#filters').classList.add('hidden');
  await load();note('Anuncio guardado correctamente.');
 }catch(error){$('#formError').textContent=error.message;}finally{btn.disabled=false;}
}
function details(item){
 const images=(item.image_urls||[]).filter(u=>/^\/uploads\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(u));
 const mine=String(item.seller_id)===String(window.currentUserId);
 $('#detailContent').innerHTML='<h2>'+esc(item.title)+'</h2><div class="gallery">'+(images.length?images.map(u=>'<img src="'+esc(u)+'" alt="Fotografía del anuncio">').join(''):'<div class="thumb" style="width:100%">📦</div>')+'</div><p><span class="chip">'+esc(label[item.kind]||'Anuncio')+'</span></p><div class="price">'+currency(item.price_cents)+(item.deal==='rent'?' / mes':'')+'</div><p>📍 '+esc(item.city)+' · '+esc(item.category)+'</p><p>'+esc(item.description)+'</p><p class="muted">Publicado por @'+esc(item.seller_username)+'</p><div class="actions">'+(mine?'':'<button class="primary" data-contact="'+esc(item.seller_username)+'">Enviar mensaje al vendedor</button><button data-report="'+esc(item.id)+'">Denunciar anuncio</button>')+'</div><small>RedLibertad no interviene en el pago, envío ni en los acuerdos.</small>';
 $('#detail').showModal();
}
async function showDetail(id){
 let item=state.items.find(x=>String(x.id)===String(id));
 if(!item){const r=await request('/api/marketplace/'+encodeURIComponent(id));item=r.item;}
 if(item)details(item);else note('Este anuncio ya no está disponible.');
}
async function contact(username){
 const result=await request('/api/messages/conversations',{method:'POST',body:JSON.stringify({username})});
 if(!result.ok){alert('No se puede contactar con este usuario. Puede tener restringidos los mensajes.');return;}
 location.href='/app?view=messages&conversation='+encodeURIComponent(result.conversationId);
}
async function init(){
 const me=await request('/api/auth/me');if(!me.ok){note('Inicia sesión en RedLibertad para acceder a Marketplace.');$('#list').innerHTML='<a class="primary" href="/">Iniciar sesión</a>';return;}
 window.currentUserId=me.user?.id??me.id;
 state.admin=!!(me.user?.is_admin??me.user?.isAdmin??me.is_admin);
 $('#reportsTab').classList.toggle('hidden',!state.admin);
 await load();
 const contactName=new URLSearchParams(location.search).get('contact');
 if(contactName&&/^[A-Za-z0-9_.]{3,30}$/.test(contactName)){
  const msg=document.createElement('button');msg.type='button';msg.className='primary';msg.textContent='Abrir conversación con @'+contactName;
  $('#notice').textContent='Para consultar este anuncio, puedes conversar con su anunciante. ';
  $('#notice').append(msg);msg.onclick=()=>contact(contactName);
 }
}
$$('[data-kind]').forEach(b=>b.onclick=()=>setKind(b.dataset.kind));
$$('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#filters').onsubmit=e=>{e.preventDefault();setMode('discover');};
$('#more').onclick=()=>{state.page++;load(false);};
$('#newListing').onclick=()=>openEditor();
$('#listingForm [name=kind]').onchange=syncKind;
$('#listingForm').addEventListener('submit',saveListing);
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.close){closeDialog(b.dataset.close);return;}
 if(b.dataset.removePhoto!==undefined){state.images.splice(Number(b.dataset.removePhoto),1);renderPhotos();return;}
 if(b.dataset.open){await showDetail(b.dataset.open);return;}
 if(b.dataset.edit){const item=state.items.find(x=>String(x.id)===b.dataset.edit);if(item)openEditor(item);return;}
 if(b.dataset.delete){if(confirm('¿Eliminar definitivamente este anuncio?')){const r=await request('/api/marketplace/'+encodeURIComponent(b.dataset.delete),{method:'DELETE'});if(r.ok)await load();else note('No se pudo eliminar.');}return;}
 if(b.dataset.fav){const item=state.items.find(x=>String(x.id)===b.dataset.fav);if(!item)return;const r=await request('/api/marketplace/'+encodeURIComponent(item.id)+'/favorite',{method:item.is_favorite?'DELETE':'POST'});if(r.ok)await load();return;}
 if(b.dataset.contact){await contact(b.dataset.contact);return;}
 if(b.dataset.report){const reason=prompt('Motivo: fraud, prohibited, spam, misleading u other','misleading');if(!reason)return;const r=await request('/api/marketplace/'+encodeURIComponent(b.dataset.report)+'/report',{method:'POST',body:JSON.stringify({reason,details:''})});alert(r.ok?'Denuncia enviada a moderación.':'No se pudo enviar la denuncia.');return;}
 if(b.dataset.mod){const action=prompt('Acción: hide, restore o resolve','hide');if(!action)return;const r=await request('/api/marketplace/admin/'+encodeURIComponent(b.dataset.mod)+'/moderate',{method:'POST',body:JSON.stringify({action})});if(r.ok)await load();else note('No se pudo moderar.');}
});
init();
