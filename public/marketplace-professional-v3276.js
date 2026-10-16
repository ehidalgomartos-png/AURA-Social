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
(async()=>{const me=await api('/api/auth/me');if(!me.ok){$('auth').hidden=false;return;}$('controls').hidden=false;await load();})();
