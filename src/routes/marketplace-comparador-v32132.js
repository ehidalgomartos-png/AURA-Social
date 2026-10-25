'use strict';
// V3.2.132 — páginas permanentes de comparaciones, sin crear URLs a partir de GET.
// El proveedor externo es optativo: sin API key solo se muestran anuncios públicos reales.
const express=require('express');
const crypto=require('node:crypto');
const rateLimit=require('express-rate-limit');
const db=require('../db');
const {ensureMarketplaceSchema}=require('./marketplace-v3250');
const seo=require('../services/marketplace-comparador-seo-v32132');
const {requireAdmin}=require('../middleware/auth');
const router=express.Router();
const ORIGIN='https://redlibertad.com';
const CACHE_MS=24*60*60*1000;
let schemaPromise;

function cleanQuery(value){
 if(typeof value!=='string')return null;
 const q=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ');
 if(q.length<3||q.length>100||/https?:\/\/|www\.|@/i.test(q)||/[<>{}]/.test(q))return null;
 if(!/[\p{L}\p{N}]/u.test(q))return null;
 return q;
}
function queryKey(q){
 return q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function slugFor(q){
 const key=queryKey(q);
 const slug=key.replace(/[^a-z0-9]+/g,'-').replace(/^-|-+$/g,'').slice(0,78).replace(/-+$/,'')||'producto';
 return slug+'-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,10);
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeHref(v){
 try{const u=new URL(String(v));return u.protocol==='https:' && !u.username && !u.password?u.href:null;}catch(_){return null;}
}
function money(cents){return (Number(cents)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});}
function escapeLike(v){return v.replace(/[\\%_]/g,'\\$&');}
function productTokens(q){return queryKey(q).split(' ').filter(v=>v.length>=2).slice(0,8);}
async function ensureSchema(){
 if(!schemaPromise){
  schemaPromise=(async()=>{
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_pages (id BIGSERIAL PRIMARY KEY, query_key VARCHAR(120) NOT NULL UNIQUE, slug VARCHAR(120) NOT NULL UNIQUE, query_text VARCHAR(100) NOT NULL, external_results JSONB NOT NULL DEFAULT '[]'::jsonb, last_checked_at TIMESTAMPTZ, provider_status VARCHAR(30) NOT NULL DEFAULT 'not_configured', index_approved BOOLEAN NOT NULL DEFAULT false, editorial_summary TEXT NOT NULL DEFAULT '', search_count BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("ALTER TABLE marketplace_compare_pages ADD COLUMN IF NOT EXISTS editorial_summary TEXT NOT NULL DEFAULT ''");
   await db.query('CREATE INDEX IF NOT EXISTS idx_marketplace_compare_created ON marketplace_compare_pages(created_at DESC)');
  })().catch(e=>{schemaPromise=null;throw e;});
 }
 return schemaPromise;
}
async function localOffers(q){
 await ensureMarketplaceSchema();
 const terms=productTokens(q);
 if(!terms.length)return [];
 const clause=terms.map((_,i)=>"l.title ILIKE $"+(i+1)+" ESCAPE '\\'").join(' AND ');
 const params=terms.map(t=>'%'+escapeLike(t)+'%');
 const rows=await db.query("SELECT l.id,l.title,l.price_cents,l.image_urls,l.details,u.display_name,u.username FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.kind='product' AND l.deal='sale' AND l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true AND "+clause+" ORDER BY l.price_cents ASC,l.id DESC LIMIT 12",params);
 return rows.rows.map(r=>({
  title:r.title,shop:'RedLibertad · '+(r.display_name||r.username),price_cents:Number(r.price_cents),
  href:'/marketplace/p/'+r.id+'/'+queryKey(r.title).replace(/[^a-z0-9]+/g,'-').slice(0,75),
  condition:r.details?.condition==='new'?'Nuevo':r.details?.condition==='used'?'Usado':'No indicado',
  image:Array.isArray(r.image_urls)&&r.image_urls.length?'/marketplace/imagen/'+r.id+'/0':null,internal:true
 }));
}
function parseExternal(results,q){
 const terms=productTokens(q),numbers=terms.filter(t=>/\d/.test(t));
 const out=[],seen=new Set();
 for(const r of (Array.isArray(results)?results:[]).slice(0,40)){
  const title=String(r.title||'').trim().slice(0,160),name=queryKey(title);
  if(!title || !terms.length || terms.filter(t=>name.includes(t)).length<Math.max(1,Math.ceil(terms.length*.7)))continue;
  if(!numbers.every(t=>name.includes(t)))continue;
  const href=safeHref(r.link||r.product_link);
  if(r.currency && !['EUR','€'].includes(String(r.currency).trim().toUpperCase()))continue;
  const amount=Number(r.extracted_price);
  if(!href||!Number.isFinite(amount)||amount<=0||amount>10000000)continue;
  const price_cents=Math.round(amount*100);
  const shop=String(r.source||'Tienda externa').trim().slice(0,90)||'Tienda externa';
  const id=shop.toLowerCase()+'|'+href;
  if(seen.has(id))continue;
  seen.add(id);
  out.push({title,shop,price_cents,href,condition:'Comprobar en tienda',internal:false});
  if(out.length>=16)break;
 }
 return out.sort((a,b)=>a.price_cents-b.price_cents);
}
// Solo una búsqueda externa por producto y 24 horas; una reserva SQL evita gastos duplicados.
async function refreshExternal(page){
 const key=String(process.env.COMPARADOR_SERPAPI_KEY||'').trim();
 if(!key)return;
 const lease=await db.query("UPDATE marketplace_compare_pages SET last_checked_at=now(),provider_status='checking' WHERE id=$1 AND (last_checked_at IS NULL OR last_checked_at < now() - interval '24 hours') RETURNING id",[page.id]);
 if(!lease.rowCount)return;
 try{
  const params=new URLSearchParams({engine:'google_shopping',q:page.query_text,hl:'es',gl:'es',api_key:key});
  const response=await fetch('https://serpapi.com/search.json?'+params,{signal:AbortSignal.timeout(9000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('provider_status_'+response.status);
  const data=await response.json();
  if(data.error)throw new Error('provider_error');
  if(!Array.isArray(data.shopping_results))throw new Error('missing_results');
  const offers=parseExternal(data.shopping_results,page.query_text);
  await db.query("UPDATE marketplace_compare_pages SET external_results=$2::jsonb,provider_status='ok',updated_at=now() WHERE id=$1",[page.id,JSON.stringify(offers)]);
 }catch(e){
  console.warn('RedLibertad comparador: external provider unavailable:',e.message);
  await db.query("UPDATE marketplace_compare_pages SET provider_status='unavailable' WHERE id=$1",[page.id]);
 }
}
function formMarkup(message='',term=''){
 return '<form class="compare-search" action="/comparar/buscar" method="post"><label for="compareQ">¿Qué producto quieres comparar?</label><div class="compare-search-row"><input id="compareQ" name="q" type="search" required minlength="3" maxlength="100" value="'+esc(term)+'" placeholder="Ej. Samsung Galaxy S26 Ultra" autocomplete="off"><button type="submit">Comparar precios</button></div>'+
 (message?'<p class="compare-error" role="alert">'+esc(message)+'</p>':'')+
 '<small>Una búsqueda crea una página permanente. Solo aparecen precios verificados por una fuente disponible y se indica la fecha de comprobación.</small></form>';
}
function shell(title,description,body,canonical,allowIndex=false,structured=null){
 const robots=allowIndex?'index,follow':'noindex,follow';
 const styles=':root{font-family:system-ui,-apple-system,sans-serif;color:#17324c;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}header{background:#102a47;color:white;padding:15px max(18px,calc((100% - 1050px)/2))}header a{color:white;text-decoration:none;font-weight:700}header span{opacity:.8;margin-left:16px}main{max-width:1000px;margin:auto;padding:20px 16px 55px}h1{font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.18}p{line-height:1.55}a{color:#065ca6}.muted,small{color:#526277}.compare-search,.offer,.info{background:white;border:1px solid #dde5ec;border-radius:14px;padding:18px;margin:16px 0}.compare-search label{display:block;font-weight:700;margin-bottom:10px}.compare-search-row{display:flex;gap:8px}.compare-search input{flex:1;min-width:0;padding:13px;border:1px solid #acbdc9;border-radius:9px;font-size:16px}.compare-search button{padding:12px 18px;background:#134f81;color:white;border:0;border-radius:9px;font-weight:700;cursor:pointer}.compare-search small{display:block;margin-top:10px}.compare-error{color:#9c2020}.offer{display:flex;gap:14px;align-items:center}.offer img{width:82px;height:82px;object-fit:contain}.offer-main{min-width:0;flex:1}.offer strong{display:block}.price{font-size:1.2rem;font-weight:800;white-space:nowrap}.offer-link{display:inline-block;margin-top:6px}.crumb{font-size:.9rem}.offer small{display:block}.comparison-list{list-style:none;padding:0}footer{padding:20px;text-align:center;border-top:1px solid #dae3e9}@media(max-width:540px){.compare-search-row{flex-direction:column}.compare-search button{min-height:46px}.offer{align-items:flex-start;flex-wrap:wrap}.offer img{width:64px;height:64px}.price{width:100%}}';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+robots+'"><meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"'+esc(title)+'\"><meta property=\"og:description\" content=\"'+esc(description)+'\"><meta property=\"og:url\" content=\"'+esc(ORIGIN+canonical)+'\"><meta name=\"twitter:card\" content=\"summary\">'+(structured?'<script type=\"application/ld+json\">'+seo.jsonLd(structured)+'</script>':'')+<link rel="canonical" href="'+esc(ORIGIN+canonical)+'"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><style>'+styles+'</style></head><body><header><a href="/app">RedLibertad</a><span>Comparador</span></header><main>'+body+'</main><footer><a href="/marketplace/explorar">Marketplace</a> · <a href="/comparar">Comparador</a> · Los precios y la disponibilidad pueden cambiar en la tienda.</footer></body></html>';
}
function offerMarkup(o){
 const href=o.internal?o.href:safeHref(o.href);
 if(!href)return '';
 const image=o.internal&&/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||'')?'<img src="'+esc(o.image)+'" alt="" loading="lazy">':'';
 return '<li class="offer">'+image+'<div class="offer-main"><strong>'+esc(o.title)+'</strong><small>'+esc(o.shop)+' · '+esc(o.condition)+'</small><a class="offer-link" href="'+esc(href)+'"'+(o.internal?'':' target="_blank" rel="noopener noreferrer nofollow sponsored"')+'>'+(o.internal?'Ver anuncio':'Ver precio en tienda')+'</a></div><div class="price">'+money(o.price_cents)+'</div></li>';
}
function sameOrigin(req){
 const raw=req.get('origin'),fetchSite=req.get('sec-fetch-site');
 if(fetchSite==='cross-site')return false;
 if(!raw)return true;
 try{const url=new URL(raw),site=new URL(ORIGIN);return url.host===site.host || (url.host===req.get('host')&&['http:','https:'].includes(url.protocol));}catch(_){return false;}
}
router.get('/comparar',async(req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query('SELECT slug,query_text,created_at FROM marketplace_compare_pages WHERE '+seo.APPROVED_SQL+' ORDER BY created_at DESC LIMIT 12');
  const items=r.rows.map(p=>'<li><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a></li>').join('');
  res.set('Cache-Control','public,max-age=120');
  res.send(shell('Comparador de precios | RedLibertad','Busca un producto y consulta páginas de comparación guardadas en RedLibertad.',
   '<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / Comparador</p><h1>Comparador de precios</h1><p>Busca un producto. RedLibertad conservará su página para consultarla y compartirla.</p>'+formMarkup()+
   '<section class="info"><h2>Búsquedas recientes</h2>'+(items?'<ul>'+items+'</ul>':'<p>Todavía no hay comparaciones guardadas.</p>')+'</section><p class="muted">Buscamos primero en los anuncios públicos de RedLibertad. Las ofertas de tiendas externas requieren que el servicio de comparación esté configurado.</p>',
   '/comparar',true,seo.structuredData(null,[],false,'/comparar')));
 }catch(e){next(e);}
});
router.post('/comparar/buscar',rateLimit({windowMs:60*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
 try{
  if(!sameOrigin(req))return res.status(403).send('Solicitud no permitida');
  const q=cleanQuery(req.body?.q);
  if(!q)return res.status(400).send(shell('Búsqueda no válida | RedLibertad','Introduce un producto válido.',formMarkup('Escribe un nombre de producto de 3 a 100 caracteres.'),'/comparar'));
  const key=queryKey(q);
  if(key.length<3)return res.status(400).send(shell('Búsqueda no válida | RedLibertad','Introduce un producto válido.',formMarkup('Introduce el nombre de un producto más específico.',q),'/comparar'));
  await ensureSchema();
  const row=await db.query("INSERT INTO marketplace_compare_pages (query_key,slug,query_text) VALUES ($1,$2,$3) ON CONFLICT (query_key) DO UPDATE SET search_count=marketplace_compare_pages.search_count+1 RETURNING id,slug,query_text",[key,slugFor(q),q]);
  await refreshExternal(row.rows[0]);
  res.redirect(303,'/comparar/'+row.rows[0].slug);
 }catch(e){next(e);}
});

router.get('/admin/comparador',requireAdmin,async(_req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query("SELECT id,slug,query_text,index_approved,editorial_summary,provider_status,jsonb_array_length(external_results) AS external_count FROM marketplace_compare_pages ORDER BY created_at DESC LIMIT 60");
  const rows=r.rows.map(p=>'<li class="info"><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a> · '+(p.index_approved?'Aprobada':'No indexada')+
   '<p>'+esc(p.provider_status)+' · '+Number(p.external_count)+' ofertas externas</p><form method="post" action="/admin/comparador/'+Number(p.id)+'/seo"><label>Análisis original y verificado<textarea name="summary" rows="5" maxlength="2000" style="width:100%;display:block;font-size:16px">'+esc(p.editorial_summary)+'</textarea></label><button type="submit" name="action" value="approve">Aprobar SEO</button> <button type="submit" name="action" value="revoke">Retirar</button></form></li>').join('');
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Revisión SEO | RedLibertad','Revisión editorial privada','<h1>Revisión SEO de comparaciones</h1><p>Comprueba modelo, vendedores, vigencia y redacta contenido editorial propio.</p><ul>'+rows+'</ul>','/admin/comparador'));
 }catch(e){next(e);}
});
router.post('/admin/comparador/:id/seo',requireAdmin,async(req,res,next)=>{
 try{
  if(!sameOrigin(req))return res.sendStatus(403);
  const id=String(req.params.id||'');
  if(!/^[1-9]\d{0,15}$/.test(id))return res.sendStatus(400);
  const action=String(req.body?.action||'');
  await ensureSchema();
  if(action==='revoke'){
   await db.query("UPDATE marketplace_compare_pages SET index_approved=false,updated_at=now() WHERE id=$1",[id]);
  }else if(action==='approve'){
   const summary=String(req.body?.summary||'').trim().replace(/\s+/g,' ');
   if(summary.length<80||summary.length>2000)return res.status(400).send('El análisis requiere entre 80 y 2000 caracteres.');
   const r=await db.query("UPDATE marketplace_compare_pages SET editorial_summary=$2,index_approved=true,updated_at=now() WHERE id=$1 AND provider_status='ok' AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=2 AND (SELECT COUNT(DISTINCT lower(trim(o->>'shop'))) FROM jsonb_array_elements(external_results) AS o)>=2 RETURNING id",[id,summary]);
   if(!r.rowCount)return res.status(409).send('Necesita dos vendedores distintos y ofertas recientes.');
  }else return res.sendStatus(400);
  res.redirect(303,'/admin/comparador');
 }catch(e){next(e);}
});

router.get('/comparar/:slug',async(req,res,next)=>{
 try{
  const slug=String(req.params.slug||'');
  if(!/^[a-z0-9-]{4,120}$/.test(slug))return res.sendStatus(404);
  await ensureSchema();
  const result=await db.query('SELECT * FROM marketplace_compare_pages WHERE slug=$1',[slug]);
  if(!result.rowCount)return res.sendStatus(404);
  const page=result.rows[0];
  const local=await localOffers(page.query_text);
  const external=Array.isArray(page.external_results)?page.external_results.filter(o=>o&&!o.internal&&safeHref(o.href)&&Number.isSafeInteger(o.price_cents)&&o.price_cents>0):[];
  const offers=[...local,...external].sort((a,b)=>a.price_cents-b.price_cents);
  const checked=page.last_checked_at?new Date(page.last_checked_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'}):null;
  const provider=page.provider_status==='ok'?'Resultados externos comprobados '+esc(checked||''):page.provider_status==='unavailable'?'El proveedor externo no está disponible. Se muestran los últimos resultados externos guardados, si existen.':'Las ofertas externas todavía no están habilitadas; se muestran los productos de RedLibertad.';
  const approved=seo.indexEligible(page,offers);
  const title='Comparar '+page.query_text+' | RedLibertad';
  const description=approved?String(page.editorial_summary).slice(0,155):'Compara ofertas para '+page.query_text+' en España. Consulta vendedores, precios de referencia y fecha de actualización.';
  const content='<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / <a href="/comparar">Comparador</a></p><h1>Comparar '+esc(page.query_text)+'</h1>'+
   '<p>Página permanente de comparación, creada el '+new Date(page.created_at).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'})+'. Comparte esta URL para volver cuando quieras.</p>'+
   formMarkup('',page.query_text)+
   (approved?'<section class="info"><h2>Qué debes saber de este producto</h2><p>'+esc(page.editorial_summary)+'</p></section>':'')+
   '<section class="info"><h2>Resultados de comparación</h2><p class="muted">'+esc(offers.length)+' ofertas disponibles. '+provider+'</p><p class="muted">Compara el modelo y los gastos de envío en la tienda antes de comprar; las coincidencias externas son orientativas.</p></section>'+
   (offers.length?'<ol class="comparison-list">'+offers.map(offerMarkup).join('')+'</ol>':'<div class="info"><p>No hemos encontrado ofertas que coincidan suficientemente con esta búsqueda. La página permanece guardada y podrás volver más adelante.</p></div>');
  res.set('Cache-Control','public,max-age=90');
  res.send(shell(title,description,content,'/comparar/'+slug,approved,seo.structuredData(page,offers,approved,'/comparar/'+slug)));
 }catch(e){next(e);}
});
// Solo páginas con revisión editorial explícita y ofertas suficientes pasan al sitemap.
// Las búsquedas arbitrarias, vacías o con resultados escasos no crean SEO spam.
router.get('/sitemap-comparador.xml',async(_req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query('SELECT slug,updated_at FROM marketplace_compare_pages WHERE '+seo.APPROVED_SQL+' ORDER BY updated_at DESC LIMIT 2000');
  const urls=['<url><loc>'+esc(ORIGIN+'/comparar')+'</loc></url>',...r.rows.map(p=>'<url><loc>'+esc(ORIGIN+'/comparar/'+p.slug)+'</loc><lastmod>'+new Date(p.updated_at).toISOString()+'</lastmod></url>')];
  res.set('Cache-Control','public,max-age=300');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>');
 }catch(e){next(e);}
});
module.exports={router,cleanQuery,queryKey,slugFor,parseExternal,safeHref,ensureSchema,localOffers,sameOrigin};
