'use strict';
// Private admin dashboard UI: all API text goes through textContent, not HTML.
(function(){
 const $=id=>document.getElementById(id);
 const status=$('auditStatus'),results=$('auditResults'),button=$('auditRefresh');
 const exampleFilter=$('auditExampleFilter'),moreExamples=$('auditMoreExamples'),shownCount=$('auditShownCount');
 const PAGE_SIZE=20;
 let exampleRows=[],visibleExamples=PAGE_SIZE;
 const element=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 const clear=container=>container.replaceChildren();
 const number=n=>new Intl.NumberFormat('es-ES').format(Number(n)||0);
 const safeUrl=value=>/^\/marketplace\/(?:p\/[1-9][0-9]*\/[a-z0-9-]+|[a-z-]+)$/.test(String(value||''))?value:null;
 function card(container,count,label,description){
  const box=element('div','audit-metric');
  box.append(element('strong','audit-metric-value',number(count)),element('span','audit-metric-label',label));
  if(description)box.append(element('small','audit-muted',description));
  container.append(box);
 }
 // V3.2.121: render only 20 recent public ad examples at a time.
 // All controls act on the bounded server-provided sample; there are no writes.
 function renderExamples(){
  const container=$('auditExamples');
  clear(container);
  const group=exampleFilter.value;
  const matches=exampleRows.filter(item=>{
   if(group==='todos')return true;
   const codes=Array.isArray(item.issues)?item.issues:[];
   if(group==='fotos')return codes.some(code=>['sin_fotos_publicas','referencias_imagen_invalidas','fotografias_duplicadas'].includes(code));
   if(group==='datos')return codes.some(code=>['titulo_corto','categoria_incompleta'].includes(code));
   if(group==='descripcion')return codes.includes('descripcion_breve');
   return false;
  });
  const visible=matches.slice(0,visibleExamples);
  for(const item of visible){
   const row=element('div','audit-example'),top=element('div','audit-example-head');
   const link=element('a',null,item.title),uri=safeUrl(item.url);
   if(uri)link.href=uri;
   top.append(link,element('small','audit-muted',item.category||'Sin categoría'));
   const tags=element('div','audit-tags');
   for(const key of item.issues)tags.append(element('span','audit-tag',currentLabels[key]||key));
   row.append(top,tags);
   if(gscReady){
    const prep=element('button','audit-gsc-pick','Preparar inspección en Google');
    prep.type='button';
    prep.addEventListener('click',()=>{
     gscId.value=String(item.id);
     gscAction.textContent='Anuncio '+String(item.id)+' preparado. Pulsa Inspeccionar en Google para consultar su estado.';
    });
    row.append(prep);
   }
   container.append(row);
  }
  if(!matches.length)container.append(element('p','audit-muted','No hay avisos de este tipo en la muestra revisada.'));
  shownCount.textContent='Mostrando '+number(visible.length)+' de '+number(matches.length)+' ejemplos de este filtro';
  moreExamples.hidden=visible.length>=matches.length;
 }
 let currentLabels=Object.create(null);
 exampleFilter.addEventListener('change',()=>{
  visibleExamples=PAGE_SIZE;
  renderExamples();
 });
 moreExamples.addEventListener('click',()=>{
  visibleExamples+=PAGE_SIZE;
  renderExamples();
 });
 // Values from the private audit API are display-only estimates. Keep external
 // URLs out of this UI and do not run an HTTP probe from the browser.
 const sitemapLinkPath=value=>/^\/sitemap-marketplace(?:-(?:productos|servicios|inmuebles|categorias))?(?:-[1-9][0-9]*\.xml|\.xml)$/.test(String(value||''))?value:null;
 function renderSitemaps(data){
  const list=$('auditSitemapPlan');
  clear(list);
  const estimate=data.technicalSitemaps;
  if(estimate?.kind!=='expected_sitemap_structure'||!Array.isArray(estimate.entries)){
   list.append(element('p','audit-muted','No se pudo generar una previsión de sitemaps.'));
   $('auditSitemapNote').textContent='';
   return;
  }
  for(const item of estimate.entries){
   const card=element('div','audit-sitemap-item');
   const header=element('div','audit-sitemap-heading');
   const path=sitemapLinkPath(item.path);
   const link=element('a',null,item.label);
   if(path)link.href=path;
   header.append(link,element('span','audit-sitemap-count',number(item.count)+' anuncios o categorías'));
   const detail=element('p','audit-muted',item.type==='urlset'?'Listado de categorías aptas':'Índice con '+number(item.pages)+' página(s) XML esperadas');
   card.append(header,detail);
   const first=sitemapLinkPath(item.firstPage);
   if(first){
    const firstLink=element('a','audit-sitemap-first','Ver primera página ↗');
    firstLink.href=first;
    card.append(firstLink);
   }
   const last=sitemapLinkPath(item.lastPage);
   if(last&&last!==first){
    const lastLink=element('a','audit-sitemap-last','Ver última página prevista ↗');
    lastLink.href=last;
    card.append(lastLink);
   }
   list.append(card);
  }
  $('auditSitemapNote').textContent=String(estimate.note||'');
 }
 // Only admin-triggered manual reads may call Google. Never auto-inspect on page load.
 const gscId=$('auditGscId'),gscButton=$('auditGscInspect');
 const gscState=$('auditGscState'),gscAction=$('auditGscActionStatus');
 const gscResult=$('auditGscResult'),gscFields=$('auditGscResultFields');
 const gscInterpretation=$('auditGscInterpretation');
 let gscReady=false;
 function renderGscStatus(info){
  gscReady=info?.mode==='google_search_console_readonly'&&info?.configured===true;
  gscButton.disabled=!gscReady;
  gscState.textContent=info?.note||'Search Console todavía no está configurado para consultas reales.';
  const checks=$('auditGscConfigChecks');
  clear(checks);
  for(const item of info?.checks||[]){
   if(typeof item?.label!=='string'||typeof item?.ok!=='boolean')continue;
   const row=element('div',item.ok?'audit-gsc-check audit-gsc-check-ok':'audit-gsc-check audit-gsc-check-fail');
   row.append(element('strong',null,(item.ok?'✓ ':'✕ ')+item.label));
   if(!item.ok&&typeof item.hint==='string')
    row.append(element('small','audit-muted',item.hint));
   checks.append(row);
  }
  if(!gscReady){
   gscResult.hidden=true;
   clear(gscFields);
   gscInterpretation.hidden=true;
   clear(gscInterpretation);
  }
 }
 const googleVerdict=Object.freeze({
  PASS:'Válida en el índice de Google',
  FAIL:'Error o no válida según Google',
  NEUTRAL:'Excluida según Google',
  PARTIAL:'Estado parcial',
  VERDICT_UNSPECIFIED:'Estado no especificado por Google'
 });
 const googleErrors=Object.freeze({
  gsc_not_configured:'Conecta primero la cuenta de servicio de Search Console mediante Coolify.',
  gsc_invalid_listing_id:'Introduce un número de anuncio válido (solo dígitos).',
  gsc_listing_not_public:'El anuncio no está publicado o su vendedor no tiene perfil público.',
  gsc_same_origin_json_required:'La sesión no pudo validar esta petición. Recarga la página.',
  gsc_hourly_limit:'Se ha alcanzado el límite de seis inspecciones por hora. Vuelve más tarde.',
  gsc_quota_exceeded:'Google ha indicado que se ha agotado la cuota de inspección.',
  gsc_access_denied:'Google no autoriza la cuenta de servicio. Comprueba los permisos en Search Console.',
  gsc_invalid_service_account_key:'La clave de la cuenta de servicio no es válida. Revísala en Coolify.',
  gsc_network_unavailable:'No ha sido posible contactar con Google desde el servidor.',
  gsc_invalid_response:'Google ha devuelto una respuesta inesperada.',
  gsc_remote_error:'Google no ha podido completar la consulta. Inténtalo más tarde.'
 });
 function renderGscInspection(data){
  clear(gscFields);
  const entries=[
   ['URL consultada',data.inspectionUrl],
   ['Veredicto de Google',googleVerdict[data.verdict]||googleVerdict.VERDICT_UNSPECIFIED],
   ['Detalle de cobertura',data.coverageState||'No indicado'],
   ['Permiso de indexación',data.indexingState||'No indicado'],
   ['Recuperación por Google',data.pageFetchState||'No indicado'],
   ['Acceso según robots.txt',data.robotsTxtState||'No indicado'],
   ['Último rastreo registrado',data.lastCrawlTime||'No consta'],
   ['URL canónica elegida por Google',data.googleCanonical||'No consta'],
   ['URL canónica declarada',data.userCanonical||'No consta'],
   ['Sitemaps conocidos por Google',Array.isArray(data.sitemaps)&&data.sitemaps.length?data.sitemaps.join(' · '):'No constan (la lista de Google puede ser incompleta)']
  ];
  for(const [label,value] of entries){
   const pair=element('div','audit-gsc-field');
   pair.append(element('strong',null,label),element('span',null,String(value).slice(0,1800)));
   gscFields.append(pair);
  }
  gscResult.hidden=false;
 }
 // V3.2.125: status classification comes from real, explicit inspections,
 // not the editorial audit or a site-wide Google Search Console estimate.
 const followupLoad=$('auditFollowupLoad'),followupFilter=$('auditFollowupFilter'),
  followupStatus=$('auditFollowupStatus'),followupCounts=$('auditFollowupCounts'),
  followupEntries=$('auditFollowupEntries');
 const FOLLOWUP_STATES=Object.freeze({
  indexed:'Indexados',discovered:'Descubiertos',crawled:'Rastreados sin indexar',
  technical:'Posibles problemas técnicos',excluded:'Otras exclusiones',unknown:'No determinados'
 });
 let savedFollowup=null;
 function niceDate(value){
  const dt=new Date(value);
  return Number.isFinite(dt.getTime())?dt.toLocaleString('es-ES'):'Fecha no disponible';
 }
 function renderInspectionInterpretation(info,saved){
  clear(gscInterpretation);
  if(!info||!Object.hasOwn(FOLLOWUP_STATES,String(info.code||''))){
   gscInterpretation.hidden=true;
   return;
  }
  gscInterpretation.append(
   element('strong',null,info.label),
   element('p',null,info.advice),
   element('small','audit-muted',info.note)
  );
  gscInterpretation.append(element('p','audit-muted',saved
   ?'Resultado guardado en el seguimiento privado. Puedes consultar las inspecciones anteriores sin llamar a Google.'
   :'No se ha guardado este resultado en el historial. Solo se almacenan inspecciones manuales de productos públicos en venta; también puede haber un problema temporal de almacenamiento.'));
  gscInterpretation.hidden=false;
 }
 function renderFollowupRows(){
  clear(followupEntries);
  const source=savedFollowup?.products;
  if(!Array.isArray(source))return;
  const currentFilter=followupFilter.value;
  const filtered=source.filter(item=>currentFilter==='todos'||item.status===currentFilter);
  for(const item of filtered){
   if(!Object.hasOwn(FOLLOWUP_STATES,String(item.status||'')))continue;
   const box=element('article','audit-gsc-followup-card');
   const name=element('div','audit-gsc-followup-title');
   const link=element('a',null,item.title),safe=safeUrl(item.path);
   if(safe)link.href=safe;
   name.append(link,element('span','audit-gsc-followup-state',item.label));
   box.append(name,element('p','audit-muted','Inspección manual: '+niceDate(item.checkedAt)));
   if(item.changed===true&&Object.hasOwn(FOLLOWUP_STATES,String(item.previousStatus||'')))
    box.append(element('p','audit-gsc-change','Cambio desde: '+FOLLOWUP_STATES[item.previousStatus]));
   else if(item.previousStatus)
    box.append(element('p','audit-muted','Sin cambio respecto a la inspección manual anterior.'));
   if(typeof item.coverageState==='string'&&item.coverageState)
    box.append(element('p','audit-muted','Google informa: '+item.coverageState));
   if(typeof item.advice==='string')
    box.append(element('p','audit-gsc-advice',item.advice));
   if(gscReady&&/^[1-9][0-9]{0,15}$/.test(String(item.id||''))){
    const inspectButton=element('button','audit-gsc-pick','Preparar nueva inspección');
    inspectButton.type='button';
    inspectButton.addEventListener('click',()=>{
     gscId.value=String(item.id);
     gscAction.textContent='Producto '+String(item.id)+' preparado. Para consumir una consulta, pulsa Inspeccionar en Google arriba.';
    });
    box.append(inspectButton);
   }
   followupEntries.append(box);
  }
  if(!filtered.length)
   followupEntries.append(element('p','audit-muted','No hay inspecciones manuales guardadas con este estado entre los productos visibles.'));
  followupStatus.textContent='Mostrando '+number(filtered.length)+' de '+number(source.length)+' productos consultados. Historial local del servidor, sin nuevas consultas a Google.';
 }
 function renderFollowup(data){
  clear(followupCounts);
  savedFollowup=data;
  if(data?.source!=='stored_manual_search_console_inspections'||!Array.isArray(data.products))
   throw Error('Formato del seguimiento no reconocido.');
  card(followupCounts,data.products.length,'Productos consultados','Solo los que tienen inspecciones manuales guardadas');
  for(const [code,label] of Object.entries(FOLLOWUP_STATES))
   if(Number(data.counts?.[code])>0)
    card(followupCounts,data.counts[code],label);
  renderFollowupRows();
 }
 followupFilter.addEventListener('change',renderFollowupRows);
 followupLoad.addEventListener('click',async()=>{
  followupLoad.disabled=true;
  followupStatus.textContent='Cargando inspecciones ya guardadas, sin contactar con Google…';
  try{
   const resp=await fetch('/api/admin/marketplace/seo/gsc/seguimiento',{
    method:'GET',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}
   });
   if(resp.status===401||resp.status===403)
    throw Error('Debes iniciar sesión como administrador.');
   if(!resp.ok)throw Error('El historial no está disponible ahora. Vuelve a intentarlo.');
   const data=await resp.json();
   if(data?.ok!==true)throw Error('La respuesta del historial no es válida.');
   renderFollowup(data);
  }catch(e){followupStatus.textContent=e?.message||'No se pudo consultar el seguimiento.';}
  finally{followupLoad.disabled=false;}
 });
 gscButton.addEventListener('click',async()=>{
  const id=String(gscId.value||'').trim();
  if(!gscReady||!/^[1-9][0-9]{0,15}$/.test(id)){
   gscAction.textContent='Introduce un identificador válido de anuncio público.';
   return;
  }
  gscButton.disabled=true;
  gscResult.hidden=true;
  clear(gscFields);
  gscInterpretation.hidden=true;
  clear(gscInterpretation);
  gscAction.textContent='Consultando el índice de Google para el anuncio '+id+'…';
  try{
   const response=await fetch('/api/admin/marketplace/seo/gsc/inspeccionar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Accept':'application/json','Content-Type':'application/json'},
    body:JSON.stringify({id})
   });
   if(response.status===401||response.status===403&&response.headers?.get?.('content-type')?.includes('text/html'))
    throw new Error('Necesitas iniciar sesión como administrador.');
   const data=await response.json();
   if(!response.ok)throw new Error(googleErrors[data?.error]||'La inspección no ha podido completarse.');
   if(data?.ok!==true||data?.inspection?.source!=='google_search_console_url_inspection')
    throw new Error('La respuesta de Google no tiene el formato esperado.');
   renderGscInspection(data.inspection);
   renderInspectionInterpretation(data.followup,data.followupSaved===true);
   gscAction.textContent='Inspección manual finalizada. El resultado procede de Google Search Console.';
   removeReviewAfterInspection(id);
  }catch(error){
   gscAction.textContent=error?.message||'No se pudo realizar la inspección.';
  }finally{gscButton.disabled=!gscReady;}
 });
 // V3.2.126: a catalogue of PUBLIC sale products not manually inspected
 // within the retained 90-day window. Reading this list never calls Google.
 const pendingSearch=$('auditPendingSearch'),pendingLoad=$('auditPendingLoad'),
  pendingStatus=$('auditPendingStatus'),pendingCounts=$('auditPendingCounts'),
  pendingItems=$('auditPendingItems'),pendingPagination=$('auditPendingPagination'),
  pendingPrevious=$('auditPendingPrevious'),pendingNext=$('auditPendingNext'),
  pendingOrderSelect=$('auditPendingOrder'),
  pendingPageText=$('auditPendingPage');
 // V3.2.128: temporary, memory-only selection of public product cards.
 // This is NOT an inspection queue on the server and never calls Google.
 const queueCount=$('auditQueueCount'),queueStatus=$('auditQueueStatus'),
  queueItems=$('auditQueueItems'),queuePrepare=$('auditQueuePrepare'),
  queueClear=$('auditQueueClear');
 const MAX_REVIEW_QUEUE=6;
 const reviewQueue=[];
 let lastPendingData=null;
 let pendingPage=1,pendingTerm='',pendingOrder='priority',pendingLoading=false;
 function safeReviewProduct(item){
  const id=String(item?.id||''),title=String(item?.title||'').trim().slice(0,120);
  const path=safeUrl(item?.path);
  if(!/^[1-9][0-9]{0,15}$/.test(id)||!title||
   !path||!path.startsWith('/marketplace/p/'+id+'/'))return null;
  return {id,title,path};
 }
 function prepareReview(id){
  if(!/^[1-9][0-9]{0,15}$/.test(String(id||'')))return;
  gscId.value=String(id);
  gscAction.textContent='Producto '+String(id)+' preparado. La inspección solo comienza si pulsas «Inspeccionar en Google».';
  if(typeof gscId.focus==='function')gscId.focus();
 }
 function renderReviewQueue(message){
  clear(queueItems);
  queueCount.textContent=number(reviewQueue.length)+'/'+MAX_REVIEW_QUEUE;
  queuePrepare.disabled=!reviewQueue.length||!gscReady;
  queueClear.disabled=!reviewQueue.length;
  for(const item of reviewQueue){
   const entry=element('div','audit-queue-item');
   const link=element('a',null,item.title);
   link.href=item.path;
   const remove=element('button','audit-queue-remove','Quitar');
   remove.type='button';
   remove.addEventListener('click',()=>{
    const pos=reviewQueue.findIndex(x=>x.id===item.id);
    if(pos>=0)reviewQueue.splice(pos,1);
    renderReviewQueue('Producto retirado de tu lista.');
    if(lastPendingData)renderPending(lastPendingData);
   });
   entry.append(link,remove);
   queueItems.append(entry);
  }
  queueStatus.textContent=typeof message==='string'?message:
   reviewQueue.length
    ?number(reviewQueue.length)+' seleccionados para revisar, sin consultas a Google.'
    :'La lista está vacía.';
 }
 function addReviewProduct(item){
  const candidate=safeReviewProduct(item);
  if(!candidate)return;
  if(reviewQueue.some(x=>x.id===candidate.id)){
   renderReviewQueue('Este producto ya está en tu lista.');
   return;
  }
  if(reviewQueue.length>=MAX_REVIEW_QUEUE){
   renderReviewQueue('Límite de seis productos por lista. Retira uno antes de añadir otro.');
   return;
  }
  reviewQueue.push(candidate);
  renderReviewQueue('Producto añadido. La selección no consume cuota de Google.');
  if(lastPendingData)renderPending(lastPendingData);
 }
 function removeReviewAfterInspection(id){
  const index=reviewQueue.findIndex(x=>x.id===String(id));
  if(index<0)return;
  reviewQueue.splice(index,1);
  renderReviewQueue('Inspección manual completada; producto retirado de la lista. Actualiza los pendientes para renovar el catálogo.');
  if(lastPendingData)renderPending(lastPendingData);
 }
 queuePrepare.addEventListener('click',()=>{
  if(!gscReady||!reviewQueue.length)return;
  prepareReview(reviewQueue[0].id);
  queueStatus.textContent='Primer producto preparado en el formulario de Google. Aún no se ha realizado ninguna inspección.';
 });
 queueClear.addEventListener('click',()=>{
  reviewQueue.splice(0,reviewQueue.length);
  renderReviewQueue('Lista vaciada; no se ha contactado con Google.');
  if(lastPendingData)renderPending(lastPendingData);
 });
 renderReviewQueue();
 function renderPending(data){
  if(data?.source!=='public_products_without_recent_saved_manual_inspection'||
   !Array.isArray(data.products))throw Error('Formato del listado no reconocido.');
  lastPendingData=data;
  clear(pendingCounts);clear(pendingItems);
  card(pendingCounts,data.totalPublicSaleProducts,'Productos públicos en venta','Dentro del filtro de búsqueda actual');
  card(pendingCounts,data.withoutRecentInspection,'Sin inspección manual reciente','No significa que Google desconozca el producto');
  card(pendingCounts,data.inspectedInWindow,'Con inspección guardada en 90 días','No confirma que estén indexados');
  for(const item of data.products){
   const entry=element('article','audit-gsc-followup-card');
   const top=element('div','audit-gsc-followup-title');
   const link=element('a',null,item.title||'Producto público');
   const uri=safeUrl(item.path);
   if(uri)link.href=uri;
   top.append(link);
   entry.append(top);
   if(data.order==='priority'&&item.reviewPriority){
    const quality=item.reviewPriority;
    if(typeof quality.label==='string'&&typeof quality.code==='string'&&
     ['review_first','ready_recent','improve_card'].includes(quality.code)){
     const qualityBox=element('div','audit-pending-priority audit-pending-priority-'+quality.code);
     qualityBox.append(element('strong',null,quality.label));
     // One concise label for ready cards; detail only on actual gaps.
     if(quality.code==='improve_card'&&Array.isArray(quality.attention)&&quality.attention.length){
      qualityBox.append(element('p','audit-muted','Antes de inspeccionar: '+
       quality.attention.filter(x=>typeof x==='string').slice(0,4).join(' · ')));
     }
     entry.append(qualityBox);
    }
   }
   if(typeof item.category==='string'&&item.category)
    entry.append(element('p','audit-muted','Categoría: '+item.category));
   if(typeof item.updatedAt==='string')
    entry.append(element('p','audit-muted','Anuncio actualizado: '+niceDate(item.updatedAt)));
   const candidate=safeReviewProduct(item);
   if(candidate){
    const actions=element('div','audit-pending-actions');
    const selected=reviewQueue.some(x=>x.id===candidate.id);
    const add=element('button','audit-pending-add',selected?'En mi lista':'Añadir a revisión');
    add.type='button';
    add.disabled=selected||reviewQueue.length>=MAX_REVIEW_QUEUE;
    add.addEventListener('click',()=>addReviewProduct(item));
    actions.append(add);
    if(gscReady){
     const prep=element('button','audit-gsc-pick','Preparar inspección individual');
     prep.type='button';
     prep.addEventListener('click',()=>prepareReview(item.id));
     actions.append(prep);
    }
    entry.append(actions);
   }
   pendingItems.append(entry);
  }
  if(!data.products.length)pendingItems.append(
   element('p','audit-muted','No hay productos pendientes en esta página y búsqueda. Consulta otro filtro o vuelve a la primera página.'));
  pendingPagination.hidden=!(data.hasPrevious||data.hasNext);
  pendingPrevious.disabled=!data.hasPrevious;
  pendingNext.disabled=!data.hasNext;
  pendingPageText.textContent='Página '+number(data.page);
  pendingStatus.textContent=number(data.products.length)+' en esta página · '+
   number(data.withoutRecentInspection)+' sin inspección manual reciente · '+
   (data.order==='priority'?'Prioridad editorial':'Últimas actualizaciones')+
   '. No indica indexación de Google.';
  pendingPage=data.page;
 }
 async function loadPending(page,search,order=pendingOrder){
  if(pendingLoading)return;
  pendingLoading=true;
  pendingLoad.disabled=true;pendingNext.disabled=true;pendingPrevious.disabled=true;
  pendingStatus.textContent='Consultando catálogo público e historial local, sin contactar con Google…';
  try{
   const query='?pagina='+encodeURIComponent(String(page))+'&q='+encodeURIComponent(search)+'&orden='+encodeURIComponent(order);
   const response=await fetch('/api/admin/marketplace/seo/gsc/pendientes'+query,{
    method:'GET',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}
   });
   if(response.status===401||response.status===403)
    throw Error('Inicia sesión como administrador para consultar productos pendientes.');
   if(!response.ok)throw Error('No se pudo obtener el listado. Inténtalo de nuevo.');
   const data=await response.json();
   if(data?.ok!==true)throw Error('Respuesta inesperada del listado.');
   pendingTerm=search;
   pendingOrder=order;
   renderPending(data);
  }catch(error){
   pendingStatus.textContent=error?.message||'Error consultando los productos pendientes.';
   pendingNext.disabled=false;pendingPrevious.disabled=false;
  }finally{pendingLoading=false;pendingLoad.disabled=false;}
 }
 pendingLoad.addEventListener('click',()=>{
  const term=String(pendingSearch.value||'').trim().slice(0,70);
  return loadPending(1,term,pendingOrderSelect.value);
 });
 pendingPrevious.addEventListener('click',()=>{
  if(pendingPage>1)return loadPending(pendingPage-1,pendingTerm,pendingOrder);
 });
 pendingNext.addEventListener('click',()=>{
  if(pendingPage<250)return loadPending(pendingPage+1,pendingTerm,pendingOrder);
 });
 pendingSearch.addEventListener('keydown',event=>{
  if(event?.key==='Enter'){
   if(typeof event.preventDefault==='function')event.preventDefault();
   const term=String(pendingSearch.value||'').trim().slice(0,70);
   return loadPending(1,term,pendingOrderSelect.value);
  }
 });
 // V3.2.124: nonblocking, read-only Merchant warnings from the bounded
 // PUBLIC sample, not scraped policies or real Google Search Console results.
 function renderMerchantAdvice(data){
  const metrics=$('auditMerchantSamples'),guidance=$('auditMerchantGuidance');
  clear(metrics);clear(guidance);
  if(data?.source!=='recent_public_product_sale_sample'){
   guidance.append(element('p','audit-muted','No hay diagnóstico de productos en esta muestra.'));
   return;
  }
  card(metrics,data.productsReviewed,'Productos en venta revisados','Solo anuncios públicos de la muestra reciente, máximo 100');
  card(metrics,data.withoutAnyDeclaredBrandOrIdentifier,'Sin marca ni identificador declarado','No implica que el producto deba tener GTIN o marca');
  card(metrics,data.withValidGtin,'Con GTIN válido declarado','Únicamente códigos realmente indicados');
  card(metrics,data.withBrand,'Con marca declarada','Una marca no se infiere del título o diseño');
  for(const note of [data.note,data.identifiers,data.shipping,data.returns]){
   if(typeof note==='string'&&note.length<=500)
    guidance.append(element('p','audit-muted',note));
  }
 }
 function renderAudit(data){
  const summary=$('auditMetrics'),checks=$('auditChecks'),optional=$('auditOptional'),
   categories=$('auditCategories'),examples=$('auditExamples');
  [summary,checks,optional,categories,examples].forEach(clear);
  card(summary,data.totals.publicListings,'Anuncios públicos','Activos, publicados y de vendedores visibles');
  card(summary,data.totals.products,'Productos');
  card(summary,data.totals.services,'Servicios');
  card(summary,data.totals.properties,'Inmuebles');
  for(const check of data.checks){
   const box=element('div','audit-check');
   box.append(element('strong','audit-check-number',number(check.count)),element('span','audit-check-name',check.name));
   box.append(element('small','audit-muted',check.note));
   checks.append(box);
  }
  // Missing new/used condition (common in WooCommerce CSV) is information,
  // not an SEO issue and must never appear as a per-listing warning.
  for(const item of data.informational||[]){
   const box=element('div','audit-optional-card');
   box.append(element('strong','audit-optional-number',number(item.count)),
    element('span','audit-optional-name',item.name));
   box.append(element('small','audit-muted',item.note));
   optional.append(box);
  }
  for(const category of data.categories){
   const row=element('div','audit-category');
   const body=element('div','audit-category-text');
   const link=element('a',null,category.name);
   const uri=safeUrl(category.url);
   if(uri)link.href=uri;
   body.append(link,element('small','audit-muted',number(category.listings)+' anuncios públicos'));
   row.append(body,element('span',category.indexable?'audit-category-ready':'audit-category-waiting',
    category.indexable?'Apta para sitemap':'Inventario insuficiente'));
   categories.append(row);
  }
  const sample=data.limits.recentSample;
  $('auditExamplesDescription').textContent='Se revisan los '+number(sample)+' anuncios públicos más recientes (máximo 100). Los avisos se ordenan dentro de esa muestra: fotos primero, luego nombres/categorías y después descripciones. No es una clasificación de Google ni incluye necesariamente todos los anuncios.';
  renderSitemaps(data);
  renderMerchantAdvice(data.merchantStructuredAdvice);
  renderGscStatus(data.googleSearchConsole);
  currentLabels=data.issueLabels||Object.create(null);
  exampleRows=Array.isArray(data.examples)?data.examples:[];
  visibleExamples=PAGE_SIZE;
  exampleFilter.value='todos';
  renderExamples();
  results.hidden=false;
 }
 async function refresh(){
  button.disabled=true;
  status.textContent='Consultando anuncios públicos…';
  try{
   const response=await fetch('/api/admin/marketplace/seo/auditoria',{
    method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'},cache:'no-store'
   });
   if(response.status===401||response.status===403)throw new Error('Inicia sesión como administrador para acceder a la auditoría.');
   if(!response.ok)throw new Error('No se pudo consultar la auditoría. Prueba de nuevo.');
   const data=await response.json();
   if(data?.ok!==true||data?.mode!=='preparacion_tecnica')throw new Error('Respuesta de auditoría inesperada.');
   renderAudit(data);
   const formatted=new Date(data.generatedAt).toLocaleString('es-ES');
   status.textContent='Diagnóstico de solo lectura actualizado: '+formatted+'. No incluye datos reales de indexación de Google.';
  }catch(error){
   status.textContent=error?.message||'No se pudo cargar la auditoría.';
  }finally{button.disabled=false;}
 }
 button.addEventListener('click',refresh);
 refresh();
})();
