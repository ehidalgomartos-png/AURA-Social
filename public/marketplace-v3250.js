'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={product:'Producto',service:'Servicio',property:'Inmueble',sale:'Venta',rent:'Alquiler',offer:'Servicio',buy:'Compra · Busco',active:'Activo',reserved:'Reservado',sold:'Finalizado',paused:'Pausado'};
let marketplaceLoadRequestV32643=0;
const state={kind:'',mode:'discover',nationalOnly:false,page:1,items:[],deal:'',editing:null,images:[],pendingPhotos:[],admin:false,authenticated:false,authStatus:'checking',reportId:null};
const CATEGORY_SUGGESTIONS={
 "product": [
  "Hogar y muebles",
  "Electrodomésticos",
  "Decoración",
  "Jardín y bricolaje",
  "Moda y accesorios",
  "Belleza y cuidado personal",
  "Tecnología",
  "Móviles y telefonía",
  "Informática",
  "Videojuegos",
  "Vehículos",
  "Deportes y ocio",
  "Bebés y niños",
  "Juguetes y juegos",
  "Libros y coleccionismo",
  "Arte y antigüedades",
  "Mascotas",
  "Música e instrumentos",
  "Alimentación",
  "Regalos y personalización",
  "Tazas",
  "Otros productos"
 ],
 "service": [
  "Reformas y mantenimiento",
  "Clases y formación",
  "Salud y bienestar",
  "Hogar y limpieza",
  "Profesionales",
  "Transporte y mudanzas",
  "Informática y reparación",
  "Eventos y celebraciones",
  "Belleza y estética",
  "Cuidado de personas",
  "Otros servicios"
 ],
 "property": [
  "Pisos",
  "Casas",
  "Habitaciones",
  "Locales",
  "Terrenos",
  "Garajes",
  "Trasteros",
  "Oficinas",
  "Otros inmuebles"
 ]
};
const SUBCATEGORY_SUGGESTIONS={
 'Hogar y muebles':['Sofás','Dormitorios','Mesas','Sillas','Decoración','Tazas'],
 'Tecnología':['Móviles','Ordenadores','Videojuegos','Fotografía'],
 'Vehículos':['Coches','Motos','Bicicletas'],
 'Moda y accesorios':['Ropa','Calzado','Bolsos'],
 'Tazas':['Personalizadas','Regalos','Coleccionismo'],
 'Pisos':['Pisos en venta','Pisos en alquiler'],
 'Casas':['Chalets','Adosados'],
 'Reformas y mantenimiento':['Albañilería','Pintura','Fontanería','Electricidad'],
 'Clases y formación':['Idiomas','Apoyo escolar','Música']
};
function populateSuggestions(){
 const form=$('#listingForm');if(!form)return;
 const kind=form.elements.namedItem('kind').value,category=form.elements.namedItem('category').value;
 $('#listingCategories').innerHTML=(CATEGORY_SUGGESTIONS[kind]||[]).map(v=>'<option value="'+esc(v)+'"></option>').join('');
 $('#listingSubcategories').innerHTML=(SUBCATEGORY_SUGGESTIONS[category]||[]).map(v=>'<option value="'+esc(v)+'"></option>').join('');
}
const MAX_MARKET_PHOTOS=6;
const MAX_MARKET_IMAGE_BYTES=15*1024*1024;
const errorMessage={authentication_required:'Inicia sesión para continuar.',invalid_session:'Tu sesión ha caducado.',invalid_listing:'Revisa los campos del anuncio.',listing_not_found:'Este anuncio ya no está disponible.',listing_not_available:'El anuncio ya no está disponible.',marketplace_unavailable:'Marketplace no disponible. Prueba de nuevo.'};
function note(s){$('#notice').textContent=s||'';}
function updateMarketplaceAuth(status){
 state.authStatus=status;state.authenticated=status==='signed-in';
 const sellerTools=$('#marketSellerTools');
 if(sellerTools)sellerTools.hidden=!state.authenticated||state.mode!=='mine';
 document.body.classList.toggle('market-guest',status==='guest');
 const button=$('#newListing'),banner=$('#authNotice');
 button.disabled=status==='checking'||status==='unavailable';
 button.textContent=status==='signed-in'?'+ Publicar anuncio':status==='checking'?'Comprobando sesión…':status==='guest'?'Inicia sesión para publicar':'No se puede comprobar la sesión';
 // Visitors use a single public-catalogue link, not the private search and login notice.
 banner.classList.toggle('hidden',status!=='unavailable');
 $('#authNoticeText').textContent=status==='guest'
  ?'Para publicar, borrar o guardar anuncios, necesitas iniciar sesión. Puedes explorar los anuncios públicos sin una cuenta.'
  :'No hemos podido comprobar tu sesión. Revisa la conexión y vuelve a intentarlo.';
 $('#authSignIn').classList.toggle('hidden',status!=='guest');
 $('#authRetry').classList.toggle('hidden',status!=='unavailable');
 $('#editorAuthLink').classList.toggle('hidden',status!=='guest');
 $('#saveListing').disabled=!state.authenticated;
}
function resetPendingPhotos(){
 for(const entry of state.pendingPhotos){try{URL.revokeObjectURL(entry.previewUrl);}catch{}}
 state.pendingPhotos=[];
}
function photoValidation(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))
  return 'Solo se permiten fotografías JPG, PNG o WebP. Si tu cámara crea HEIC, cambia el formato a compatible.';
 if(file.size<=0)return 'La fotografía está vacía.';
 if(file.size>MAX_MARKET_IMAGE_BYTES)return 'Cada fotografía debe ocupar 15 MB o menos.';
 return '';
}
function addPendingPhotos(files){
 const incoming=Array.from(files||[]);
 if(!incoming.length)return;
 if(!state.authenticated){listingError('Inicia sesión antes de añadir fotografías.');return;}
 if(state.images.length+state.pendingPhotos.length+incoming.length>MAX_MARKET_PHOTOS){
  listingError('Puedes añadir hasta 6 fotografías entre la galería y la cámara.','photos');return;
 }
 for(const file of incoming){
  const message=photoValidation(file);
  if(message){listingError(message,'photos');return;}
 }
 for(const file of incoming){
  state.pendingPhotos.push({file,previewUrl:URL.createObjectURL(file)});
 }
 $('#formError').textContent='';
 renderPhotos();
}
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
  if(response.status===401){updateMarketplaceAuth('guest');return {ok:false,status:401,error:'authentication_required'};}
  return {...data,ok:response.ok,status:response.status,error:response.ok?null:(data.error||'unknown_response')};
}
const RECENT_MS=7*24*60*60*1000;
function isRecentListing(item,now=Date.now()){
 const ms=Date.parse(item?.created_at||'');
 return item?.status==='active'&&item?.moderation_status==='published'&&Number.isFinite(ms)&&now>=ms&&now-ms<=RECENT_MS;
}
const SERVICE_MODE_LABELS={in_person:'Presencial',remote:'A distancia',both:'Presencial y a distancia'};
function listingFacts(item){
 const d=item?.details||{},facts=[];
 if(item.kind==='product'&&['new','used'].includes(d.condition))facts.push('Estado: '+(d.condition==='new'?'Nuevo':'Usado'));
 if(item.kind==='property'){
  if(Number.isInteger(d.areaM2)&&d.areaM2>0&&d.areaM2<=100000)facts.push('Superficie: '+d.areaM2+' m²');
  if(Number.isInteger(d.rooms)&&d.rooms>=0&&d.rooms<=100)facts.push('Habitaciones: '+d.rooms);
  if(typeof d.subtype==='string'&&d.subtype.trim())facts.push('Tipo: '+d.subtype.slice(0,60));
 }
 if(item.kind==='service'){
  if(Object.hasOwn(SERVICE_MODE_LABELS,d.serviceMode))facts.push('Modalidad: '+SERVICE_MODE_LABELS[d.serviceMode]);
  if(typeof d.serviceArea==='string'&&d.serviceArea.trim())facts.push('Zona: '+d.serviceArea.slice(0,100));
 }
 return facts;
}
function slugifyMarket(value){return String(value||'anuncio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75)||'anuncio';}
function currency(cents){return (Number(cents||0)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});}
function priceLabel(item){return (item.deal==='buy'?'Presupuesto máximo: ':'')+currency(item.price_cents)+(item.deal==='rent'?' / mes':'');}
function safeListingPhotos(item){return Array.isArray(item?.image_urls)?item.image_urls.filter(u=>typeof u==='string'&&/^\/uploads\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(u)).slice(0,8):[];}
function firstImage(item){return safeListingPhotos(item)[0]||null;}
function marketSpain(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()==='espana';}
function marketOrigin(item){
 const city=String(item?.city||'').trim(),province=String(item?.details?.province||'').trim();
 if(!city||marketSpain(city))return '';
 return city+(!province||marketSpain(province)||city.localeCompare(province,'es',{sensitivity:'base'})===0?'':' · '+province);
}
function marketNational(item){
 return item?.kind==='product'&&item?.deal==='sale'&&(item.details?.saleScope==='national'||(!item.details?.saleScope&&marketSpain(item.city)&&marketSpain(item.details?.province)));
}
function marketSaleArea(item){return marketNational(item)?'Venta disponible en toda España':item?.kind==='product'&&item?.deal==='sale'&&item.details?.saleScope==='local'?'Venta en la zona indicada':'';}
function marketDisplayLocation(item){
 const origin=marketOrigin(item),coverage=marketSaleArea(item);
 if(origin&&coverage)return origin+' · '+coverage;
 return coverage||origin||[item?.city,item?.details?.province].filter((v,i,a)=>v&&a.findIndex(x=>String(x).toLowerCase()===String(v).toLowerCase())===i).join(' · ');
}
function card(item){
 const photos=safeListingPhotos(item),img=photos[0]||null,own=state.mode==='mine';
 const isOwner=window.currentUserId!=null&&String(item.seller_id)===String(window.currentUserId);
 const publicOK=item.status==='active'&&item.moderation_status==='published'&&item.seller_discoverable===true;
 const url='/marketplace/p/'+encodeURIComponent(item.id)+'/'+slugifyMarket(item.title);
 const sellerOK=item.seller_discoverable===true&&/^[A-Za-z0-9_.-]+$/.test(String(item.seller_username||''));
 const seller=sellerOK?'<a class="seller-profile-link" href="/perfil/'+encodeURIComponent(item.seller_username)+'">'+esc(item.seller_name||item.seller_username)+'</a>':esc(item.seller_name||item.seller_username);
 const location=marketDisplayLocation(item);
 const badge=item.deal==='buy'?'BUSCO COMPRAR':item.deal==='sale'?'EN VENTA':item.deal==='rent'?'ALQUILER':'SERVICIO';
 const quickStatuses=own&&item.moderation_status!=='hidden'?
  (item.status==='active'?'<button type="button" data-quick-status="'+esc(item.id)+'" data-to="reserved">Reservar</button><button type="button" data-quick-status="'+esc(item.id)+'" data-to="sold">Marcar vendido</button><button type="button" data-quick-status="'+esc(item.id)+'" data-to="paused">Pausar</button>':
    '<button type="button" data-quick-status="'+esc(item.id)+'" data-to="active">Reactivar anuncio</button>'):'';
 const condition=item.kind==='product'&&['new','used'].includes(item.details?.condition)?(item.details.condition==='new'?'Nuevo':'Usado'):'';
 const brand=item.kind==='product'&&typeof item.details?.brand==='string'?item.details.brand.trim().slice(0,80):'';
 const info=[brand,condition,marketNational(item)?'Venta en toda España':''].filter(Boolean);
 const photoBadge=photos.length>1?'<span class="market-photo-count" aria-label="'+photos.length+' fotografías">'+photos.length+' fotos</span>':'';
 const imageMarkup=img?'<img loading="lazy" decoding="async" width="640" height="480" src="'+esc(img)+'" alt="'+esc(item.title)+'">':'<span aria-hidden="true">'+({product:'📦',service:'🛠️',property:'🏠'}[item.kind]||'▣')+'</span>';
 const cover=publicOK?'<a class="market-photo-link" href="'+esc(url)+'" aria-label="Ver '+esc(item.title)+'">'+imageMarkup+'</a>':imageMarkup;
 const more=item.details?.subcategory?'<p class="muted market-subcategory">'+esc(item.category)+' · '+esc(item.details.subcategory)+'</p>':'';
 const compactActions=publicOK&&!own&&state.mode!=='reports'&&!isOwner
  ? '<div class="actions market-card-actions-v32772">'+
    '<a class="market-seo-link market-card-main-v32772" href="'+esc(url)+'">Ver anuncio</a>'+
    '<button class="market-contact-action market-card-main-v32772" type="button" data-contact-id="'+esc(item.id)+'">Contactar</button>'+
    '<div class="market-card-utility-row-v32772">'+
      '<button class="market-card-quiet-v32772" type="button" data-fav="'+esc(item.id)+'" aria-label="'+(item.is_favorite?'Quitar de favoritos':'Guardar en favoritos')+'">'+(item.is_favorite?'♥ Guardado':'♡ Guardar')+'</button>'+
      '<button class="market-card-quiet-v32772" type="button" data-share="'+esc(item.id)+'">↗ Compartir</button>'+
      '<details class="market-card-extra-v32772"><summary aria-label="Más opciones del anuncio">⋯ Más</summary><div class="market-card-extra-panel-v32772">'+
        '<a class="market-community-link-v3269" href="/app?view=feed&amp;compartirAnuncio='+esc(item.id)+'">Publicar en RedLibertad</a>'+
        '<button type="button" data-report="'+esc(item.id)+'">Denunciar anuncio</button>'+
      '</div></details>'+
    '</div></div>'
  : null;
 return '<article class="card market-catalog-card"><div class="thumb">'+cover+photoBadge+
 '</div><div class="cardbody"><span class="chip market-deal-'+esc(item.deal)+'">'+esc(badge)+'</span>'+(isRecentListing(item)?'<span class="chip market-new-chip">NUEVO</span>':'')+'<h3>'+esc(item.title)+'</h3>'+more+'<div class="price">'+priceLabel(item)+'</div>'+
 (info.length?'<p class="market-product-facts">'+info.map(esc).join(' · ')+'</p>':'')+
 '<p class="muted market-seller-location">📍 '+esc(location)+' · '+seller+'</p>'+
 (own?'<span class="market-state market-state-'+esc(item.status)+'">Estado: '+esc(label[item.status]||item.status)+(item.moderation_status==='hidden'?' · Oculto por moderación':'')+'</span>':'')+
 (compactActions||(
 '<div class="actions">'+(quickStatuses)+ (publicOK?'<a class="market-seo-link" href="'+esc(url)+'">Ver anuncio</a>':'<button data-open="'+esc(item.id)+'">Ver anuncio</button>')+
 (publicOK?'<button type="button" data-share="'+esc(item.id)+'">Compartir</button><a class="market-community-link-v3269" href="/app?view=feed&amp;compartirAnuncio='+esc(item.id)+'">Publicar en RedLibertad</a>':'')+
 (own?'<button data-edit="'+esc(item.id)+'">Editar</button><button class="danger-action" data-delete="'+esc(item.id)+'">Eliminar anuncio</button>':
 state.mode==='reports'?'<button data-mod="'+esc(item.id)+'">Moderar</button>':
 isOwner?'<button type="button" data-manage="'+esc(item.id)+'">Gestionar mi anuncio</button>':
 '<button class="market-contact-action" type="button" data-contact-id="'+esc(item.id)+'">Contactar</button><button data-fav="'+esc(item.id)+'" aria-label="'+(item.is_favorite?'Quitar de favoritos':'Guardar en favoritos')+'">'+(item.is_favorite?(state.mode==='favorites'?'♥ Quitar de favoritos':'♥ Guardado'):'♡ Guardar')+'</button><button data-report="'+esc(item.id)+'">Denunciar</button>')+

 '</div>'))+
 '</div></article>';
}
function emptyMarketplaceState(){
 if(state.mode==='mine')return '<div class="market-empty"><div class="market-empty-icon" aria-hidden="true">📦</div><h2>Todavía no tienes anuncios</h2><p>Publica un producto, ofrece un servicio o anuncia un inmueble.</p><button type="button" class="primary" data-empty-create>Publicar mi primer anuncio</button></div>';
 if(state.mode==='favorites')return '<div class="market-empty"><div class="market-empty-icon" aria-hidden="true">♡</div><h2>Aún no tienes favoritos</h2><p>Explora el Marketplace y guarda los anuncios que te interesen.</p><button type="button" class="primary" data-empty-explore>Explorar anuncios</button></div>';
 const searching=Boolean(state.kind||state.deal||[...new FormData($('#filters')).values()].some(v=>String(v).trim()));
 return searching
  ?'<div class="market-empty"><div class="market-empty-icon" aria-hidden="true">⌕</div><h2>No hay resultados con estos filtros</h2><p>Prueba otra ubicación, categoría o precio.</p><button type="button" class="secondary" data-empty-clear>Quitar filtros</button></div>'
  :'<div class="market-empty"><div class="market-empty-icon" aria-hidden="true">🛍️</div><h2>Aún no hay anuncios</h2><p>¿Quieres ser la primera persona en publicar?</p><button type="button" class="primary" data-empty-create>Publicar anuncio</button></div>';
}
async function load(reset=true){
 const requestId=++marketplaceLoadRequestV32643;
 if(reset)state.page=1;
 note('Cargando anuncios…');
 let path='/api/marketplace';
 if(state.mode==='mine')path+='/mine';
 else if(state.mode==='favorites')path+='/favorites';
 else if(state.mode==='reports')path+='/admin/reports';
 else{
  const f=new FormData($('#filters'));
  path+='?'+new URLSearchParams({kind:state.kind,deal:state.deal,q:String(f.get('q')||''),city:String(f.get('city')||''),province:String(f.get('province')||''),category:String(f.get('category')||''),maxPrice:String(f.get('maxPrice')||''),sort:String(f.get('sort')||'recent'),saleScope:state.nationalOnly?'national':'',page:String(state.page)});
 }
 if(!state.authenticated){$('#list').innerHTML='';$('#more').classList.add('hidden');note(state.authStatus==='guest'?'':'No se han podido cargar los anuncios. Reinténtalo.');return;}
 const data=await request(path);
 // Do not render a previous tab's async result after selecting another tab.
 if(requestId!==marketplaceLoadRequestV32643)return;
 if(!data.ok){note(errorMessage[data.error]||'No se pudo cargar. Vuelve a intentarlo.');return;}
 if(state.mode==='reports'){
   $('#list').innerHTML=(data.reports||[]).map(x=>'<article class="card"><div class="cardbody"><h3>'+esc(x.title)+'</h3><p>Motivo: '+esc(x.reason)+'</p><p>'+esc(x.details)+'</p><p class="muted">Denunciante: '+esc(x.reporter)+'</p><div class="actions"><button data-mod="'+esc(x.listing_id)+'">Gestionar</button></div></div></article>').join('');
   note(data.reports?.length?'':'No hay denuncias pendientes.');$('#more').classList.add('hidden');return;
 }
 const items=data.items||[];
 state.items=reset?items:[...state.items,...items];
 $('#list').innerHTML=state.items.length?state.items.map(card).join(''):emptyMarketplaceState();
 $('#more').classList.toggle('hidden',state.mode!=='discover'||!data.hasMore);
 updateQuickFiltersV3265();
 note('');
}
function updateQuickFiltersV3265(){
 const presets={all:!state.kind&&!state.deal&&!state.nationalOnly,products:state.kind==='product'&&!state.deal&&!state.nationalOnly,national:state.nationalOnly};
 $$('[data-market-quick]').forEach(button=>{const selected=!!presets[button.dataset.marketQuick];button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
 const notice=$('#marketAppliedFilters');
 if(!notice)return;
 const f=$('#filters');
 const values=f?new FormData(f):null;
 const terms=[];
 if(state.kind)terms.push({product:'Productos',service:'Servicios',property:'Inmuebles'}[state.kind]||state.kind);
 if(state.deal)terms.push({sale:'Venta',buy:'Compra / Busco',rent:'Alquiler',offer:'Servicios'}[state.deal]||state.deal);
 if(state.nationalOnly)terms.push('Toda España');
 for(const k of ['q','city','province','category','maxPrice'])if(String(values?.get(k)||'').trim())terms.push(k==='maxPrice'?'Precio máximo seleccionado':'Filtro '+({q:'búsqueda',city:'ciudad',province:'provincia',category:'categoría'}[k]||k));
 notice.textContent=terms.length?'Filtros activos: '+[...new Set(terms)].join(' · '):'';
}
function quickFilterV3265(value){
 if(value==='all'){$('#filters').reset();state.kind='';state.deal='';state.nationalOnly=false;}
 else if(value==='products'){state.kind='product';state.deal='';state.nationalOnly=false;}
 else if(value==='national'){state.kind='product';state.deal='sale';state.nationalOnly=true;}
 else return;
 $$('[data-kind]').forEach(b=>b.classList.toggle('active',b.dataset.kind===state.kind));
 $$('[data-deal]').forEach(b=>b.classList.toggle('active',b.dataset.deal===state.deal));
 updateQuickFiltersV3265();
 load();
}
function setDeal(d){state.deal=d;if(d!=='sale')state.nationalOnly=false;$$('[data-deal]').forEach(b=>b.classList.toggle('active',b.dataset.deal===d));updateQuickFiltersV3265();load();}
function setKind(k){state.kind=k;if(k!=='product')state.nationalOnly=false;$$('[data-kind]').forEach(b=>b.classList.toggle('active',b.dataset.kind===k));updateQuickFiltersV3265();load();}
function setMode(mode){
 state.mode=mode;
 $('#marketSellerTools').hidden=!state.authenticated||mode!=='mine';
 $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 $$('.tabs,.market-deals').forEach(nav=>nav.classList.toggle('hidden',mode!=='discover'));
 $('#filters').classList.toggle('hidden',mode!=='discover');
 updateQuickFiltersV3265();
 return load();
}
function syncKind(){
 const kind=$('#listingForm [name=kind]').value,deal=$('#listingForm [name=deal]');
 const allowed=kind==='property'?['sale','rent','buy']:kind==='service'?['offer']:['sale','buy'];
 [...deal.options].forEach(opt=>opt.hidden=!allowed.includes(opt.value));
 if(!allowed.includes(deal.value))deal.value=allowed[0];
 populateSuggestions();
 for(const [key,selector] of [['product','#productExtra'],['service','#serviceExtra'],['property','#propertyExtra']]){
  $(selector).classList.toggle('hidden',kind!==key);
 }
 $('#listingSaleScopeField').classList.toggle('hidden',kind!=='product'||deal.value!=='sale');
 $('#listingKindHint').textContent=kind==='product'?'Añade título, precio y fotos. El estado del producto es opcional.':kind==='service'?'Explica qué servicio ofreces y dónde lo prestas.':'Indica el inmueble, ubicación y precio. La superficie y las habitaciones son opcionales.';
 $('#listingForm [name=title]').placeholder=kind==='service'?'Ej. Pintura y reformas en Valencia':kind==='property'?'Ej. Piso de 3 habitaciones en Valencia':'Ej. Taza personalizada nueva';
 const budget=deal.value==='buy';
 $('#listingPriceLabel').textContent=budget?'Presupuesto máximo en euros':'Precio en euros';
 $('#listingPriceHint').textContent=budget?'Indica cuánto pagarías como máximo (0 € si está por negociar).':'Indica el precio del anuncio.';
}
function openEditor(item=null,preset=null){
 if(!state.authenticated){updateMarketplaceAuth('guest');return;}
 resetPendingPhotos();
 state.editing=item||null;state.images=item?[...(item.image_urls||[])]:[];
 const form=$('#listingForm');form.reset();
 $('#publishSuccess').classList.add('hidden');
 const f=n=>form.elements.namedItem(n);
 if(!item&&preset&&['product','service','property'].includes(preset.kind)){
  f('kind').value=preset.kind;
  const valid={product:['sale','buy'],service:['offer'],property:['sale','rent','buy']};
  f('deal').value=valid[preset.kind].includes(preset.deal)?preset.deal:valid[preset.kind][0];
 }
 $('#listingStatusField').classList.toggle('hidden',!item);
 if(item){
   for(const n of ['kind','deal','title','description','category','city','status'])f(n).value=n==='status'?item.status:(item[n]||'');
   f('price').value=(Number(item.price_cents)/100).toFixed(2);
   f('province').value=item.details?.province||'';
   f('subcategory').value=item.details?.subcategory||'';
   f('condition').value=item.details?.condition||'';
   f('brand').value=item.details?.brand||'';
   f('gtin').value=item.details?.gtin||'';
   f('mpn').value=item.details?.mpn||'';
   f('saleScope').value=item.details?.saleScope||(marketNational(item)?'national':'');
   f('serviceMode').value=item.details?.serviceMode||'';
   f('serviceArea').value=item.details?.serviceArea||'';
   f('areaM2').value=item.details?.areaM2??'';
   f('rooms').value=item.details?.rooms??'';
   f('subtype').value=item.details?.subtype||'';
 }
 syncKind();renderPhotos();$('#formError').textContent='';
 $('#editorTitle').textContent=item?'Editar anuncio':'Publicar anuncio';$('#editor').showModal();
}
function renderPhotos(){
 const previous=state.images.map((url,i)=>'<div class="photo-tile"><img alt="Fotografía guardada '+(i+1)+'" src="'+esc(url)+'"><button type="button" class="photo-remove" data-remove-photo="'+i+'" aria-label="Quitar fotografía guardada '+(i+1)+'">×</button><span class="photo-label">'+(i===0?'Portada':'Guardada')+'</span></div>');
 const pending=state.pendingPhotos.map((entry,i)=>'<div class="photo-tile"><img alt="Nueva fotografía '+(i+1)+'" src="'+esc(entry.previewUrl)+'"><button type="button" class="photo-remove" data-remove-pending="'+i+'" aria-label="Quitar nueva fotografía '+(i+1)+'">×</button><span class="photo-label">'+(state.images.length+i===0?'Portada · nueva':'Nueva')+'</span></div>');
 $('#imagesPreview').innerHTML=previous.concat(pending).join('');
 const count=state.images.length+state.pendingPhotos.length;
 $('#photoCount').textContent=count+' de '+MAX_MARKET_PHOTOS+' fotografías'+(count?' · la primera será la portada':'');
 $('#photoAddGallery').disabled=count>=MAX_MARKET_PHOTOS;
 $('#photoTakeCamera').disabled=count>=MAX_MARKET_PHOTOS;
}
function closeDialog(id){$('#'+id).close();}

const FIELD_LABELS={kind:'Tipo',deal:'Operación',title:'Título',description:'Descripción',category:'Categoría',city:'Ciudad',price:'Precio'};
function listingFormData(form){
  const raw=new FormData(form);
  const field=name=>String(raw.get(name)||'').trim();
  const title=field('title'),description=field('description'),category=field('category'),city=field('city');
  const kind=field('kind'),deal=field('deal'),priceText=field('price').replace(',','.');
  const invalid=(name,message)=>({error:message,field:name});
  if(!['product','service','property'].includes(kind))return invalid('kind','Selecciona el tipo de anuncio.');
  if((kind==='product'&&!['sale','buy'].includes(deal))||(kind==='service'&&deal!=='offer')||(kind==='property'&&!['sale','rent','buy'].includes(deal)))return invalid('deal','Revisa la operación seleccionada.');
  if(title.length<6||title.length>120)return invalid('title','El título debe tener entre 6 y 120 caracteres.');
  if(description.length<25||description.length>4000)return invalid('description','La descripción debe tener entre 25 y 4.000 caracteres.');
  if(category.length<2||category.length>65)return invalid('category','Introduce una categoría válida.');
  if(city.length<2||city.length>100)return invalid('city','Introduce la ciudad o zona del anuncio.');
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(priceText))return invalid('price','Introduce un precio válido, por ejemplo 15,99 o 15.99.');
  const priceCents=Math.round(Number(priceText)*100);
  if(!Number.isSafeInteger(priceCents)||priceCents>99999999900)return invalid('price','El precio supera el máximo permitido.');
  const province=field('province'),subcategory=field('subcategory');
  if(province.length>100)return invalid('province','La provincia no debe superar 100 caracteres.');
  if(subcategory.length>65)return invalid('subcategory','La subcategoría no debe superar 65 caracteres.');
  const extra={};
  if(kind==='product'&&['new','used'].includes(field('condition')))extra.condition=field('condition');
  if(kind==='product'){
    const brand=field('brand'),gtin=field('gtin'),mpn=field('mpn');
    if(brand.length>80)return invalid('brand','La marca no puede superar 80 caracteres.');
    if(gtin&&!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin))return invalid('gtin','Indica un EAN/GTIN de 8, 12, 13 o 14 dígitos.');
    if(mpn&&(mpn.length>70||!/^[A-Za-z0-9][A-Za-z0-9 ._\/-]*$/.test(mpn)))return invalid('mpn','Revisa la referencia del fabricante.');
    if(brand)extra.brand=brand;
    if(gtin)extra.gtin=gtin;
    if(mpn)extra.mpn=mpn;
  }
  if(kind==='product'&&deal==='sale'){
    const scope=field('saleScope');
    if(scope&&!['local','national'].includes(scope))return invalid('saleScope','Selecciona una zona de venta válida.');
    if(scope)extra.saleScope=scope;
  }
  if(kind==='service'){
    const mode=field('serviceMode'),area=field('serviceArea');
    if(mode&&!Object.hasOwn(SERVICE_MODE_LABELS,mode))return invalid('serviceMode','Selecciona una modalidad válida.');
    if(area.length>100)return invalid('serviceArea','La zona no debe superar 100 caracteres.');
    if(mode)extra.serviceMode=mode;
    if(area)extra.serviceArea=area;
  }
  if(kind==='property'){
    const area=field('areaM2'),rooms=field('rooms'),subtype=field('subtype');
    if(area&&(!/^\d{1,6}$/.test(area)||Number(area)<1||Number(area)>100000))return invalid('areaM2','La superficie debe ser un número de 1 a 100.000.');
    if(rooms&&(!/^\d{1,3}$/.test(rooms)||Number(rooms)>100))return invalid('rooms','Indica entre 0 y 100 habitaciones.');
    if(subtype.length>60)return invalid('subtype','El tipo de inmueble no debe superar 60 caracteres.');
    if(area)extra.areaM2=Number(area);
    if(rooms)extra.rooms=Number(rooms);
    if(subtype)extra.subtype=subtype;
  }
  return {data:{kind,deal,title,description,category,city,priceCents,images:[],details:{...(province?{province}:{}),...(subcategory?{subcategory}:{}),...extra}},status:field('status')};
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
  if(!state.authenticated){listingError('Inicia sesión antes de publicar.');return;}
  const originalLabel=btn.textContent;
  btn.disabled=true;
  $('#formError').textContent='';
  $$('#listingForm [aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));
  try{
    const parsed=listingFormData(form);
    if(parsed.error){listingError(parsed.error,parsed.field);return;}
    const pics=state.pendingPhotos.slice();
    if(pics.length+state.images.length>MAX_MARKET_PHOTOS){
      listingError('Solo puedes añadir hasta 6 fotografías.','photos');return;
    }
    for(const entry of pics){
      const error=photoValidation(entry.file);
      if(error){listingError(error,'photos');return;}
    }
    for(let index=0;index<pics.length;index++){
      const entry=pics[index],photo=entry.file;
      btn.textContent='Subiendo foto '+(index+1)+' de '+pics.length+'…';
      const body=new FormData();body.set('file',photo,photo.name);
      const result=await request('/api/media/upload',{method:'POST',body});
      if(!result.ok||!result.media?.url){
        listingError(uploadErrorText(result,photo),'photos');return;
      }
      const url=result.media.url;
      if(!/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:jpe?g|png|webp)$/i.test(url)){
        listingError('La fotografía se subió, pero su dirección no es compatible con Marketplace. Contacta con soporte.','photos');return;
      }
      state.images.push(url);
      const position=state.pendingPhotos.indexOf(entry);
      if(position>=0)state.pendingPhotos.splice(position,1);
      URL.revokeObjectURL(entry.previewUrl);
      renderPhotos();
    }
    btn.textContent=state.editing?'Actualizando anuncio…':'Publicando anuncio…';
    // Build optional metadata only from visible fields to avoid stale values after changing kind.
    const payload={...parsed.data,images:[...state.images]};
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
    const savedId=String(response.id||state.editing?.id||'');
    const savedTitle=parsed.data.title;
    closeDialog('editor');
    await setMode('mine');
    const saved=state.items.find(item=>String(item.id)===savedId);
    if(saved&&saved.status==='active'&&saved.moderation_status==='published'&&saved.seller_discoverable===true){
      showPublishShare(savedId,savedTitle);
    }
    note('Anuncio guardado correctamente.');
  }catch(error){
    console.error('Marketplace save failed',error);
    listingError('Ha ocurrido un error al guardar. Los datos siguen en el formulario. '+String(error?.message||'Inténtalo de nuevo.'));
  }finally{
    btn.textContent=originalLabel;
    btn.disabled=!state.authenticated;
  }
}

function showPublishShare(id,title){
 if(!/^[1-9]\d{0,15}$/.test(String(id)))return;
 const url=location.origin+'/marketplace/p/'+encodeURIComponent(id)+'/'+slugifyMarket(title);
 const message='Mira este anuncio en RedLibertad: '+title+' '+url;
 const box=$('#publishSuccess');
 box.innerHTML='<strong>¡Tu anuncio está listo para compartir!</strong><div class="market-share-inline">'+
  '<a class="primary" href="'+esc('https://api.whatsapp.com/send?text='+encodeURIComponent(message))+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>'+
  '<a class="secondary" href="'+esc('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url))+'" target="_blank" rel="noopener noreferrer">Facebook</a>'+
  '<a class="secondary" href="'+esc(url)+'">Ver anuncio</a>'+
  '<a class="secondary market-community-link-v3269" href="/app?view=feed&amp;compartirAnuncio='+esc(id)+'">Publicar en RedLibertad</a>'+
  '<button type="button" class="secondary" data-copy-published="'+esc(url)+'">Copiar enlace</button></div>';
 box.classList.remove('hidden');
}
function marketDescriptionHtmlV3267(value){
 const text=String(value??'').replace(/\r\n?/g,'\n').replace(/\\r\\n|\\n|\\r/g,'\n').trim();
 if(text.length<=650)return '<p class="market-private-description">'+esc(text)+'</p>';
 const chunk=text.slice(0,530),space=chunk.lastIndexOf(' '),line=chunk.lastIndexOf('\n');
 const at=line>=290?line:space>=340?space:530;
 return '<div class="market-private-description"><p>'+esc(text.slice(0,at).trimEnd())+'</p>'+
  '<details><summary>Leer descripción completa</summary><p>'+esc(text.slice(at).trimStart())+'</p></details></div>';
}

function details(item){
 const images=(item.image_urls||[]).filter(u=>/^\/uploads\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(u));
 const mine=String(item.seller_id)===String(window.currentUserId);
 const publicOK=item.status==='active'&&item.moderation_status==='published'&&item.seller_discoverable===true;
 const sellerOK=item.seller_discoverable===true&&/^[A-Za-z0-9_.-]+$/.test(String(item.seller_username||''));
 const seller=sellerOK?'<a href="/perfil/'+encodeURIComponent(item.seller_username)+'">'+esc(item.seller_name||item.seller_username)+'</a>':esc(item.seller_name||item.seller_username);
 $('#detailContent').innerHTML='<h2>'+esc(item.title)+'</h2><div class="gallery">'+
 (images.length?images.map(u=>'<img src="'+esc(u)+'" alt="Fotografía del anuncio">').join(''):'<div class="thumb" style="width:100%">📦</div>')+
 '</div><p><span class="chip market-deal-'+esc(item.deal)+'">'+esc(item.deal==='buy'?'BUSCO COMPRAR':item.deal==='sale'?'EN VENTA':item.deal==='rent'?'ALQUILER':'SERVICIO')+'</span></p>'+
 '<div class="price">'+priceLabel(item)+'</div><p>📍 '+esc(marketDisplayLocation(item))+' · '+esc(item.category)+(item.details?.subcategory?' · '+esc(item.details.subcategory):'')+'</p>'+
 marketDescriptionHtmlV3267(item.description)+(listingFacts(item).length?'<div class="market-facts">'+listingFacts(item).map(f=>'<div>'+esc(f)+'</div>').join('')+'</div>':'')+'<p class="muted">Publicado por '+seller+'</p><div class="actions">'+
 (publicOK?'<button data-share="'+esc(item.id)+'">Compartir anuncio</button><a class="market-community-link-v3269" href="/app?view=feed&amp;compartirAnuncio='+esc(item.id)+'">Publicar en RedLibertad</a>':'')+
 (mine?'':'<button class="primary" type="button" data-contact-id="'+esc(item.id)+'">Contactar por chat</button><button data-report="'+esc(item.id)+'">Denunciar anuncio</button>')+
 (publicOK&&sellerOK?'<a class="market-seller-more" href="/marketplace/vendedor/'+encodeURIComponent(item.seller_username)+'">Ver otros anuncios de esta persona</a>':'')+
 '</div><small>RedLibertad no interviene en el pago, envío ni en los acuerdos.</small>';
 $('#detail').showModal();
}
async function shareListing(item){
 if(!item||item.status!=='active'||item.moderation_status!=='published'||item.seller_discoverable!==true)return;
 const url=location.origin+'/marketplace/p/'+encodeURIComponent(item.id)+'/'+slugifyMarket(item.title);
 if(navigator.share){
  try{await navigator.share({title:item.title,text:'Mira este anuncio en RedLibertad',url});return;}
  catch(error){if(error?.name==='AbortError')return;}
 }
 try{
  if(!navigator.clipboard?.writeText)throw Error('No clipboard');
  await navigator.clipboard.writeText(url);
  note('Enlace del anuncio copiado. Puedes compartirlo por WhatsApp o Facebook.');
 }catch{
  window.prompt('Copia el enlace del anuncio:',url);
 }
}
function openReport(id){
 if(!state.authenticated){updateMarketplaceAuth('guest');return;}
 state.reportId=String(id);
 $('#reportError').textContent='';
 $('#reportForm').reset();
 $('#reportDialog').showModal();
}
async function submitReport(event){
 event.preventDefault();
 if(!state.reportId)return;
 const button=$('#reportSubmit');button.disabled=true;
 const data=new FormData($('#reportForm'));
 const body={reason:String(data.get('reason')||''),details:String(data.get('details')||'').trim()};
 const result=await request('/api/marketplace/'+encodeURIComponent(state.reportId)+'/report',{method:'POST',body:JSON.stringify(body)});
 button.disabled=false;
 if(!result.ok){
  $('#reportError').textContent=result.status===401?'Inicia sesión para denunciar el anuncio.':'No se pudo enviar. Inténtalo otra vez.';
  return;
 }
 state.reportId=null;closeDialog('reportDialog');note('Denuncia recibida. Moderación revisará el anuncio.');
}
async function showDetail(id){
 let item=state.items.find(x=>String(x.id)===String(id));
 if(!item){const r=await request('/api/marketplace/'+encodeURIComponent(id));item=r.item;}
 if(item)details(item);else note('Este anuncio ya no está disponible.');
}
async function contactListing(id,expectedSeller=''){
 if(!/^[1-9]\d{0,15}$/.test(String(id||'')))return note('Este anuncio no está disponible.');
 const result=await request('/api/marketplace/'+encodeURIComponent(id));
 const item=result.item;
 if(!result.ok||!item||item.status!=='active'||item.moderation_status!=='published'){
  note('Este anuncio no está disponible para contactar.');return;
 }
 if(String(item.seller_id)===String(window.currentUserId)){
  note('Este anuncio es tuyo. Puedes gestionarlo desde «Mis anuncios».');return;
 }
 if(expectedSeller&&String(item.seller_username||'').toLowerCase()!==String(expectedSeller).toLowerCase()){
  note('El anunciante de este producto ha cambiado. Vuelve a la ficha para comprobarlo.');return;
 }
 if(!/^[A-Za-z0-9_.-]{3,30}$/.test(String(item.seller_username||''))){
  note('No es posible contactar con este anunciante.');return;
 }
 return contact(item.seller_username,id);
}
async function contact(username,listingId=null){
 const result=await request('/api/messages/conversations',{method:'POST',body:JSON.stringify({username})});
 if(!result.ok){alert('No se puede contactar con este usuario. Puede tener restringidos los mensajes.');return;}
 location.href='/app?view=messages&conversation='+encodeURIComponent(result.conversationId)+(listingId&&/^[1-9]\d{0,15}$/.test(String(listingId))?'&marketListing='+encodeURIComponent(listingId):'');
 return true;
}
function marketplaceLoginEntry(username,id){
 if(!/^[A-Za-z0-9_.-]{3,30}$/.test(String(username||''))||!/^[1-9]\d{0,15}$/.test(String(id||'')))return '/';
 const path='/marketplace?contact='+encodeURIComponent(username)+'&listing='+encodeURIComponent(id);
 return '/?'+new URLSearchParams({entry:'marketplace_contact',entryKey:String(id),next:path}).toString();
}
async function init(){
 updateMarketplaceAuth('checking');
 const me=await request('/api/auth/me');
 if(!me.ok){
   const params=new URLSearchParams(location.search);
   const explicitIntent=['publicar','contact','listing','report'].some(key=>params.has(key));
   document.body.classList.remove('market-contact-guest');
   if(me.status===401&&!explicitIntent){
     // Anonymous /marketplace now opens the actual public catalogue; no empty landing.
     location.replace('/marketplace/explorar');return;
   }
   updateMarketplaceAuth(me.status===401?'guest':'unavailable');
   $('#list').innerHTML='';
   $('#more').classList.add('hidden');
   note(me.status===401?'':'No se ha podido comprobar tu sesión.');
   const guestParams=new URLSearchParams(location.search);
   const contactId=guestParams.get('listing'),contactSeller=guestParams.get('contact');
   if(me.status===401&&/^[1-9]\d{0,15}$/.test(String(contactId||''))&&/^[A-Za-z0-9_.-]{3,30}$/.test(String(contactSeller||''))){
    document.body.classList.add('market-contact-guest');
    const box=$('#contactContext');
    box.classList.remove('hidden');
    box.innerHTML='<h2>Consulta sobre este anuncio</h2><p>Inicia sesión o crea tu cuenta para consultar al vendedor. Al terminar volverás a esta consulta.</p>'+
      '<a class="primary market-contact-login" href="'+esc(marketplaceLoginEntry(contactSeller,contactId))+'">Iniciar sesión y continuar →</a>'+
      '<a class="market-contact-back" href="/marketplace/p/'+encodeURIComponent(contactId)+'">← Volver a la ficha del anuncio</a>';
   }
   return;
 }
 document.body.classList.remove('market-contact-guest');
 updateMarketplaceAuth('signed-in');
 window.currentUserId=me.user?.id??me.id;
 state.admin=!!(me.user?.is_admin??me.user?.isAdmin??me.is_admin);
 $('#reportsTab').classList.toggle('hidden',!state.admin);
 if(state.admin){
   const tools=$('#marketSellerTools');
   if(tools&&!tools.querySelector('[data-admin-professional]')){
     const link=document.createElement('a');
     link.href='/marketplace/tiendas';
     link.className='market-seller-import-link';
     link.dataset.adminProfessional='true';
     link.textContent='Administrar tiendas profesionales →';
     tools.appendChild(link);
   }
 }
 // The public product CTA and post-login return both express an explicit contact intent.
 // Recheck the listing, seller, owner and publication status before redirecting to chat.
 const contactParams=new URLSearchParams(location.search);
 const wantedSeller=contactParams.get('contact'),wantedListing=contactParams.get('listing');
 if(/^[A-Za-z0-9_.-]{3,30}$/.test(String(wantedSeller||''))&&/^[1-9]\d{0,15}$/.test(String(wantedListing||''))){
  const opened=await contactListing(wantedListing,wantedSeller);
  if(opened)return;
 }
 await load();
 if(new URLSearchParams(location.search).get('publicar')==='1')openEditor();
 const reportId=new URLSearchParams(location.search).get('report');
 if(/^[1-9]\d{0,15}$/.test(String(reportId||'')))openReport(reportId);
 const params=new URLSearchParams(location.search);
 const contactName=params.get('contact'),listingId=params.get('listing');
 if(contactName&&/^[A-Za-z0-9_.-]{3,30}$/.test(contactName)){
  const box=$('#contactContext');
  if(listingId&&/^[1-9]\d{0,15}$/.test(listingId)){
   const listing=await request('/api/marketplace/'+encodeURIComponent(listingId));
   const item=listing.item;
   if(listing.ok&&item&&String(item.seller_username).toLowerCase()===contactName.toLowerCase()
      &&String(item.seller_id)!==String(window.currentUserId)
      &&item.status==='active'&&item.moderation_status==='published'){
    box.classList.remove('hidden');
    box.innerHTML='<h2>Consulta sobre este anuncio</h2><p><strong>'+esc(item.title)+'</strong> · '+priceLabel(item)+'</p>'+
     '<p>Hablarás por el chat privado de RedLibertad. No se envía ningún mensaje automáticamente.</p>'+
     '<button type="button" class="primary" data-contact-id="'+esc(item.id)+'">Abrir conversación con '+esc(item.seller_name||item.seller_username)+'</button>';
   }else note('Este anuncio no está disponible para contactar.');
  }else{
   box.classList.remove('hidden');
   box.innerHTML='<h2>Contactar con el anunciante</h2><p>Elige el anuncio desde el catálogo para contactar con su propietario.</p>'+
    '<a class="secondary market-seller-more" href="/marketplace/explorar">Explorar anuncios</a>';
  }
 }
}
$$('[data-kind]').forEach(b=>b.onclick=()=>setKind(b.dataset.kind));
$$('[data-deal]').forEach(b=>b.onclick=()=>setDeal(b.dataset.deal));
$$('[data-market-quick]').forEach(b=>b.onclick=()=>quickFilterV3265(b.dataset.marketQuick));
$$('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#filters').onsubmit=e=>{e.preventDefault();updateQuickFiltersV3265();setMode('discover');};
$('#more').onclick=()=>{state.page++;load(false);};
$('#newListing').onclick=()=>{if(!state.authenticated){location.href='/';return;}openEditor();};
$('#authRetry').onclick=()=>init();
$('#photoAddGallery').onclick=()=>$('#listingForm [name=photos]').click();
$('#photoTakeCamera').onclick=()=>$('#listingForm [name=cameraPhoto]').click();
$('#listingForm [name=photos]').addEventListener('change',event=>{
 addPendingPhotos(event.target.files);event.target.value='';
});
$('#listingForm [name=cameraPhoto]').addEventListener('change',event=>{
 addPendingPhotos(event.target.files);event.target.value='';
});
$('#editor').addEventListener('close',()=>{resetPendingPhotos();});
$('#listingForm [name=kind]').onchange=syncKind;
$('#listingForm [name=deal]').onchange=syncKind;
$('#listingForm').addEventListener('submit',saveListing);
$('#listingForm [name=category]').addEventListener('input',populateSuggestions);
$('#reportForm').addEventListener('submit',submitReport);
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.startKind){openEditor(null,{kind:b.dataset.startKind,deal:b.dataset.startDeal});return;}
 if(b.dataset.copyPublished){try{await navigator.clipboard.writeText(b.dataset.copyPublished);note('Enlace copiado para compartir.');}catch{window.prompt('Copia el enlace:',b.dataset.copyPublished);}return;}
 if(b.hasAttribute('data-empty-create')){openEditor();return;}
 if(b.hasAttribute('data-empty-explore')){setMode('discover');return;}
 if(b.hasAttribute('data-empty-clear')){
  $('#filters').reset();state.kind='';state.deal='';
  $$('[data-kind],[data-deal]').forEach(filter=>filter.classList.toggle('active',filter.dataset.kind===''||filter.dataset.deal===''));
  load();return;
 }
 if(b.dataset.manage){setMode('mine');return;}
 if(b.dataset.close){closeDialog(b.dataset.close);return;}
 if(b.dataset.removePhoto!==undefined){state.images.splice(Number(b.dataset.removePhoto),1);renderPhotos();return;}
 if(b.dataset.removePending!==undefined){
  const entry=state.pendingPhotos.splice(Number(b.dataset.removePending),1)[0];
  if(entry)URL.revokeObjectURL(entry.previewUrl);
  renderPhotos();return;
 }
 if(b.dataset.open){await showDetail(b.dataset.open);return;}
 if(b.dataset.edit){const item=state.items.find(x=>String(x.id)===b.dataset.edit);if(item)openEditor(item);return;}
 if(b.dataset.quickStatus){
  if(state.mode!=='mine'||!state.authenticated)return;
  const item=state.items.find(x=>String(x.id)===String(b.dataset.quickStatus));
  const status=String(b.dataset.to||'');
  if(!item||!['active','reserved','sold','paused'].includes(status)||String(item.seller_id)!==String(window.currentUserId))return;
  if(status==='sold'&&!confirm('¿Marcar este anuncio como vendido o finalizado? Dejará de aparecer en la búsqueda pública.'))return;
  b.disabled=true;
  const result=await request('/api/marketplace/'+encodeURIComponent(item.id)+'/status',{method:'PATCH',body:JSON.stringify({status})});
  if(result.ok){await load();note('Estado del anuncio actualizado: '+(label[status]||status)+'.');}
  else{b.disabled=false;note('No se pudo cambiar el estado del anuncio. Inténtalo de nuevo.');}
  return;
 }
 if(b.dataset.delete){
  if(!state.authenticated){updateMarketplaceAuth('guest');return;}
  const item=state.items.find(x=>String(x.id)===String(b.dataset.delete));
  if(!item||state.mode!=='mine')return;
  const message='¿Eliminar definitivamente «'+item.title+'»?\n\nEl anuncio desaparecerá de Marketplace y se retirará del sitemap. Esta acción no se puede deshacer.';
  if(!confirm(message))return;
  b.disabled=true;b.textContent='Eliminando…';
  const result=await request('/api/marketplace/'+encodeURIComponent(b.dataset.delete),{method:'DELETE'});
  if(result.ok){await load();note('Anuncio eliminado correctamente.');}
  else{b.disabled=false;b.textContent='Eliminar anuncio';note(result.status===401?'Tu sesión ha caducado. Inicia sesión para borrar anuncios.':'No se pudo eliminar el anuncio. Inténtalo de nuevo.');}
  return;
 }
 if(b.dataset.share){const item=state.items.find(x=>String(x.id)===String(b.dataset.share));if(item)await shareListing(item);return;}
 if(b.dataset.fav){
  const item=state.items.find(x=>String(x.id)===b.dataset.fav);if(!item)return;
  b.disabled=true;
  const removing=!!item.is_favorite;
  const r=await request('/api/marketplace/'+encodeURIComponent(item.id)+'/favorite',{method:removing?'DELETE':'POST'});
  if(r.ok){await load();note(removing?'Anuncio retirado de tus favoritos.':'Anuncio guardado en tus favoritos.');}
  else{b.disabled=false;note('No se pudieron actualizar los favoritos. Inténtalo de nuevo.');}
  return;
 }
 if(b.dataset.contactId){b.disabled=true;try{await contactListing(b.dataset.contactId);}finally{b.disabled=false;}return;}
 if(b.dataset.contact){await contact(b.dataset.contact);return;}
 if(b.dataset.report){openReport(b.dataset.report);return;}
 if(b.dataset.mod){const action=prompt('Acción: hide, restore o resolve','hide');if(!action)return;const r=await request('/api/marketplace/admin/'+encodeURIComponent(b.dataset.mod)+'/moderate',{method:'POST',body:JSON.stringify({action})});if(r.ok)await load();else note('No se pudo moderar.');}
});
init();
