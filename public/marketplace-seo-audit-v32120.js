'use strict';
// Private admin dashboard UI: all API text goes through textContent, not HTML.
(function(){
 const $=id=>document.getElementById(id);
 const status=$('auditStatus'),results=$('auditResults'),button=$('auditRefresh');
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
  $('auditExamplesDescription').textContent='Muestra de los '+number(sample)+' anuncios públicos más recientes. Los avisos mostrados aquí no representan necesariamente todos los casos.';
  if(!data.examples.length){
   examples.append(element('p','audit-muted','No se han encontrado avisos en la muestra revisada.'));
  }else{
   for(const item of data.examples){
    const row=element('div','audit-example'),top=element('div','audit-example-head');
    const link=element('a',null,item.title);
    const uri=safeUrl(item.url);
    if(uri)link.href=uri;
    top.append(link,element('small','audit-muted',item.category||'Sin categoría'));
    const tags=element('div','audit-tags');
    for(const key of item.issues)tags.append(element('span','audit-tag',data.issueLabels?.[key]||key));
    row.append(top,tags);
    examples.append(row);
   }
  }
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
