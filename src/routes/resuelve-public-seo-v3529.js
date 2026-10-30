'use strict';
// V3.5.29 — página HTML rastreable solo con consentimiento explícito y aprobación editorial.
const express=require('express');
const service=require('../services/resuelve-v350');
const topics=require('../services/resuelve-topics-v3531');
const router=express.Router();
const CANONICAL_ORIGIN='https://redlibertad.com';
const CATEGORY_LABELS={consejo:'Consejos',busco:'Orientación',ayuda:'Ayuda',experiencia:'Experiencias'};
function escapeHtml(text){
 return String(text??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[ch]);
}
function renderApprovedSolution(item,navigation={}){
 const id=String(item.id);
 if(!service.validId(id))throw Error('invalid_id');
 const title=String(item.title||'Solución útil').trim().slice(0,125);
 const text=String(item.solution||'').trim();
 const label=CATEGORY_LABELS[item.category]||'Ayuda';
 const canonical=CANONICAL_ORIGIN+'/resuelve/solucion/'+encodeURIComponent(id);
 const excerpt=(text.length>170?text.slice(0,167).trimEnd()+'…':text);
 const pageTitle=title+' — Solución revisada | Resuelve';
 const description='Consejo revisado sobre '+title+'. '+excerpt;
 // V3.6.5: la página temática se enlaza solo si contiene al menos tres
 // soluciones realmente públicas y revisadas. Nunca enlazar material pendiente.
 const topic=topics.validTopic(item.topic)?item.topic:null;
 const topicIndexable=!!topic&&Number(navigation.topicCount)>=3;
 const topicName=topicIndexable?topics.TOPICS[topic].title:null;
 const topicHref=topicIndexable?'/resuelve/temas/'+encodeURIComponent(topic):null;
 const related=Array.isArray(navigation.related)?navigation.related
  .filter(row=>row&&service.validId(row.id)&&String(row.id)!==id).slice(0,3):[];
 const relatedList=related.map(row=>
  '<li><a href="/resuelve/solucion/'+encodeURIComponent(String(row.id))+'">'+
   escapeHtml(String(row.title||'Solución revisada').slice(0,125))+'</a></li>').join('');
 const relatedSection=(topicHref||relatedList)?
  '<section class="resuelve-seo-related" aria-label="Más soluciones útiles">'+
  '<h2>Más soluciones útiles</h2>'+
  (relatedList?'<ul>'+relatedList+'</ul>':'')+
  (topicHref?'<a class="secondary" href="'+topicHref+'">Explorar '+escapeHtml(topicName)+'</a>':'')+
  '</section>':'';
 const crumbs=[{name:'Cómo funciona Resuelve',item:CANONICAL_ORIGIN+'/resuelve/como-funciona'}];
 if(topicHref)crumbs.push({name:topicName,item:CANONICAL_ORIGIN+topicHref});
 crumbs.push({name:title,item:canonical});
 const breadcrumb={
  '@context':'https://schema.org','@type':'BreadcrumbList',
  itemListElement:crumbs.map((crumb,index)=>({
   '@type':'ListItem',position:index+1,name:crumb.name,item:crumb.item
  }))
 };
 const breadcrumbJson=JSON.stringify(breadcrumb).replace(/</g,'\\u003c');
 const breadcrumbNav='<nav class="resuelve-seo-breadcrumbs" aria-label="Ruta de navegación">'+
  '<a href="/resuelve/como-funciona">Resuelve</a>'+
  (topicHref?' <span aria-hidden="true">›</span> <a href="'+topicHref+'">'+escapeHtml(topicName)+'</a>':'')+
  ' <span aria-hidden="true">›</span> <span aria-current="page">'+escapeHtml(title)+'</span></nav>';

 const structured={
  '@context':'https://schema.org','@type':'Article',
  headline:title,description:excerpt,inLanguage:'es',
  mainEntityOfPage:canonical,
  publisher:{'@type':'Organization',name:'RedLibertad'}
 };
 // Nunca cerrar un script JSON-LD a través de texto facilitado por otra persona.
 const jsonLd=JSON.stringify(structured).replace(/</g,'\\u003c');
 return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description.slice(0,240))}">
<meta name="robots" content="index,follow">
<script type="application/ld+json">${jsonLd}</script>
<script type="application/ld+json">${breadcrumbJson}</script>
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="RedLibertad Resuelve">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(description.slice(0,240))}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${CANONICAL_ORIGIN}/assets/og-redlibertad-v1922.jpg">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/resuelve-v350.css">
</head><body>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="topbar"><a class="brand" href="/resuelve"><strong>RedLibertad Resuelve</strong></a><nav aria-label="Navegación"><a href="/resuelve">Explorar ayuda</a></nav></header>
<main id="main" class="wrap">
<article class="resuelve-seo-solution">
${breadcrumbNav}
<p class="eyebrow dark">SOLUCIÓN REVISADA · ${escapeHtml(label)}</p>
<h1>${escapeHtml(title)}</h1>
<p class="muted">Una persona pidió ayuda, eligió una respuesta y esta solución fue revisada antes de publicarse. No necesitas comprar ni contratar nada para beneficiarte de ella.</p>
<h2>Orientación compartida</h2>
<p class="resuelve-seo-solution-body">${escapeHtml(text)}</p>
<p class="muted">Se comparte con autorización del autor de la petición. La información procede de experiencias de otras personas y no sustituye asesoramiento profesional cuando sea necesario.</p>
${relatedSection}
<div class="resuelve-seo-actions">
<a class="secondary" href="/resuelve?id=${encodeURIComponent(id)}">Ver la petición y su contexto</a>
<a class="primary" href="/resuelve">Pedir ayuda o ayudar a alguien</a>
</div>
</article></main>
<footer class="foot">Resuelve · Personas que ayudan a personas</footer>
</body></html>`;
}
// V3.5.32: vista previa para compartir una pregunta, siempre NOINDEX.
function renderQuestionSharePreview(question){
 const id=String(question.id);
 if(!service.validId(id))throw Error('id_invalido');
 const title=String(question.title||'Petición de ayuda').slice(0,125);
 const url=CANONICAL_ORIGIN+'/resuelve/pregunta/'+encodeURIComponent(id);
 const desc='¿Puedes ayudar con esta pregunta? Resuelve conecta personas que necesitan orientación con quienes desean ayudar, sin obligación de comprar nada.';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+escapeHtml(title)+' | RedLibertad Resuelve</title>'+
  '<meta name="description" content="'+escapeHtml(desc)+'">'+
  '<meta name="robots" content="noindex,follow">'+
  '<link rel="canonical" href="'+escapeHtml(url)+'">'+
  '<meta property="og:type" content="website">'+
  '<meta property="og:site_name" content="RedLibertad Resuelve">'+
  '<meta property="og:title" content="'+escapeHtml(title)+'">'+
  '<meta property="og:description" content="'+escapeHtml(desc)+'">'+
  '<meta property="og:url" content="'+escapeHtml(url)+'">'+
  '<meta property="og:image" content="'+CANONICAL_ORIGIN+'/assets/og-redlibertad-v1922.jpg">'+
  '<link rel="stylesheet" href="/resuelve-v350.css"></head><body>'+
  '<a class="skip" href="#main">Saltar al contenido</a>'+
  '<header class="topbar"><a class="brand" href="/resuelve"><strong>RedLibertad Resuelve</strong></a></header>'+
  '<main id="main" class="wrap"><section class="resuelve-seo-solution">'+
  '<p class="eyebrow dark">UNA PERSONA PIDE AYUDA</p><h1>'+escapeHtml(title)+'</h1>'+
  '<p>'+escapeHtml(desc)+'</p>'+
  '<p class="muted">La pregunta es pública. No se publica aquí ninguna respuesta ni dato de contacto.</p>'+
  '<a class="primary resuelve-topic-cta" href="/resuelve?id='+encodeURIComponent(id)+'">Ver pregunta y ayudar</a>'+
  '</section></main></body></html>';
}
router.get('/pregunta/:id',async(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('X-Robots-Tag','noindex,follow');
 const id=String(req.params.id||'');
 if(!service.validId(id))return res.status(404).type('text/plain').send('Pregunta no disponible.');
 try{
  const question=await service.publicQuestionSharePreview(id);
  if(!question)return res.status(404).type('text/plain').send('Pregunta no disponible.');
  res.type('html').send(renderQuestionSharePreview(question));
 }catch(_){res.status(503).type('text/plain').send('Vista previa no disponible temporalmente.');}
});
router.get('/solucion/:id',async(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('X-Robots-Tag','noindex,nofollow');
 const id=String(req.params.id||'');
 if(!service.validId(id))return res.status(404).type('text/plain').send('Solución no disponible.');
 try{
  const item=await service.publicSeoSolution(id);
  if(!item)return res.status(404).type('text/plain').send('Solución no disponible.');
  const navigation=topics.validTopic(item.topic)?
   await topics.relatedApprovedTopicSolutions(item.topic,id):{topicCount:0,related:[]};
  res.set('X-Robots-Tag','index,follow');
  res.type('html').send(renderApprovedSolution(item,navigation));
 }catch(error){
  console.error('Resuelve SEO page not available:',error?.code||error?.message||'error');
  res.status(503).type('text/plain').send('La solución no está disponible temporalmente.');
 }
});
module.exports={router,escapeHtml,renderApprovedSolution,renderQuestionSharePreview};
