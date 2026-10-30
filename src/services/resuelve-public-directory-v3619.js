'use strict';
// V3.6.19: enlaces HTML rastreables solo a temas con suficientes soluciones consentidas.
// Los conteos proceden del mismo filtro de autorización y revisión de Resuelve.
const fs=require('node:fs/promises');
const path=require('node:path');
const topics=require('./resuelve-topics-v3531');
const templatePath=path.join(__dirname,'..','..','public','resuelve-como-funciona-v3533.html');
const MARKER='<!-- RESUELVE_PUBLIC_TOPICS_V3619 -->';
// V3.6.20 — límites de espera y texto escapado para evitar bloqueos y HTML inyectado.
function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[ch]);
}
async function countsWithinBudget(getCounts,budgetMs=1800){
 const limit=Number.isInteger(budgetMs)&&budgetMs>=10&&budgetMs<=6000?budgetMs:1800;
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(getCounts),
   new Promise(resolve=>{
    timer=setTimeout(()=>resolve({}),limit);
   })
  ]);
 }finally{
  if(timer)clearTimeout(timer);
 }
}


function renderPublicTopicLinks(counts={}){
 const eligible=Object.entries(topics.TOPICS).filter(([slug])=>{
  const n=counts?.[slug];
  return typeof n==='number'&&Number.isSafeInteger(n)&&n>=3;
 });
 if(!eligible.length)return '';
 const links=eligible.map(([slug,info])=>
  '<li><a href="/resuelve/temas/'+encodeURIComponent(slug)+'">'+
  escapeHtml(info.title)+'</a><span>'+escapeHtml(info.description)+'</span></li>').join('');
 return '<section class="resuelve-about-section resuelve-public-topics-v3619" '+
  'aria-labelledby="publicTopicsTitleV3619">'+
  '<p class="eyebrow dark">SOLUCIONES REVISADAS Y AUTORIZADAS</p>'+
  '<h2 id="publicTopicsTitleV3619">Explora soluciones reales por temas</h2>'+
  '<p>Solo aparecen temas que ya cuentan con suficientes respuestas elegidas por quienes '+
  'pidieron ayuda, revisadas y autorizadas para su publicación. Nadie tiene que comprar nada.</p>'+
  '<ul class="resuelve-public-topics-list-v3619">'+links+'</ul>'+
  '</section>';
}
function renderAboutWithTopics(template,counts={}){
 if(typeof template!=='string'||!template.includes(MARKER))
  throw Error('invalid_resuelve_public_template');
 return template.replace(MARKER,renderPublicTopicLinks(counts));
}
function createResuelveAboutHandler({
 readTemplate,
 getCounts=topics.topicSummary,
 countWaitMs=1800
}={}){
 // La plantilla editorial es inmutable entre despliegues; los consentimientos no se cachean.
 let templatePromise=null;
 const loadTemplate=readTemplate||(()=>{
  if(!templatePromise){
   templatePromise=fs.readFile(templatePath,'utf8').catch(error=>{
    templatePromise=null;
    throw error;
   });
  }
  return templatePromise;
 });
 return async(_req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Robots-Tag','index,follow');
  let html;
  try{
   html=await loadTemplate();
  }catch(_error){
   return res.status(503).type('text/plain').send('Presentación temporalmente no disponible.');
  }
  let counts={};
  try{
   counts=await countsWithinBudget(getCounts,countWaitMs);
  }catch(_error){
   // La presentación editorial sigue disponible sin inferir temas publicados.
   // Nunca presentar como revisado un tema que no se pudo comprobar.
   counts={};
  }
  try{
   return res.type('html').send(renderAboutWithTopics(html,counts));
  }catch(_error){
   return res.status(503).type('text/plain').send('Presentación temporalmente no disponible.');
  }
 };
}
module.exports={MARKER,escapeHtml,countsWithinBudget,renderPublicTopicLinks,renderAboutWithTopics,createResuelveAboutHandler};
