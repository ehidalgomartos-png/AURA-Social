'use strict';
// V3.5.31 — páginas reales por temas. Ninguna página vacía se indexa.
const express=require('express');
const topics=require('../services/resuelve-topics-v3531');
const {escapeHtml}=require('./resuelve-public-seo-v3529');
const {xmlText}=require('./resuelve-sitemap-v3530');
const ORIGIN='https://redlibertad.com';
const router=express.Router();
const topicApiRouter=express.Router();
function renderTopicPage(topic,items,count,allCounts={}){
 if(!topics.validTopic(topic)||!Array.isArray(items))throw Error('tema_invalido');
 const info=topics.TOPICS[topic];
 const indexable=count>=3&&items.length>=3;
 const canonical=ORIGIN+'/resuelve/temas/'+encodeURIComponent(topic);
 const title=info.title+' — Consejos y soluciones reales | Resuelve';
 const description=info.description+' Soluciones revisadas y autorizadas por quienes pidieron ayuda.';
 const entries=items.map(item=>{
  const id=String(item.id||'');
  if(!/^[1-9]\d{0,15}$/.test(id))return '';
  const text=String(item.solution||'').trim();
  const excerpt=text.length>190?text.slice(0,187).trimEnd()+'…':text;
  return '<li class="resuelve-topic-item"><h2><a href="/resuelve/solucion/'+encodeURIComponent(id)+'">'+
   escapeHtml(item.title)+'</a></h2><p>'+escapeHtml(excerpt)+'</p></li>';
 }).join('');
 const meta=indexable?{
  '@context':'https://schema.org','@type':'CollectionPage',name:title,description,
  inLanguage:'es',url:canonical
 }:null;
 const structured=meta?'<script type="application/ld+json">'+JSON.stringify(meta).replace(/</g,'\\u003c')+'</script>':'';
 // V3.6.5 — promover solo temas que ya tengan al menos 3 soluciones públicas.
 const otherTopics=Object.entries(topics.TOPICS)
  .filter(([slug])=>slug!==topic&&Number(allCounts[slug])>=3);
 const otherLinks=otherTopics.length?
  '<nav class="resuelve-seo-related" aria-label="Otros temas con soluciones">'+
  '<h2>Otros temas donde encontrar ayuda</h2><ul>'+
  otherTopics.map(([slug,value])=>
   '<li><a href="/resuelve/temas/'+encodeURIComponent(slug)+'">'+escapeHtml(value.title)+'</a></li>').join('')+
  '</ul></nav>':'';
 const breadcrumb='<nav class="resuelve-seo-breadcrumbs" aria-label="Ruta de navegación">'+
  '<a href="/resuelve/como-funciona">Resuelve</a> <span aria-hidden="true">›</span> '+
  '<span aria-current="page">'+escapeHtml(info.title)+'</span></nav>';

 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+escapeHtml(title)+'</title>'+
  '<meta name="description" content="'+escapeHtml(description)+'">'+
  '<meta name="robots" content="'+(indexable?'index,follow':'noindex,follow')+'">'+
  '<link rel="canonical" href="'+escapeHtml(canonical)+'">'+
  '<meta property="og:type" content="website">'+
  '<meta property="og:title" content="'+escapeHtml(title)+'">'+
  '<meta property="og:description" content="'+escapeHtml(description)+'">'+
  '<meta property="og:url" content="'+escapeHtml(canonical)+'">'+structured+
  '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'+
  '<link rel="stylesheet" href="/resuelve-v350.css"></head><body>'+
  '<a class="skip" href="#main">Saltar al contenido</a>'+
  '<header class="topbar"><a class="brand" href="/resuelve"><strong>RedLibertad Resuelve</strong></a>'+
  '<nav aria-label="Navegación"><a href="/resuelve#solutions">Biblioteca de ayuda</a></nav></header>'+
  '<main id="main" class="wrap"><section class="resuelve-seo-solution resuelve-topic-page">'+breadcrumb+
  '<p class="eyebrow dark">PERSONAS QUE AYUDAN A PERSONAS</p><h1>'+escapeHtml(info.title)+'</h1>'+
  '<p>'+escapeHtml(info.description)+'</p>'+
  '<p class="muted">Estas soluciones fueron elegidas por quienes preguntaron, revisadas antes de publicarse y autorizadas para aparecer en páginas públicas. Nadie tiene que comprar nada para recibir ayuda.</p>'+
  (items.length?'<h2>Soluciones compartidas</h2><ol class="resuelve-topic-list">'+entries+'</ol>':
  '<p>De momento no hay soluciones publicadas de este tema. Puedes compartir una pregunta o ayudar a otra persona.</p>')+
  '<p class="muted">Los consejos compartidos no sustituyen asesoramiento profesional cuando sea necesario.</p>'+otherLinks+
  '<a class="primary resuelve-topic-cta" href="/resuelve">Pedir ayuda o compartir experiencia</a>'+
  '</section></main><footer class="foot">Resuelve · Personas que ayudan a personas</footer></body></html>';
}
router.get('/temas/:topic',async(req,res)=>{
 res.set('Cache-Control','no-store');
 res.set('X-Robots-Tag','noindex,follow');
 const topic=String(req.params.topic||'');
 if(!topics.validTopic(topic))return res.status(404).type('text/plain').send('Tema no disponible.');
 try{
  const [items,counts]=await Promise.all([topics.publishedTopic(topic),topics.topicSummary()]);
  if(!items.length)return res.status(404).type('text/plain').send('Todavía no hay soluciones públicas de este tema.');
  const indexable=items.length>=3&&counts[topic]>=3;
  res.set('X-Robots-Tag',indexable?'index,follow':'noindex,follow');
  res.type('html').send(renderTopicPage(topic,items,counts[topic],counts));
 }catch(error){
  console.error('Resuelve topics temporarily unavailable:',error?.code||error?.message||'error');
  res.status(503).type('text/plain').send('Las soluciones no están disponibles temporalmente.');
 }
});
topicApiRouter.get('/summary',async(_req,res)=>{
 res.set('Cache-Control','no-store');
 try{
  const counts=await topics.topicSummary();
  res.json({ok:true,counts});
 }catch(_){res.status(503).json({error:'temas_no_disponibles'});}
});
function xmlTopicsSitemap(counts){
 const urls=Object.keys(topics.TOPICS).filter(topic=>Number(counts?.[topic])>=3)
  .map(topic=>'<url><loc>'+xmlText(ORIGIN+'/resuelve/temas/'+topic)+'</loc></url>').join('');
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>';
}
async function topicsSitemapHandler(_req,res){
 res.set('Cache-Control','no-store');
 res.set('X-Robots-Tag','noindex');
 try{res.type('application/xml').send(xmlTopicsSitemap(await topics.topicSummary()));}
 catch(_){res.status(503).type('text/plain').send('Sitemap no disponible temporalmente.');}
}
module.exports={router,topicApiRouter,topicsSitemapHandler,xmlTopicsSitemap,renderTopicPage};
