'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={product:'Producto',service:'Servicio',property:'Inmueble',sale:'Venta',rent:'Alquiler',offer:'Servicio',active:'Activo',reserved:'Reservado',sold:'Finalizado',paused:'Pausado'};
const state={kind:'',mode:'discover',page:1,items:[],editing:null,images:[],admin:false};
const errorMessage={authentication_required:'Inicia sesión para continuar.',invalid_session:'Tu sesión ha caducado.',invalid_listing:'Revisa los campos del anuncio.',listing_not_found:'Este anuncio ya no está disponible.',listing_not_available:'El anuncio ya no está disponible.',marketplace_unavailable:'Marketplace no disponible. Prueba de nuevo.'};
function note(s){$('#notice').textContent=s||'';}
async function request(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),url==='/api/media/upload'?90000:30000);
  let response;
  try{
    response=await fetch(url,{
      credentials:'same-origin',
      ...options,
      signal:controller.signal,
      headers:{
        ...(options.body && !(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),
        ...(options.headers||{})
      }
    });
  }catch(error){
    return {ok:false,error:error?.name==='AbortError'?'request_timeout':'network'};
  }finally{clearTimeout(timer);}
  let data={};
  try{data=await response.json();}catch{}
  if(response.status===401)return {ok:false,status:401,error:'authentication_required'};
  return {...data,ok:response.ok,status:response.status,error:response.ok?null:(data.error||'unknown_response')};
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

const FIELD_LABELS={kind:'Tipo',deal:'Operación',title:'Título',description:'Descripción',category:'Categoría',city:'Ciudad',price:'Precio'};
function listingFormData(form){
  const raw=new FormData(form);
  const field=name=>String(raw.get(name)||'').trim();
  const title=field('title'),description=field('description'),category=field('category'),city=field('city');
  const kind=field('kind'),deal=field('deal'),priceText=field('price').replace(',','.');
  const invalid=(name,message)=>({error:message,field:name});
  if(!['product','service','property'].includes(kind))return invalid('kind','Selecciona el tipo de anuncio.');
  if((kind==='product'&&deal!=='sale')||(kind==='service'&&deal!=='offer')||(kind==='property'&&!['sale','rent'].includes(deal)))return invalid('deal','Revisa la operación seleccionada.');
  if(title.length<6||title.length>120)return invalid('title','El título debe tener entre 6 y 120 caracteres.');
  if(description.length<25||description.length>4000)return invalid('description','La descripción debe tener entre 25 y 4.000 caracteres.');
  if(category.length<2||category.length>65)return invalid('category','Introduce una categoría válida.');
  if(city.length<2||city.length>100)return invalid('city','Introduce la ciudad o zona del anuncio.');
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(priceText))return invalid('price','Introduce un precio válido, por ejemplo 15,99 o 15.99.');
  const priceCents=Math.round(Number(priceText)*100);
  if(!Number.isSafeInteger(priceCents)||priceCents>99999999900)return invalid('price','El precio supera el máximo permitido.');
  return {data:{kind,deal,title,description,category,city,priceCents,images:[],details:{}},status:field('status')};
}
function listingError(message,fieldName){
  const error=$('#formError');
  error.textContent=message;
  error.classList.remove('hidden');
  error.scrollIntoView({block:'nearest',behavior:'smooth'});
  if(fieldName){
    const input=$('#listingForm').elements.namedItem(fieldName);
    if(input?.focus){input.focus({preventScroll:true});input.setAttribute('aria-invalid','true');}
  }
}
function uploadErrorText(result,file){
  const name=String(file?.name||'esta fotografía').slice(0,100);
  if(result.error==='request_timeout')return 'La subida de "'+name+'" tardó demasiado. Inténtalo de nuevo.';
  if(result.error==='authentication_required')return 'La sesión ha caducado. Vuelve a entrar para publicar.';
  if(result.error==='file_too_large')return '"'+name+'" supera el tamaño permitido.';
  if(result.error==='unsupported_media_type')return '"'+name+'" no es una imagen compatible. Usa JPG, PNG o WebP.';
  if(result.error==='media_upload_failed')return 'El servidor no pudo guardar "'+name+'". Inténtalo de nuevo.';
  if(result.error==='network')return 'No hay conexión con el servidor al subir "'+name+'".';
  return 'No se pudo subir "'+name+'". Error: '+String(result.error||result.status||'desconocido')+'.';
}
async function saveListing(event){
  event.preventDefault();
  const btn=$('#saveListing'),form=$('#listingForm');
  if(btn.disabled)return;
  const originalLabel=btn.textContent;
  btn.disabled=true;
  $('#formError').textContent='';
  $$('#listingForm [aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
  try{
    const parsed=listingFormData(form);
    if(parsed.error){listingError(parsed.error,parsed.field);return;}
    const pics=[...form.elements.namedItem('photos').files];
    if(pics.length+state.images.length>6){listingError('Solo puedes añadir hasta 6 fotografías.','photos');return;}
    for(const pic of pics){
      if(!['image/jpeg','image/png','image/webp'].includes(pic.type)){
        listingError('La fotografía "'+pic.name+'" no es JPG, PNG o WebP.','photos');return;
      }
      if(pic.size>15*1024*1024){
        listingError('La fotografía "'+pic.name+'" supera el límite de 15 MB.','photos');return;
      }
      if(pic.size<=0){listingError('El archivo "'+pic.name+'" está vacío.','photos');return;}
    }
    const images=[...state.images];
    for(let index=0;index<pics.length;index++){
      const photo=pics[index];
      btn.textContent='Subiendo foto '+(index+1)+' de '+pics.length+'…';
      const body=new FormData();body.set('file',photo,photo.name);
      const result=await request('/api/media/upload',{method:'POST',body});
      if(!result.ok||!result.media?.url){
        listingError(uploadErrorText(result,photo),'photos');
        return;
      }
      const url=result.media.url;
      if(!/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:jpe?g|png|webp)$/i.test(url)){
        listingError('La fotografía se subió, pero su dirección no es compatible con Marketplace. Contacta con soporte.','photos');
        return;
      }
      images.push(url);
    }
    // Preserve uploaded photos when a later validation/database error requires retrying.
    if(pics.length){state.images=images;form.elements.namedItem('photos').value='';renderPhotos();}
    btn.textContent=state.editing?'Actualizando anuncio…':'Publicando anuncio…';
    const payload={...parsed.data,images};
    if(state.editing)payload.status=parsed.status;
    const response=await request('/api/marketplace'+(state.editing?'/'+encodeURIComponent(state.editing.id):''),{
      method:state.editing?'PATCH':'POST',body:JSON.stringify(payload)
    });
    if(!response.ok){
      const issues=response.details?.fieldErrors;
      const first=issues&&Object.entries(issues).find(([,items])=>Array.isArray(items)&&items.length);
      const field=first?.[0]==='priceCents'?'price':first?.[0];
      const errorText=response.error==='invalid_listing'
        ? 'El servidor ha rechazado los datos del anuncio. '+(first?.[1]?.[0]||'Revisa los campos.')
        : response.error==='request_timeout'
        ? 'El servidor tarda demasiado en responder. Consulta «Mis anuncios» antes de repetir la publicación.'
        : response.error==='authentication_required'
        ? 'Tu sesión ha caducado. Entra de nuevo antes de guardar.'
        : response.error==='marketplace_unavailable'
        ? 'Marketplace no está disponible en el servidor. Inténtalo más tarde.'
        : response.error==='network'
        ? 'No se pudo conectar con el servidor. Comprueba tu conexión.'
        : 'No se pudo publicar el anuncio ('+String(response.error||response.status||'desconocido')+').';
      listingError(errorText,field);return;
    }
    closeDialog('editor');
    state.mode='mine';
    $$('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode==='mine'));
    $('#filters').classList.add('hidden');
    await load();
    note('Anuncio guardado correctamente.');
  }catch(error){
    console.error('Marketplace save failed',error);
    listingError('Ha ocurrido un error al guardar. Los datos siguen en el formulario. '+String(error?.message||'Inténtalo de nuevo.'));
  }finally{
    btn.textContent=originalLabel;
    btn.disabled=false;
  }
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
