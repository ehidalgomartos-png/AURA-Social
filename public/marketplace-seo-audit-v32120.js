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
