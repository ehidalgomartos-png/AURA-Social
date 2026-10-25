'use strict';
// V3.2.132 — páginas permanentes de comparaciones, sin crear URLs a partir de GET.
// El proveedor externo es optativo: sin API key solo se muestran anuncios públicos reales.
const express=require('express');
const crypto=require('node:crypto');
const rateLimit=require('express-rate-limit');
const db=require('../db');
const {ensureMarketplaceSchema}=require('./marketplace-v3250');
const seo=require('../services/marketplace-comparador-seo-v32132');
const provider=require('../services/marketplace-comparador-provider-v32133');
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
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_provider_usage (period_key VARCHAR(20) PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0))");
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
function parseExternal(results,q){return provider.parseExternal(results,q);}
async function reserveProviderQuota(){
 const {daily,monthly}=provider.budget();
 if(daily===0||monthly===0)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const val=key=>parts.find(p=>p.type===key)?.value||'';
 const month=val('year')+'-'+val('month'), day=month+'-'+val('day');
 const client=await db.pool.connect();
 try{
  await client.query('BEGIN');
  const sql='INSERT INTO marketplace_compare_provider_usage(period_key,used) VALUES($1,1) ON CONFLICT(period_key) DO UPDATE SET used=marketplace_compare_provider_usage.used+1 WHERE marketplace_compare_provider_usage.used<$2 RETURNING used';
  const mo=await client.query(sql,['m:'+month,monthly]);
  if(!mo.rowCount){await client.query('ROLLBACK');return false;}
  const dy=await client.query(sql,['d:'+day,daily]);
  if(!dy.rowCount){await client.query('ROLLBACK');return false;}
  await client.query('COMMIT');
  return true;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client.release();}
}
async function refreshExternal(page){
 if(!provider.configured())return;
 const lease=await db.query(
  "UPDATE marketplace_compare_pages SET last_checked_at=now(),provider_status='checking' WHERE id=$1 AND (last_checked_at IS NULL OR last_checked_at < now() - interval '24 hours') RETURNING id",[page.id]
 );
 if(!lease.rowCount)return;
 try{
  if(!await reserveProviderQuota()){
   await db.query("UPDATE marketplace_compare_pages SET provider_status='limit_reached' WHERE id=$1",[page.id]);
   return;
  }
  const offers=await provider.fetchOffers(page.query_text);
  await db.query("UPDATE marketplace_compare_pages SET external_results=$2::jsonb,provider_status='ok',updated_at=now() WHERE id=$1",[page.id,JSON.stringify(offers)]);
 }catch(e){
  console.warn('RedLibertad comparador: proveedor externo no disponible:',String(e.message).slice(0,90));
  await db.query("UPDATE marketplace_compare_pages SET provider_status='unavailable' WHERE id=$1",[page.id]);
 }
}
function formMarkup(message='',term='',csrfToken=''){
 return '<form class="compare-search" action="/comparar/buscar" method="post"><input type="hidden" name="_csrf" value="'+esc(csrfToken)+'"><label for="compareQ">¿Qué producto quieres comparar?</label><div class="compare-search-row"><input id="compareQ" name="q" type="search" required minlength="3" maxlength="100" value="'+esc(term)+'" placeholder="Ej. Samsung Galaxy S26 Ultra" autocomplete="off"><button type="submit">Comparar precios</button></div>'+
 (message?'<p class="compare-error" role="alert">'+esc(message)+'</p>':'')+
 '<small>Una búsqueda crea una página permanente. Solo aparecen precios verificados por una fuente disponible y se indica la fecha de comprobación.</small></form>';
}
function shell(title,description,body,canonical,allowIndex=false,structured=null){
 const robots=allowIndex?'index,follow':'noindex,follow';
 const styles=':root{font-family:system-ui,-apple-system,sans-serif;color:#17324c;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}header{background:#102a47;color:white;padding:15px max(18px,calc((100% - 1050px)/2))}header a{color:white;text-decoration:none;font-weight:700}header span{opacity:.8;margin-left:16px}main{max-width:1000px;margin:auto;padding:20px 16px 55px}h1{font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.18}p{line-height:1.55}a{color:#065ca6}.muted,small{color:#526277}.compare-search,.offer,.info{background:white;border:1px solid #dde5ec;border-radius:14px;padding:18px;margin:16px 0}.compare-search label{display:block;font-weight:700;margin-bottom:10px}.compare-search-row{display:flex;gap:8px}.compare-search input{flex:1;min-width:0;padding:13px;border:1px solid #acbdc9;border-radius:9px;font-size:16px}.compare-search button{padding:12px 18px;background:#134f81;color:white;border:0;border-radius:9px;font-weight:700;cursor:pointer}.compare-search small{display:block;margin-top:10px}.compare-error{color:#9c2020}.offer{display:flex;gap:14px;align-items:center}.offer img{width:82px;height:82px;object-fit:contain}.offer-main{min-width:0;flex:1}.offer strong{display:block}.price{font-size:1.2rem;font-weight:800;white-space:nowrap}.offer-link{display:inline-block;margin-top:6px}.crumb{font-size:.9rem}.offer small{display:block}.offer-photo{background:#f8fbfd;border-radius:9px}.offer-noimage{width:82px;height:82px;display:grid;place-items:center;background:#ecf2f8;border-radius:10px;font-size:28px}.compare-guide{font-weight:650;color:#075986}.compare-section-desc{font-size:.96rem}.offer-link{font-weight:700}.offer .price{color:#0c5a35}.comparison-list{list-style:none;padding:0}footer{padding:20px;text-align:center;border-top:1px solid #dae3e9}@media(max-width:540px){.compare-search-row{flex-direction:column}.compare-search button{min-height:46px}.offer{align-items:flex-start;flex-wrap:wrap}.offer img{width:64px;height:64px}.price{width:100%}}';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+robots+'"><meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"'+esc(title)+'\"><meta property=\"og:description\" content=\"'+esc(description)+'\"><meta property=\"og:url\" content=\"'+esc(ORIGIN+canonical)+'\"><meta name=\"twitter:card\" content=\"summary\">'+(structured?'<script type=\"application/ld+json\">'+seo.jsonLd(structured)+'</script>':'')+'<link rel="canonical" href="'+esc(ORIGIN+canonical)+'"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><style>'+styles+'</style></head><body><header><a href="/app">RedLibertad</a><span>Comparador</span></header><main>'+body+'</main><footer><a href="/marketplace/explorar">Marketplace</a> · <a href="/comparar">Comparador</a> · Los precios y la disponibilidad pueden cambiar en la tienda.</footer></body></html>';
}
function offerMarkup(o){
 const href=o.internal?o.href:provider.safeHttps(o.href);
 if(!href)return '';
 const img=o.internal?/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||'')?o.image:null:provider.safeImage(o.image);
 const picture=img?'<img class="offer-photo" src="'+esc(img)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<div class="offer-noimage" aria-hidden="true">🛍️</div>';
 const dest=o.internal?'Ver anuncio':o.destination==='store'?'Visitar tienda':'Consultar en Google Shopping';
 const shipping=o.delivery?'<small>Envío anunciado: '+esc(o.delivery)+'</small>':'<small>Envío: consultar en destino</small>';
 return '<li class="offer">'+picture+'<div class="offer-main"><strong>'+esc(o.title)+'</strong><small>'+esc(o.shop)+' · '+esc(o.condition)+'</small>'+shipping+
  '<a class="offer-link" href="'+esc(href)+'"'+(o.internal?'':' target="_blank" rel="noopener noreferrer nofollow"')+'>'+dest+'</a></div><div class="price">'+money(o.price_cents)+'</div></li>';
}
// Token independiente de cabeceras Origin/Sec-Fetch-Site, que pueden cambiar
// con redirects www/no-www y proxies. La cookie es httpOnly y SameSite=Lax.
const CSRF_COOKIE_SECURE='__Host-rl_compare_csrf';
const CSRF_COOKIE_LOCAL='rl_compare_csrf';
const CSRF_PATTERN=/^[a-f0-9]{48}$/;
function csrfSecure(req){
 return process.env.NODE_ENV==='production'||req.secure===true;
}
function csrfName(req){return csrfSecure(req)?CSRF_COOKIE_SECURE:CSRF_COOKIE_LOCAL;}
function issueCsrf(req,res){
 const name=csrfName(req);
 const existing=req.cookies?.[name];
 const token=typeof existing==='string'&&CSRF_PATTERN.test(existing)?existing:crypto.randomBytes(24).toString('hex');
 res.cookie(name,token,{httpOnly:true,sameSite:'lax',secure:csrfSecure(req),path:'/',maxAge:24*60*60*1000});
 return token;
}
function validCsrf(req){
 const token=req.body?._csrf;
 const cookie=req.cookies?.[csrfName(req)];
 if(typeof token!=='string'||!CSRF_PATTERN.test(token)||typeof cookie!=='string'||!CSRF_PATTERN.test(cookie))return false;
 return crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(cookie,'hex'));
}
router.get('/comparar',async(req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query('SELECT slug,query_text,created_at FROM marketplace_compare_pages WHERE '+seo.APPROVED_SQL+' ORDER BY created_at DESC LIMIT 12');
  const items=r.rows.map(p=>'<li><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a></li>').join('');
  const csrfToken=issueCsrf(req,res);
  res.set('Cache-Control','private,no-store');
  res.send(shell('Comparador de precios | RedLibertad','Busca un producto y consulta páginas de comparación guardadas en RedLibertad.',
   '<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / Comparador</p><h1>Comparador de precios</h1><p>Busca un producto. RedLibertad conservará su página para consultarla y compartirla.</p>'+formMarkup('','',csrfToken)+
   '<section class="info"><h2>Comparaciones publicadas</h2>'+(items?'<ul>'+items+'</ul>':'<p>Todavía no hay comparaciones publicadas. Las búsquedas nuevas se guardan aunque no se publiquen en Google.</p>')+'</section><p class="muted">Buscamos primero en los anuncios públicos de RedLibertad. Las ofertas de tiendas externas requieren que el servicio de comparación esté configurado.</p>',
   '/comparar',true,seo.structuredData(null,[],false,'/comparar')));
 }catch(e){next(e);}
});
router.post('/comparar/buscar',rateLimit({windowMs:60*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
 try{
  if(!validCsrf(req)){
   res.set('Cache-Control','private,no-store');
   return res.status(403).send(shell('Reintentar búsqueda | RedLibertad','Verifica tu búsqueda.',
    '<h1>Vuelve a intentar la búsqueda</h1>'+formMarkup('No se ha podido validar este formulario. Actualiza la página e inténtalo de nuevo.',String(req.body?.q||'').slice(0,100),issueCsrf(req,res)),'/comparar'));
  }
  const q=cleanQuery(req.body?.q);
  if(!q)return res.status(400).send(shell('Búsqueda no válida | RedLibertad','Introduce un producto válido.',formMarkup('Escribe un nombre de producto de 3 a 100 caracteres.','',issueCsrf(req,res)),'/comparar'));
  const key=queryKey(q);
  if(key.length<3)return res.status(400).send(shell('Búsqueda no válida | RedLibertad','Introduce un producto válido.',formMarkup('Introduce el nombre de un producto más específico.',q,issueCsrf(req,res)),'/comparar'));
  await ensureSchema();
  const row=await db.query("INSERT INTO marketplace_compare_pages (query_key,slug,query_text) VALUES ($1,$2,$3) ON CONFLICT (query_key) DO UPDATE SET search_count=marketplace_compare_pages.search_count+1 RETURNING id,slug,query_text",[key,slugFor(q),q]);
  await refreshExternal(row.rows[0]);
  res.redirect(303,'/comparar/'+row.rows[0].slug);
 }catch(e){next(e);}
});

router.get('/admin/comparador',requireAdmin,async(req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query("SELECT id,slug,query_text,index_approved,editorial_summary,provider_status,jsonb_array_length(external_results) AS external_count FROM marketplace_compare_pages ORDER BY created_at DESC LIMIT 60");
  const csrfToken=issueCsrf(req,res);
  const rows=r.rows.map(p=>'<li class="info"><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a> · '+(p.index_approved?'Aprobada':'No indexada')+
   '<p>'+esc(p.provider_status)+' · '+Number(p.external_count)+' ofertas externas</p><form method="post" action="/admin/comparador/'+Number(p.id)+'/seo"><input type="hidden" name="_csrf" value="'+esc(csrfToken)+'"><label>Análisis original y verificado<textarea name="summary" rows="5" maxlength="2000" style="width:100%;display:block;font-size:16px">'+esc(p.editorial_summary)+'</textarea></label><button type="submit" name="action" value="approve">Aprobar SEO</button> <button type="submit" name="action" value="revoke">Retirar</button></form></li>').join('');
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Revisión SEO | RedLibertad','Revisión editorial privada','<h1>Revisión SEO de comparaciones</h1><p>Comprueba modelo, vendedores, vigencia y redacta contenido editorial propio.</p><ul>'+rows+'</ul>','/admin/comparador'));
 }catch(e){next(e);}
});
router.post('/admin/comparador/:id/seo',requireAdmin,async(req,res,next)=>{
 try{
  if(!validCsrf(req))return res.status(403).send('El formulario ha caducado. Regresa al panel e inténtalo de nuevo.');
  const id=String(req.params.id||'');
  if(!/^[1-9]\d{0,15}$/.test(id))return res.sendStatus(400);
  const action=String(req.body?.action||'');
  await ensureSchema();
  if(action==='revoke'){
   await db.query("UPDATE marketplace_compare_pages SET index_approved=false,updated_at=now() WHERE id=$1",[id]);
  }else if(action==='approve'){
   const summary=String(req.body?.summary||'').trim().replace(/\s+/g,' ');
   if(summary.length<80||summary.length>2000)return res.status(400).send('El análisis requiere entre 80 y 2000 caracteres.');
   const r=await db.query("UPDATE marketplace_compare_pages SET editorial_summary=$2,index_approved=true,updated_at=now() WHERE id=$1 AND query_text ~ '[0-9]' AND btrim(query_text) LIKE '% %' AND provider_status='ok' AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=2 AND (SELECT COUNT(DISTINCT lower(trim(o->>'shop'))) FROM jsonb_array_elements(external_results) AS o)>=2 RETURNING id",[id,summary]);
   if(!r.rowCount)return res.status(409).send('Solo se aprueban modelos específicos con dos vendedores distintos y ofertas recientes.');
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
  const providerMessage=page.provider_status==='ok'
   ?'Precios externos consultados el '+esc(checked||'')
   :page.provider_status==='limit_reached'?'Límite de consultas externas alcanzado. Los resultados guardados siguen disponibles.':
    page.provider_status==='unavailable'?'El proveedor externo no responde. Se conservan los últimos resultados guardados.':
    provider.configured()?'Consulta preparada. Pulsa «Comparar precios» para buscar ofertas reales.':
    'Las tiendas externas todavía no están conectadas: falta configurar la clave privada.';
  const exact=provider.isSpecificModel(page.query_text);
  const approved=seo.indexEligible(page,offers);
  const title='Comparar '+page.query_text+' | RedLibertad';
  const description=approved?String(page.editorial_summary).slice(0,155):'Compara ofertas para '+page.query_text+' en España. Consulta vendedores, precios de referencia y fecha de actualización.';
  const csrfToken=issueCsrf(req,res);
  const content='<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / <a href="/comparar">Comparador</a></p><h1>Comparar '+esc(page.query_text)+'</h1>'+
   '<p>Página permanente de comparación, creada el '+new Date(page.created_at).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'})+'. Comparte esta URL para volver cuando quieras.</p>'+
   formMarkup('',page.query_text,csrfToken)+
   (approved?'<section class="info"><h2>Qué debes saber de este producto</h2><p>'+esc(page.editorial_summary)+'</p></section>':'')+
   '<section class="info"><h2>'+(exact?'Precios encontrados':'Productos relacionados con tu búsqueda')+'</h2><p class="compare-guide">'+(exact?'Consulta las variantes y sus precios antes de comprar.':'«'+esc(page.query_text)+'» incluye varios modelos. Añade el modelo exacto para comparar el mismo producto.')+'</p><p class="muted">'+esc(offers.length)+' ofertas disponibles. '+providerMessage+'</p><p class="compare-section-desc">Precios de referencia en euros, sin garantía de envío incluido. La disponibilidad y el precio final los confirma la tienda de destino. Los enlaces a Google Shopping no son un pago directo en la tienda.</p></section>'+
   (offers.length?'<ol class="comparison-list">'+offers.map(offerMarkup).join('')+'</ol>':'<div class="info"><p>No hemos encontrado ofertas que coincidan suficientemente con esta búsqueda. La página permanece guardada y podrás volver más adelante.</p></div>');
  res.set('Cache-Control','private,no-store');
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
module.exports={router,cleanQuery,queryKey,slugFor,parseExternal,safeHref,ensureSchema,localOffers,issueCsrf,validCsrf,csrfName};
