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
 let gscReady=false;
 function renderGscStatus(info){
  gscReady=info?.mode==='google_search_console_readonly'&&info?.configured===true;
  gscButton.disabled=!gscReady;
  gscState.textContent=info?.note||'Search Console todavía no está configurado para consultas reales.';
  if(!gscReady){
   gscResult.hidden=true;
   clear(gscFields);
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
 gscButton.addEventListener('click',async()=>{
  const id=String(gscId.value||'').trim();
  if(!gscReady||!/^[1-9][0-9]{0,15}$/.test(id)){
   gscAction.textContent='Introduce un identificador válido de anuncio público.';
   return;
  }
  gscButton.disabled=true;
  gscResult.hidden=true;
  clear(gscFields);
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
   gscAction.textContent='Inspección manual finalizada. El resultado procede de Google Search Console.';
  }catch(error){
   gscAction.textContent=error?.message||'No se pudo realizar la inspección.';
  }finally{gscButton.disabled=!gscReady;}
 });
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
