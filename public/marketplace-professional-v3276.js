'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options={}){
 try{const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const x=await r.json();return {...x,ok:r.ok&&x.ok!==false};}catch{return {ok:false,error:'network_error'};}
}
function say(s){$('message').textContent=s;}
async function load(){
 const r=await api('/api/marketplace/professional/mine');
 if(!r.ok){say('No se pudieron cargar tus tiendas.');return;}
 $('stores').innerHTML=r.stores.length?r.stores.map(s=>'<article class="row"><strong>'+esc(s.name)+'</strong><p>'+esc(s.platform)+' · '+esc(s.store_url)+' · '+esc(s.status)+'</p>'+(s.status==='draft'?'<button type="button" data-submit="'+esc(s.id)+'">Enviar a revisión</button>':'')+'</article>').join(''):'<p>Aún no tienes tiendas registradas.</p>';
 $('storeSelect').innerHTML=r.stores.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 const woo=r.stores.filter(s=>s.platform==='woocommerce');
 const previous=$('wooStoreSelect').value;
 $('wooStoreSelect').innerHTML=woo.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.status)+'</option>').join('');
 if(woo.some(s=>String(s.id)===previous))$('wooStoreSelect').value=previous;
 $('wooPanel').hidden=!woo.length;
 if(woo.length)await wooStatus();
 const p=await api('/api/marketplace/professional/products');
 $('products').innerHTML=p.ok&&p.items.length?p.items.map(x=>'<article class="row"><strong>'+esc(x.title)+'</strong><p>'+esc(x.stock_status)+' · '+esc(x.product_url)+'</p></article>').join(''):'<p>Sin productos vinculados.</p>';
}
$('storeForm').addEventListener('submit',async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
 const r=await api('/api/marketplace/professional/stores',{method:'POST',body:JSON.stringify(data)});
 say(r.ok?'Tienda registrada en borrador. Envíala a revisión.':'No se pudo registrar la tienda: '+(r.error||'error'));if(r.ok){e.currentTarget.reset();await load();}
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
 list.innerHTML=(page===1?'':list.innerHTML)+r.products.map(p=>
  '<article class="row"><div><strong>'+esc(p.title||'Producto sin nombre')+'</strong>'+
  '<p>'+esc(p.priceCents==null?'Precio pendiente':(p.priceCents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'}))+
  ' · '+esc(p.category||'Sin categoría')+' · '+esc(p.stock||'Stock desconocido')+
  ' · '+esc(p.photoCount||0)+' fotos</p><p class="muted">'+esc(p.descriptionPreview||'')+'</p>'+
  (p.existingListingId?'<p>Ya importado: #'+esc(p.existingListingId)+'</p>':
   p.state==='ready'?'<button type="button" data-woo-import="'+esc(p.id)+'">Importar este producto</button>':
   '<p>No importable: '+esc(p.reason||p.state)+'</p>')+'</div></article>').join('');
 $('wooNextPage').hidden=!r.hasMore;
 wooNote(r.products.length?'Página '+page+' consultada. Revisa cada producto antes de importar.':'No hay más productos.');
}
$('wooPreviewBtn').addEventListener('click',()=>wooPreview(1));
$('wooNextPage').addEventListener('click',()=>wooPreview(wooPage+1));
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
 wooNote('Resultado: '+r.state+(r.listingId?' · Anuncio #'+r.listingId:''));
 if(['imported','updated'].includes(r.state)){b.textContent='Importado';b.disabled=true;}
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
