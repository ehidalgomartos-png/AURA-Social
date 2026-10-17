'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options={}){
 try{const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const x=await r.json();return {...x,ok:r.ok&&x.ok!==false};}catch{return {ok:false,error:'network_error'};}
}
function say(s){$('message').textContent=s;}
async function load(){
 const r=await api('/api/marketplace/professional/admin/stores');
 if(!r.ok){say('No se pudieron cargar las tiendas. Revisa la sesión de administrador.');return;}
 $('stores').innerHTML=r.stores.length?r.stores.map(s=>'<article class="row"><strong>'+esc(s.name)+'</strong><p>'+esc(s.platform)+' · '+esc(s.store_url)+' · '+esc(s.status)+'</p><p class="muted">Propietario de la tienda: @'+esc(s.username||'sin cuenta')+'</p>'+(s.status==='draft'?'<button type="button" data-submit="'+esc(s.id)+'">Enviar a revisión</button>'+
 '<form data-store-owner-transfer="'+esc(s.id)+'" class="store-owner-transfer" style="margin-top:12px;display:grid;gap:8px">'+
 '<label>Asignar esta tienda a otro usuario de RedLibertad<input name="username" autocomplete="off" maxlength="30" pattern="[A-Za-z0-9_.]{3,30}" placeholder="Ej.: mundotaza" required></label>'+
 '<input type="hidden" name="expectedSellerId" value="'+esc(s.seller_id)+'">'+
 '<button type="submit">Cambiar propietario</button></form>'
 :s.status==='pending'?'<button type="button" data-store-review="'+esc(s.id)+'" data-store-status="approved">Aprobar tras comprobar titularidad</button>':s.status==='approved'?'<button type="button" data-store-review="'+esc(s.id)+'" data-store-status="suspended">Suspender compras externas</button>':'')+'</article>').join(''):'<p>Aún no tienes tiendas registradas.</p>';
 $('storeSelect').innerHTML=r.stores.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 const woo=r.stores.filter(s=>s.platform==='woocommerce');
 const previous=$('wooStoreSelect').value;
 $('wooStoreSelect').innerHTML=woo.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.status)+'</option>').join('');
 if(woo.some(s=>String(s.id)===previous))$('wooStoreSelect').value=previous;
 $('wooPanel').hidden=!woo.length;
 if(woo.length)await wooStatus();
 const p=await api('/api/marketplace/professional/admin/products');
 $('products').innerHTML=p.ok&&p.items.length?p.items.map(x=>'<article class="row"><strong>'+esc(x.title)+'</strong><p>@'+esc(x.seller_username||'sin cuenta')+' · '+esc(x.stock_status)+' · '+esc(x.product_url)+'</p></article>').join(''):'<p>Sin productos vinculados.</p>';
}
$('storeForm').addEventListener('submit',async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
 const r=await api('/api/marketplace/professional/stores',{method:'POST',body:JSON.stringify(data)});
 if(r.ok){say('Tienda registrada. Comprueba la cuenta propietaria antes de importar productos.');e.currentTarget.reset();await load();}
 else if(r.error==='store_already_registered'){
  await load();say('Esta tienda ya estaba registrada. Comprueba el listado de todas las tiendas y su propietario; no necesitas crearla otra vez.');
 }else say('No se pudo registrar la tienda: '+(r.error||'error'));
});
$('productForm').addEventListener('submit',async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),id=data.listingId;
 const r=await api('/api/marketplace/professional/products/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({storeId:Number(data.storeId),productUrl:data.productUrl,sku:data.sku,stockStatus:data.stockStatus})});
 say(r.ok?'Producto vinculado. La compra requiere aprobación y existencias.':'No se pudo vincular: '+(r.error||'error'));if(r.ok)await load();
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-submit]');if(!b)return;
 if(!confirm('¿Enviar esta tienda a revisión manual?'))return;
 const r=await api('/api/marketplace/professional/stores/'+encodeURIComponent(b.dataset.submit)+'/submit',{method:'POST',body:'{}'});
 say(r.ok?'Tienda enviada a revisión.':'No se pudo solicitar revisión.');if(r.ok)await load();
});

document.addEventListener('submit',async e=>{
 const form=e.target.closest('[data-store-owner-transfer]');if(!form)return;
 e.preventDefault();
 const storeId=form.dataset.storeOwnerTransfer;
 const values=Object.fromEntries(new FormData(form));
 const username=String(values.username||'').trim().replace(/^@/,'');
 const expectedSellerId=Number(values.expectedSellerId);
 if(!/^[a-zA-Z0-9_.]{3,30}$/.test(username)||!Number.isSafeInteger(expectedSellerId)){
  say('Introduce un nombre de usuario válido.');return;
 }
 if(!confirm('¿Asignar esta tienda a @'+username+'? Los futuros productos importados pertenecerán a esa cuenta. No se trasladarán los anuncios existentes.'))return;
 const button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
 try{
  const r=await api('/api/marketplace/professional/admin/stores/'+encodeURIComponent(storeId)+'/transfer-owner',{
   method:'POST',body:JSON.stringify({username,expectedSellerId,confirm:true})
  });
  if(r.ok){
   await load();
   say('Propietario actualizado: @'+r.store.username+'. Ya puedes continuar con WooCommerce.');
  }else{
   const errors={
    store_requires_draft:'Solo pueden cambiarse tiendas en borrador.',
    store_transfer_has_linked_data:'La tienda tiene productos vinculados o una conexión API guardada. No se ha cambiado el propietario.',
    target_user_not_found:'No existe un usuario activo con ese nombre.',
    target_already_has_store:'Ese usuario ya tiene registrada la misma tienda.',
    store_owner_changed:'La cuenta propietaria ha cambiado. Actualiza la página.',
    store_already_owned_by_user:'La tienda ya pertenece a ese usuario.'
   };
   say(errors[r.error]||'No se pudo cambiar el propietario: '+(r.error||'error'));
  }
 }finally{if(button)button.disabled=false;}
});

document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-store-review]');if(!btn)return;
 const approved=btn.dataset.storeStatus==='approved';
 if(!confirm(approved?'¿Has verificado manualmente la titularidad de la tienda, las políticas de compra y el dominio del checkout?':'¿Suspender inmediatamente los botones de compra de esta tienda?'))return;
 const r=await api('/api/marketplace/professional/admin/stores/'+encodeURIComponent(btn.dataset.storeReview)+'/review',{
  method:'POST',body:JSON.stringify({status:btn.dataset.storeStatus})});
 say(r.ok?'Estado de tienda actualizado.':'Error: '+(r.error||'error'));
 if(r.ok)await load();
});

let wooPage=1,wooRunning=false,wooConnected=false,wooAuto=false,wooApproved=false;
const wooId=()=>$('wooStoreSelect').value;
function wooNote(message){$('wooMessage').textContent=message||'';}
async function wooStatus(){
 if(!wooId())return;
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/status');
 if(!r.ok){$('wooStatus').textContent='No se pudo comprobar la conexión.';return;}
 wooConnected=!!r.connected;wooAuto=!!r.syncEnabled;wooApproved=r.status==='approved';
 $('wooStatus').textContent='Estado: '+r.status+' · '+(r.connected?'API conectada':'API sin conectar')+
 (r.encryptionReady?'':' · Falta MARKETPLACE_WC_ENCRYPTION_KEY en Coolify')+
 (r.lastSyncAt?' · Última sincronización: '+new Date(r.lastSyncAt).toLocaleString('es-ES'):'');
 $('wooConnectBtn').disabled=!r.encryptionReady;
 $('wooPreviewBtn').disabled=!wooConnected;
 $('wooSyncBtn').disabled=!wooConnected||!wooApproved;
 $('wooEnableBtn').disabled=!wooConnected||!wooApproved;
 $('wooEnableBtn').textContent=wooAuto?'Desactivar sincronización automática':'Activar sincronización automática';
}
$('wooStoreSelect').addEventListener('change',async()=>{$('wooProducts').textContent='';wooPage=1;await wooStatus();});
$('wooConnectForm').addEventListener('submit',async e=>{
 e.preventDefault();if(wooRunning||!wooId())return;
 if(!confirm('¿Has creado una clave WooCommerce de solo lectura y autorizado su uso?'))return;
 wooRunning=true;$('wooConnectBtn').disabled=true;wooNote('Comprobando conexión segura…');
 const key=$('wooKey').value,secret=$('wooSecret').value;
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/connect',{
  method:'POST',body:JSON.stringify({consumerKey:key,consumerSecret:secret})});
 $('wooKey').value='';$('wooSecret').value='';
 wooNote(r.ok?'Conexión verificada. Credenciales guardadas cifradas.':'Conexión fallida: '+(r.error||'error'));
 wooRunning=false;await wooStatus();
});
async function wooPreview(page=1){
 if(wooRunning||!wooId())return;
 wooRunning=true;$('wooPreviewBtn').disabled=true;wooNote('Consultando el catálogo…');
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/preview?page='+page);
 wooRunning=false;$('wooPreviewBtn').disabled=false;
 if(!r.ok){wooNote('No se pudo consultar: '+(r.error||'error'));return;}
 wooPage=page;
 const list=$('wooProducts');
 const stockLabel={in_stock:'Disponible',out_of_stock:'Agotado',unknown:'Sin confirmar'};
 const reasonLabel={sku:'Mismo SKU del CSV',woocommerce_id:'Mismo ID del CSV',title_price:'Mismo nombre y precio',other_owner:'Coincidencia en otra cuenta'};
 list.innerHTML=(page===1?'':list.innerHTML)+r.products.map(p=>{
  const check=p.duplicate||{state:'new',matches:[],canImport:true};
  const candidates=Array.isArray(check.matches)?check.matches:[];
  const image=p.photoUrl?'<img class="woo-preview-thumb-v32776" src="'+esc(p.photoUrl)+'" loading="lazy" referrerpolicy="no-referrer" alt="Fotografía de '+esc(p.title||'producto')+'">':
   '<div class="woo-preview-thumb-v32776 woo-no-photo-v32776" aria-hidden="true">Sin foto</div>';
  const count=p.photoCount||0;
  const duplicateLabel=check.state==='linked'?'Ya vinculado al Marketplace':
   check.state==='possible_duplicate'?'Ya existe o puede existir en Marketplace':'Sin coincidencias detectadas';
  const items=candidates.map(c=>
   '<div class="woo-match-v32776">'+
    '<span><a target="_blank" rel="noopener noreferrer" href="/marketplace/p/'+esc(c.listingId)+'">Ver anuncio #'+esc(c.listingId)+'</a> · '+esc(c.title)+' · @'+esc(c.username)+' · '+esc(reasonLabel[c.reason]||'Posible coincidencia')+'</span>'+
    (c.sameOwner&&!c.linkedElsewhere&&c.status==='active'&&c.moderationStatus==='published'&&p.state==='ready'?
     '<button type="button" data-woo-link="'+esc(p.id)+'" data-listing="'+esc(c.listingId)+'">Vincular existente</button>':
     '<small>'+(c.sameOwner?'Vínculo no disponible: revisa el estado del anuncio.':'Otra cuenta: no se puede vincular ni importar hasta revisar.')+'</small>')+
   '</div>').join('');
  const buttons=check.state==='linked'?'<p class="woo-duplicate-note-v32776">Ya vinculado al anuncio #'+esc(check.existingListingId)+'</p>':
   !check.canImport?'<p class="woo-duplicate-note-v32776">⚠ '+duplicateLabel+'. Revisa las coincidencias antes de continuar.</p>'+
     items+(check.truncated?'<p>Demasiadas coincidencias: revisa manualmente.</p>':''):
   p.state==='ready'?'<button type="button" data-woo-import="'+esc(p.id)+'">Importar nuevo producto</button>':
    '<p>No importable: '+esc(p.reason||p.state)+'</p>';
  return '<article class="row woo-preview-card-v32776">'+image+'<div class="woo-preview-info-v32776">'+
   '<strong>'+esc(p.title||'Producto sin nombre')+'</strong>'+
   '<p>'+esc(p.priceCents==null?'Precio pendiente':(p.priceCents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'}))+
   ' · '+esc(p.category||'Sin categoría')+' · '+esc(stockLabel[p.stock]||'Sin confirmar')+
   ' · '+esc(count)+' '+(count===1?'foto':'fotos')+'</p>'+
   '<p class="muted">'+esc(p.descriptionPreview||'')+'</p>'+
   buttons+'</div></article>';
 }).join('');
 $('wooNextPage').hidden=!r.hasMore;
 wooNote(r.products.length?'Página '+page+' consultada. Revisa cada producto antes de importar.':'No hay más productos.');
}
$('wooPreviewBtn').addEventListener('click',()=>wooPreview(1));
$('wooNextPage').addEventListener('click',()=>wooPreview(wooPage+1));
$('wooProducts').addEventListener('click',async e=>{
 const button=e.target.closest('[data-woo-link]');if(!button||wooRunning)return;
 const wooProductId=Number(button.dataset.wooLink),listingId=Number(button.dataset.listing);
 if(!Number.isSafeInteger(wooProductId)||!Number.isSafeInteger(listingId))return;
 if(!confirm('¿Has comprobado que este producto y el anuncio #'+listingId+' son exactamente el mismo y pertenecen a la cuenta propietaria de esta tienda? Se enlazarán URL y stock de WooCommerce al anuncio existente. No se cambiarán fotografías ni propietario. Una sincronización posterior podrá modificar precio y descripción.'))return;
 wooRunning=true;button.disabled=true;wooNote('Vinculando al anuncio existente…');
 const result=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/link-existing/'+encodeURIComponent(wooProductId),{
  method:'POST',body:JSON.stringify({listingId,confirm:true})});
 wooRunning=false;
 wooNote(result.ok?'Vinculado sin duplicar el anuncio #'+result.listingId+'. Repite la vista previa para confirmar.':
  'No se pudo vincular: '+(result.error||'error')+'. Revisa que sea del mismo vendedor.');
 if(result.ok){button.textContent='Vinculado';await wooPreview(1);}else button.disabled=false;
});

$('wooProducts').addEventListener('click',async e=>{
 const b=e.target.closest('[data-woo-import]');if(!b||wooRunning)return;
 const city=$('wooCity').value.trim(),province=$('wooProvince').value.trim(),saleScope=$('wooSaleScope').value;
 if(city.length<2){wooNote('Indica la ciudad de origen antes de importar.');return;}
 if(!confirm('¿Importar este producto y descargar sus fotografías al VPS?'))return;
 wooRunning=true;b.disabled=true;wooNote('Importando producto #'+b.dataset.wooImport+'…');
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/import/'+encodeURIComponent(b.dataset.wooImport),{
   method:'POST',body:JSON.stringify({confirm:true,city,province,saleScope})});
 wooRunning=false;
 if(!r.ok){b.disabled=false;wooNote('Error al importar: '+(r.error||'error'));return;}
 wooNote('Resultado: '+r.state+(r.listingId?' · Anuncio #'+r.listingId:'')+'. Si hay coincidencias, la importación se bloquea sin crear anuncios.');
 if(['imported','updated','already_linked'].includes(r.state)){b.textContent='Importado';b.disabled=true;}
});
$('wooSyncBtn').addEventListener('click',async()=>{
 if(wooRunning||!wooApproved||!confirm('¿Actualizar precios y existencias de los productos conectados?'))return;
 wooRunning=true;$('wooSyncBtn').disabled=true;wooNote('Sincronizando…');
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/sync',{method:'POST',body:'{}'});
 wooNote(r.ok?'Comprobados: '+r.checked+' · Actualizados: '+r.updated+' · No disponibles: '+r.unavailable+' · Errores: '+r.failed+(r.partial?' · Límite de 20 productos por lote':''):'Error: '+(r.error||'error'));
 wooRunning=false;await wooStatus();
});
$('wooEnableBtn').addEventListener('click',async()=>{
 if(wooRunning)return;
 const r=await api('/api/marketplace/professional/woocommerce/stores/'+encodeURIComponent(wooId())+'/sync-settings',{
  method:'POST',body:JSON.stringify({enabled:!wooAuto})});
 wooNote(r.ok?'Sincronización '+(r.syncEnabled?'automática activada':'automática desactivada'):'No se pudo modificar: '+(r.error||'error'));
 await wooStatus();
});

(async()=>{const me=await api('/api/auth/me');const isAdmin=me.user?.is_admin??me.user?.isAdmin??me.is_admin;
 if(!me.ok||!isAdmin){$('auth').hidden=false;return;}$('controls').hidden=false;await load();})();
