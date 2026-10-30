'use strict';
// V3.5.30 — sitemap dinámico: sin URLs desautorizadas ni cifras estimadas.
const service=require('../services/resuelve-v350');
const ORIGIN='https://redlibertad.com';
function xmlText(text){
 return String(text??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
 })[c]);
}
function xmlSitemap(items){
 const links=items.filter(item=>service.validId(item.id)).map(item=>{
  const url=ORIGIN+'/resuelve/solucion/'+encodeURIComponent(String(item.id));
  const stamp=new Date(item.lastmod);
  const lastmod=Number.isNaN(stamp.getTime())?'':'<lastmod>'+stamp.toISOString().slice(0,10)+'</lastmod>';
  return '<url><loc>'+xmlText(url)+'</loc>'+lastmod+'</url>';
 }).join('');
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+links+'</urlset>';
}
async function resuelveSitemapHandler(req,res){
 res.set('Cache-Control','no-store');
 res.set('X-Robots-Tag','noindex');
 try{
  const items=await service.sitemapSeoSolutions();
  res.type('application/xml').send(xmlSitemap(items));
 }catch(error){
  console.error('Resuelve sitemap unavailable:',error?.code||error?.message||'error');
  res.status(503).type('text/plain').send('Sitemap no disponible temporalmente.');
 }
}
module.exports={xmlText,xmlSitemap,resuelveSitemapHandler};
