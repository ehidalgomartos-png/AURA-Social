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
const compareWorker=require('../services/marketplace-comparador-worker-v32134');
const insights=require('../services/marketplace-comparador-insights-v32140');
const linkDiagnostics=require('../services/marketplace-comparador-link-diagnostics-v32146');
const manualLinks=require('../services/marketplace-comparador-manual-links-v32147');
const priceFreshness=require('../services/marketplace-comparador-price-freshness-v32148');
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
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_pages (id BIGSERIAL PRIMARY KEY, query_key VARCHAR(120) NOT NULL UNIQUE, slug VARCHAR(120) NOT NULL UNIQUE, query_text VARCHAR(100) NOT NULL, external_results JSONB NOT NULL DEFAULT '[]'::jsonb, last_checked_at TIMESTAMPTZ, provider_status VARCHAR(30) NOT NULL DEFAULT 'not_configured', index_approved BOOLEAN NOT NULL DEFAULT false, seo_blocked BOOLEAN NOT NULL DEFAULT false, editorial_summary TEXT NOT NULL DEFAULT '', search_count BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("ALTER TABLE marketplace_compare_pages ADD COLUMN IF NOT EXISTS editorial_summary TEXT NOT NULL DEFAULT ''");
   await db.query("ALTER TABLE marketplace_compare_pages ADD COLUMN IF NOT EXISTS seo_blocked BOOLEAN NOT NULL DEFAULT false");
   await db.query('CREATE INDEX IF NOT EXISTS idx_marketplace_compare_created ON marketplace_compare_pages(created_at DESC)');
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_provider_usage (period_key VARCHAR(20) PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0))");
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_merchant_links (offer_key VARCHAR(64) PRIMARY KEY, status VARCHAR(16) NOT NULL CHECK (status IN ('checking','ok','unavailable')), href TEXT, checked_at TIMESTAMPTZ NOT NULL DEFAULT now())");
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_manual_links (page_id BIGINT NOT NULL REFERENCES marketplace_compare_pages(id) ON DELETE CASCADE, offer_key VARCHAR(64) NOT NULL, href TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(page_id,offer_key))");
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_price_history (page_id BIGINT NOT NULL REFERENCES marketplace_compare_pages(id) ON DELETE CASCADE, checked_day DATE NOT NULL, low_price_cents BIGINT NOT NULL CHECK(low_price_cents>0), high_price_cents BIGINT NOT NULL CHECK(high_price_cents>=low_price_cents), shop_count INTEGER NOT NULL CHECK(shop_count>=3), offer_count INTEGER NOT NULL CHECK(offer_count>=3), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(page_id,checked_day))");
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
function formMarkup(message='',term='',csrfToken=''){
 return '<form class="compare-search" action="/comparar/buscar" method="post"><input type="hidden" name="_csrf" value="'+esc(csrfToken)+'"><label for="compareQ">¿Qué producto quieres comparar?</label><div class="compare-search-row"><input id="compareQ" name="q" type="search" required minlength="3" maxlength="100" value="'+esc(term)+'" placeholder="Ej. Samsung Galaxy S26 Ultra" autocomplete="off"><button type="submit">Comparar precios</button></div>'+
 (message?'<p class="compare-error" role="alert">'+esc(message)+'</p>':'')+
 '</form>';
}
function shell(title,description,body,canonical,allowIndex=false,structured=null){
 const robots=allowIndex?'index,follow':'noindex,follow';
 const styles=':root{font-family:system-ui,-apple-system,sans-serif;color:#17324c;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}header{background:#102a47;color:white;padding:15px max(18px,calc((100% - 1050px)/2))}header a{color:white;text-decoration:none;font-weight:700}header span{opacity:.8;margin-left:16px}main{max-width:1000px;margin:auto;padding:20px 16px 55px}h1{font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.18}p{line-height:1.55}a{color:#065ca6}.muted,small{color:#526277}.compare-search,.offer,.info{background:white;border:1px solid #dde5ec;border-radius:14px;padding:18px;margin:16px 0}.compare-search label{display:block;font-weight:700;margin-bottom:10px}.compare-search-row{display:flex;gap:8px}.compare-search input{flex:1;min-width:0;padding:13px;border:1px solid #acbdc9;border-radius:9px;font-size:16px}.compare-search button{padding:12px 18px;background:#134f81;color:white;border:0;border-radius:9px;font-weight:700;cursor:pointer}.compare-search small{display:block;margin-top:10px}.compare-error{color:#9c2020}.offer{display:flex;gap:14px;align-items:center}.offer img{width:82px;height:82px;object-fit:contain}.offer-main{min-width:0;flex:1}.offer strong{display:block}.price{font-size:1.2rem;font-weight:800;white-space:nowrap}.offer-link{display:inline-block;margin-top:6px}.crumb{font-size:.9rem}.offer small{display:block}.offer-photo{background:#f8fbfd;border-radius:9px}.offer-noimage{width:82px;height:82px;display:grid;place-items:center;background:#ecf2f8;border-radius:10px;font-size:28px}.compare-guide{font-weight:650;color:#075986}.compare-section-desc{font-size:.96rem}.offer-link{font-weight:700}.offer .price{color:#0c5a35}.comparison-list{list-style:none;padding:0}footer{padding:20px;text-align:center;border-top:1px solid #dae3e9}@media(max-width:540px){.compare-search-row{flex-direction:column}.compare-search button{min-height:46px}.offer{align-items:flex-start;flex-wrap:wrap}.offer img{width:64px;height:64px}.price{width:100%}}';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+robots+'"><meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"'+esc(title)+'\"><meta property=\"og:description\" content=\"'+esc(description)+'\"><meta property=\"og:url\" content=\"'+esc(ORIGIN+canonical)+'\"><meta name=\"twitter:card\" content=\"summary\">'+(structured?'<script type=\"application/ld+json\">'+seo.jsonLd(structured)+'</script>':'')+'<link rel="canonical" href="'+esc(ORIGIN+canonical)+'"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><style>'+styles+'</style><link rel="stylesheet" href="/comparador-v32135.css"><script defer src="/comparador-v32135.js"></script></head><body><header><a href="/app">RedLibertad</a><span>Comparador</span></header><main>'+body+'</main><footer><a href="/marketplace/explorar">Marketplace</a> · <a href="/comparar">Comparador</a> · Los precios y la disponibilidad pueden cambiar en la tienda.</footer></body></html>';
}
function offerKey(o){
 return crypto.createHash('sha256').update([String(o.product_id||''),String(o.shop||''),String(o.title||''),String(o.price_cents||'')].join('|')).digest('hex');
}
async function attachCachedMerchantLinks(offers){
 const candidates=offers.filter(o=>!o.internal &&
   provider.hasProductReference(o) && provider.resolveOfferLink(o)?.destination!=='store');
 if(!candidates.length)return;
 const keys=candidates.map(offerKey);
 const found=await db.query("SELECT offer_key,href,status FROM marketplace_compare_merchant_links WHERE offer_key=ANY($1::varchar[]) AND checked_at>now()-interval '24 hours' AND (status!='checking' OR checked_at>now()-interval '2 minutes')",[keys]);
 const byKey=new Map(found.rows.map(r=>[r.offer_key,r]));
 for(const o of candidates){
  const record=byKey.get(offerKey(o));
  if(!record)continue;
  o.lookup_status=record.status;
  if(record.status==='ok'&&record.href)o.resolved_href=record.href;
 }
}
async function attachManualMerchantLinks(page,offers){
 const keys=[...new Set(offers.filter(o=>!o.internal).map(manualLinks.identityKey).filter(Boolean))];
 if(!keys.length)return;
 const found=await db.query("SELECT offer_key,href FROM marketplace_compare_manual_links WHERE page_id=$1 AND offer_key=ANY($2::varchar[])",[page.id,keys]);
 manualLinks.applyManualLinks(page,offers,found.rows);
}
function offerMarkup(o,index=0,total=0,slug='',csrfToken='',quota=null,priceInfo=null){
 const link=o.internal?{href:o.href,destination:'internal'}:provider.resolveOfferLink(o);
 if(!link||!link.href)return '';
 const href=link.href;
 const img=o.internal?/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||'')?o.image:null:provider.safeImage(o.image);
 const picture=img?'<img class="offer-photo" src="'+esc(img)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<div class="offer-noimage" aria-hidden="true">🛍️</div>';
 const shop=String(o.shop||'Tienda no identificada');
 const merchant=link.destination==='store';
 const dest=link.destination==='internal'?'Ver anuncio':merchant?'Ver oferta en tienda':'Buscar en Google';
 const note=o.sponsored?'Publicidad de Google':link.destination==='internal'?'Anuncio de RedLibertad':o.manual_link?'Enlace revisado por administración':merchant?'Enlace directo del vendedor':'';
 const shipping=o.delivery?'<small>🚚 '+esc(o.delivery)+'</small>':'';
 const possible=link.destination==='shopping-search' && provider.canLookupSeller(o) &&
   !['unavailable','checking'].includes(o.lookup_status) && provider.hasProductReference(o);
 const candidate=possible && quota?.available!==false;
 const lookup=candidate?'<form class="offer-lookup" method="post" action="/comparar/tienda/'+esc(slug)+'/'+offerKey(o)+'"><input type="hidden" name="_csrf" value="'+esc(csrfToken)+'"><button class="offer-link" type="submit">Consultar enlace de la tienda</button></form>':
   '';
 const pricing=o.internal?'':priceInfo?.date?
   '<small class="offer-price-date'+(priceInfo.isStale?' offer-price-old':'')+'">'+
   esc((priceInfo.isStale?'Último precio guardado: ':'Precio consultado: ')+priceInfo.date)+'</small>':
   '<small class="offer-price-date offer-price-old">Sin fecha de precio externo</small>';
 return '<li class="offer">'+(index===0&&total>1?'<span class="best-offer">'+(priceInfo?.isStale?'Mínimo de la consulta anterior':'Precio más bajo mostrado')+'</span>':'')+(o.sponsored?'<span class="offer-sponsored">Publicidad</span>':'')+
  picture+'<div class="offer-main"><strong>'+esc(o.title)+'</strong><small>'+esc(shop)+' · '+esc(o.condition)+'</small>'+shipping+
  '</div><div class="price">'+money(o.price_cents)+'</div>'+pricing+
  lookup+'<a class="offer-link'+(possible?' offer-search-backup':'')+'" href="'+esc(href)+'"'+(o.internal?'':' target="_blank" rel="noopener noreferrer nofollow'+(o.sponsored?' sponsored':'')+'"')+'>'+dest+'</a>'+
  (note?'<span class="offer-destination">'+note+'</span>':'')+'</li>';
}
function historyMarkup(history){
 const rows=(Array.isArray(history)?history:[]).filter(x=>Number.isSafeInteger(Number(x.low_price_cents))&&Number(x.low_price_cents)>0);
 if(rows.length<2)return '';
 const recent=rows.slice(0,6);
 return '<section class="compare-history" aria-labelledby="compare-history-title"><h2 id="compare-history-title">Evolución de precios verificados</h2>'+
  '<p>Precios mínimos observados en fechas distintas para esta misma variante.</p>'+
  '<ol>'+recent.map(row=>{
   const day=String(row.checked_day||'').slice(0,10);
   const date=/^\d{4}-\d{2}-\d{2}$/.test(day)?day:'';
   if(!date)return '';
   const pretty=date.split('-').reverse().join('/');
   return '<li><time datetime="'+esc(date)+'">'+esc(pretty)+'</time>'+
    '<strong>'+money(row.low_price_cents)+'</strong>'+
    '<span>'+Number(row.shop_count)+' tiendas contrastadas</span></li>';
  }).join('')+'</ol><small>Datos de consultas anteriores. Precios orientativos, sin confirmar transporte ni disponibilidad.</small></section>';
}
function insightsMarkup(query,insight){
 // No repetir una tabla de versiones si todas las ofertas corresponden a la misma.
 if(!insight||insight.variants.length<=1)return '';
 const ranked=insight.variants.slice().sort((a,b)=>Number(Boolean(b.capacity))-Number(Boolean(a.capacity))||b.count-a.count||a.minCents-b.minCents);
 const renderVariant=v=>{
  const colors=v.colors.length?' · '+esc(v.colors.length===1?v.colors[0]:v.colors.length+' colores'):'';
  const link=v.suggestedQuery?'<a class="compare-variant-refine" href="/comparar?q='+encodeURIComponent(v.suggestedQuery)+'">Comparar esta capacidad</a>':'';
  const title=v.label.replace(/^Modelo estándar · /,'').replace('Capacidad sin identificar','Capacidad no indicada');
  return '<li class="compare-variant"><strong>'+esc(title)+'</strong>'+
   '<span class="compare-variant-price">Desde '+money(v.minCents)+'</span>'+
   '<small>'+v.count+' '+(v.count===1?'oferta':'ofertas')+' · '+v.shopCount+
   (v.shopCount===1?' vendedor':' vendedores')+colors+'</small>'+link+'</li>';
 };
 const shown=ranked.slice(0,4),remaining=ranked.slice(4);
 return '<section class="compare-variant-section" aria-labelledby="compare-variant-heading">'+
  '<div class="compare-variant-heading"><h2 id="compare-variant-heading">Versiones encontradas</h2>'+
  '<p>'+insight.total+' '+(insight.total===1?'oferta agrupada':'ofertas agrupadas')+' por capacidad y estado</p></div>'+
  '<ul class="compare-variant-grid">'+shown.map(renderVariant).join('')+'</ul>'+
  (remaining.length?'<details class="compare-more-variants"><summary>Ver las otras '+remaining.length+
   (remaining.length===1?' versión':' versiones')+'</summary><ul class="compare-variant-grid">'+remaining.map(renderVariant).join('')+'</ul></details>':'')+
  (insight.hasMixedVariants?'<p class="compare-variant-warning">Los precios varían según versión, capacidad y estado.</p>':'')+
  '</section>';
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
  // Páginas guardadas con ofertas reales: no equivalen a páginas indexadas por Google.
  const recent=await db.query("SELECT slug,query_text,jsonb_array_length(external_results) AS offer_count FROM marketplace_compare_pages WHERE jsonb_array_length(external_results)>0 AND provider_status IN ('ok','limit_reached','unavailable') ORDER BY last_checked_at DESC NULLS LAST,created_at DESC LIMIT 12");
  const potential=await db.query("SELECT slug,query_text,external_results,provider_status,last_checked_at,index_approved,editorial_summary,seo_blocked FROM marketplace_compare_pages WHERE provider_status='ok' AND seo_blocked=false AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=2 ORDER BY updated_at DESC LIMIT 400");
  const indexed=potential.rows.filter(p=>seo.indexEligible(p,p.external_results)).slice(0,8).map(p=>'<li><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a></li>').join('');
  const items=recent.rows.map(p=>'<li><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a> · <small>'+Number(p.offer_count)+' ofertas guardadas</small></li>').join('');
  const csrfToken=issueCsrf(req,res);
  res.set('Cache-Control','private,no-store');
  res.send(shell('Comparador de precios | RedLibertad','Busca un producto y consulta páginas de comparación guardadas en RedLibertad.',
   '<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / Comparador</p><h1>Comparador de precios</h1><p>Busca un producto y compara ofertas de tiendas.</p>'+formMarkup('',cleanQuery(req.query?.q)||'',csrfToken)+
   '<section class="info"><h2>Comparaciones recientes</h2>'+(items?'<ul class="compare-recent-list">'+items+'</ul>':'<p>Todavía no hay comparaciones con ofertas guardadas.</p>')+'</section>'+
   (indexed?'<section class="info"><h2>Páginas aprobadas para Google</h2><p class="muted">Preparadas para indexación; Google decide si las incorpora a sus resultados.</p><ul class="compare-recent-list">'+indexed+'</ul></section>':'')+
   '',
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
  await compareWorker.enqueue(row.rows[0],ensureSchema);
  res.redirect(303,'/comparar/'+row.rows[0].slug);
 }catch(e){next(e);}
});

function seoRefinementSuggestions(page){
 const text=cleanQuery(page?.query_text);
 if(!text||seo.auto.capacity(text))return [];
 const results=[],seen=new Set(),offers=Array.isArray(page.external_results)?page.external_results:[];
 for(const o of offers){
  if(!o?.title||!provider.titleMatches(text,o.title))continue;
  const cap=seo.auto.capacity(o.title);
  if(!cap)continue;
  const q=text+' '+cap.replace('gb',' GB');
  const key=queryKey(q);
  if(seen.has(key))continue;
  seen.add(key);results.push(q);
  if(results.length>=3)break;
 }
 return results;
}
function linkDiagnosticsMarkup(page,cache,quota,manualCache=new Map(),token=''){
 const offers=linkDiagnostics.pageDiagnostics(page,cache,quota);
 if(!offers.length)return '<details class="seo-link-details"><summary>Enlaces de tienda · sin ofertas válidas</summary><p class="seo-link-empty">Todavía no hay ofertas coincidentes que analizar.</p></details>';
 const ready=offers.filter(x=>x.status==='ready').length;
 const direct=offers.filter(x=>['direct','verified','internal'].includes(x.status)||
  manualLinks.storedLink(x.offer,manualCache.get(page.id+':'+manualLinks.identityKey(x.offer)))).length;
 const details=offers.slice(0,6).map(x=>{
  const key=manualLinks.identityKey(x.offer);
  const manual=manualLinks.storedLink(x.offer,manualCache.get(page.id+':'+key));
  const url=manual||x.href;
  const action='/admin/comparador/'+Number(page.id)+'/enlace';
  return '<li class="seo-link-item"><div><strong>'+esc(x.offer.title)+'</strong><small>'+esc(x.offer.shop||'Tienda no indicada')+'</small></div>'+
   '<span class="seo-link-state seo-link-state-'+esc(manual?'manual':x.status)+'">'+esc(manual?'Enlace revisado por administración':x.label)+'</span>'+
   '<p>'+esc(manual?'La URL se conserva al actualizar precios. Debes comprobar la disponibilidad y el importe en la tienda.':x.description)+'</p>'+
   (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer nofollow">Abrir tienda</a>':'')+
   '<form class="seo-manual-link-form" method="post" action="'+action+'">'+
   '<input type="hidden" name="_csrf" value="'+esc(token)+'"><input type="hidden" name="offer_key" value="'+esc(key)+'">'+
   '<label for="manual-url-'+Number(page.id)+'-'+esc(key)+'">Enlace exacto en '+esc(x.offer.shop)+'</label>'+
   '<input id="manual-url-'+Number(page.id)+'-'+esc(key)+'" name="url" type="url" maxlength="2048" required value="'+esc(manual||'')+'" placeholder="https://tienda.es/producto/..." autocomplete="off" inputmode="url">'+
   '<label class="seo-manual-confirm"><input type="checkbox" name="confirmed" value="yes" required> He comprobado que esta dirección corresponde a la oferta y tienda indicadas.</label>'+
   '<button class="seo-btn seo-btn-primary" type="submit" name="action" value="save">Guardar enlace directo</button></form>'+
   (manual?'<form class="seo-manual-remove" method="post" action="'+action+'"><input type="hidden" name="_csrf" value="'+esc(token)+'">'+
    '<input type="hidden" name="offer_key" value="'+esc(key)+'"><button type="submit" name="action" value="remove" class="seo-btn seo-btn-outline">Quitar enlace manual</button></form>':'')+
   '</li>';
 }).join('');
 return '<details class="seo-link-details"><summary>Enlaces de tienda · '+direct+' directos · '+ready+' comprobables</summary>'+
  '<ol class="seo-link-list">'+details+'</ol>'+
  (offers.length>6?'<small>Se muestran 6 de '+offers.length+' ofertas. Abre la comparación para ver todas.</small>':'')+
  '<small>Diagnóstico basado en datos guardados. No se consulta SerpApi.</small></details>';
}
function seoAdminView(rows,token,filter,quota=null,merchantCache=new Map(),manualCache=new Map()){
 const prepared=rows.map(p=>{
  const matching=(Array.isArray(p.external_results)?p.external_results:[]).filter(o=>o&&provider.titleMatches(p.query_text,o.title));
  const evaluation=seo.auto.eligibleOffers(p,matching);
  const eligible=seo.indexEligible(p,p.external_results);
  const state=p.seo_blocked?'bloqueadas':eligible?'aptas':'pendientes';
  return {p,evaluation,eligible,state,matching};
 });
 const states=['todas','aptas','pendientes','bloqueadas'];
 const chosen=states.includes(filter)?filter:'todas';
 const counts={todas:prepared.length,aptas:0,pendientes:0,bloqueadas:0};
 for(const item of prepared)counts[item.state]++;
 const chips=[
  ['todas','Todas'],['aptas','Aptas'],['pendientes','Por mejorar'],['bloqueadas','Bloqueadas']
 ].map(([key,label])=>'<a class="seo-filter'+(key===chosen?' is-active':'')+'" href="/admin/comparador?estado='+key+'">'+
   esc(label)+' <span>'+counts[key]+'</span></a>').join('');
 const visible=prepared.filter(x=>chosen==='todas'||x.state===chosen);
 const cards=visible.map(({p,evaluation,eligible,state,matching})=>{
  const id=Number(p.id),action='/admin/comparador/'+id+'/seo';
  const suggestion=seoRefinementSuggestions(p);
  const reason=p.seo_blocked?'Excluida por decisión del administrador':
   eligible?(evaluation.eligible?'Modelo y ofertas válidos para SEO automático':'Aprobación editorial vigente'):
   evaluation.reason;
  const info=eligible?'Preparada para indexación; Google decide si la indexa.':
   p.seo_blocked?'Puedes volver a permitir el SEO cuando quieras.':
   evaluation.reason==='Falta capacidad o variante exacta'?'Especifica modelo y almacenamiento, por ejemplo 128 GB o 256 GB.':
   evaluation.reason==='Precios sin actualizar'?'Se revisará cuando haya precios recientes.':
   evaluation.reason==='Menos de tres ofertas independientes'||evaluation.reason==='Menos de tres tiendas diferentes'?
    'Se necesitan al menos tres comercios independientes con ofertas verificadas.':
    'Revisa que todas las ofertas sean el mismo modelo, capacidad, color y estado, con enlaces directos a las tiendas.';
  const links=suggestion.length?
   '<div class="seo-suggestions"><span>Búsquedas más específicas:</span>'+
   suggestion.map(q=>'<a href="/comparar?q='+encodeURIComponent(q)+'">'+esc(q)+'</a>').join('')+
   '<small>Ejemplos basados en anuncios existentes; no garantizan indexación.</small></div>':'';
  const checked=p.last_checked_at&&!Number.isNaN(Date.parse(p.last_checked_at))?
   ' · Precios del '+new Date(p.last_checked_at).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'}):'';
  const actionControl=p.seo_blocked?
   '<button type="submit" name="action" value="unblock" class="seo-btn seo-btn-primary">Permitir SEO automático</button>':
   '<button type="submit" name="action" value="revoke" class="seo-btn seo-btn-outline">Bloquear SEO</button>';
  return '<li class="seo-admin-card" id="comparacion-'+id+'" data-seo-state="'+state+'">'+
   '<div class="seo-admin-card-head"><div><a class="seo-admin-name" href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a>'+
   '<div class="seo-admin-meta">'+matching.length+' '+(matching.length===1?'oferta coincidente':'ofertas coincidentes')+checked+'</div></div>'+
   '<span class="seo-admin-chip seo-admin-chip-'+state+'">'+
   (state==='aptas'?'Apta para Google':state==='bloqueadas'?'Bloqueada':'Por mejorar')+'</span></div>'+
   '<p class="seo-admin-reason">'+esc(reason)+'</p><p class="seo-admin-detail">'+esc(info)+'</p>'+links+
   '<div class="seo-admin-controls"><form method="post" action="'+action+'">'+
   '<input type="hidden" name="_csrf" value="'+esc(token)+'">'+actionControl+'</form>'+
   '<details class="seo-admin-editor"><summary>Editar comentario editorial</summary>'+
   '<form method="post" action="'+action+'"><input type="hidden" name="_csrf" value="'+esc(token)+'">'+
   '<label for="seo-summary-'+id+'">Comentario original (mínimo 80 caracteres)</label>'+
   '<textarea id="seo-summary-'+id+'" name="summary" rows="4" maxlength="2000" minlength="80" placeholder="Aporta información propia y útil sobre este modelo.">'+esc(p.editorial_summary||'')+'</textarea>'+
   '<button type="submit" name="action" value="approve" class="seo-btn seo-btn-primary">Aprobar con comentario</button></form>'+
   '</details></div>'+linkDiagnosticsMarkup(p,merchantCache,quota,manualCache,token)+'</li>';
 }).join('');
 return '<div class="seo-admin">'+
  '<p class="crumb"><a href="/comparar">Comparador</a> / Administración</p>'+
  '<div class="seo-admin-intro"><h1>SEO del comparador</h1><p>Consulta qué páginas están listas y cuáles necesitan mejoras.</p></div>'+
  (quota?'<section class="seo-quota-panel" aria-labelledby="seo-quota-title"><h2 id="seo-quota-title">Consultas del comparador</h2>'+
   '<div class="seo-quota-numbers"><p><strong>'+Number(quota.dailyUsed||0)+' / '+Number(quota.daily)+'</strong><span>Hoy</span></p>'+
   '<p><strong>'+Number(quota.monthlyUsed||0)+' / '+Number(quota.monthly)+'</strong><span>Este mes</span></p></div>'+
   '<small>Presupuesto interno de RedLibertad. El consumo total de la cuenta se consulta en SerpApi.</small></section>':'')+
  '<div class="seo-admin-overview"><div><strong>'+counts.todas+'</strong><span>Comparaciones</span></div>'+
  '<div><strong>'+counts.aptas+'</strong><span>Aptas para Google</span></div>'+
  '<div><strong>'+counts.pendientes+'</strong><span>Por mejorar</span></div>'+
  '<div><strong>'+counts.bloqueadas+'</strong><span>Bloqueadas</span></div></div>'+
  '<nav class="seo-admin-filters" aria-label="Filtrar comparaciones">'+chips+'</nav>'+
  (cards?'<ol class="seo-admin-grid">'+cards+'</ol>':'<div class="seo-admin-empty">No hay comparaciones en este filtro.</div>')+
  '<p class="seo-admin-disclaimer">Las páginas aptas se incluyen en el sitemap. Google decide si las indexa.</p></div>';
}
router.get('/admin/comparador',requireAdmin,async(req,res,next)=>{
 try{
  await ensureSchema();
  const r=await db.query("SELECT id,slug,query_text,index_approved,seo_blocked,editorial_summary,provider_status,last_checked_at,external_results,jsonb_array_length(external_results) AS external_count FROM marketplace_compare_pages ORDER BY created_at DESC LIMIT 60");
  const token=issueCsrf(req,res);
  const filter=typeof req.query?.estado==='string'?req.query.estado:'todas';
  const quota=await compareWorker.quotaStatus();
  const keys=linkDiagnostics.keysToCheck(r.rows);
  const found=keys.length?await db.query(
   "SELECT offer_key,status,href,checked_at FROM marketplace_compare_merchant_links WHERE offer_key=ANY($1::varchar[])",[keys]
  ):{rows:[]};
  const merchantCache=new Map(found.rows.map(item=>[item.offer_key,item]));
  const pageIds=r.rows.map(item=>item.id);
  const reviewed=pageIds.length?await db.query(
   "SELECT page_id,offer_key,href,reviewed_at FROM marketplace_compare_manual_links WHERE page_id=ANY($1::bigint[])",[pageIds]
  ):{rows:[]};
  const manualCache=new Map(reviewed.rows.map(item=>[item.page_id+':'+item.offer_key,item]));
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('SEO del comparador | RedLibertad','Gestión privada de indexación',
    seoAdminView(r.rows,token,filter,quota,merchantCache,manualCache),'/admin/comparador'));
 }catch(e){next(e);}
});
// La revisión humana no añade ofertas ni convierte esta ficha en apta para SEO.
router.post('/admin/comparador/:id/enlace',requireAdmin,
 rateLimit({windowMs:60*60*1000,limit:25,standardHeaders:'draft-7',legacyHeaders:false}),
 async(req,res,next)=>{
 try{
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Vuelve al panel.');
  const id=String(req.params.id||''),key=req.body?.offer_key,action=req.body?.action;
  if(!/^[1-9]\d{0,15}$/.test(id)||!manualLinks.validIdentity(key)||!['save','remove'].includes(action))
   return res.sendStatus(400);
  await ensureSchema();
  const result=await db.query("SELECT id,query_text,external_results FROM marketplace_compare_pages WHERE id=$1",[id]);
  if(!result.rowCount)return res.sendStatus(404);
  const offer=manualLinks.findOffer(result.rows[0],key);
  if(!offer)return res.sendStatus(404); // No permitir enlazar modelos de otra gama ni anuncios inexistentes.
  if(action==='remove'){
   await db.query("DELETE FROM marketplace_compare_manual_links WHERE page_id=$1 AND offer_key=$2",[id,key]);
  }else{
   if(req.body?.confirmed!=='yes')return res.status(400).send('Confirma que revisaste la oferta y su URL.');
   const url=manualLinks.merchantUrl(req.body?.url,offer.shop);
   if(!url)return res.status(400).send('Introduce una URL HTTPS del producto, en el dominio real de la tienda indicada, sin redirecciones ni credenciales.');
   await db.query(
    "INSERT INTO marketplace_compare_manual_links(page_id,offer_key,href,reviewed_at) VALUES($1,$2,$3,now()) "+
    "ON CONFLICT(page_id,offer_key) DO UPDATE SET href=EXCLUDED.href,reviewed_at=now()",
    [id,key,url]
   );
  }
  return res.redirect(303,'/admin/comparador?enlace='+(action==='save'?'guardado':'retirado')+'#comparacion-'+id);
 }catch(e){next(e);}
});
router.post('/admin/comparador/:id/seo',requireAdmin,async(req,res,next)=>{
 try{
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Vuelve al panel.');
  const id=String(req.params.id||''),action=String(req.body?.action||'');
  if(!/^[1-9]\d{0,15}$/.test(id))return res.sendStatus(400);
  await ensureSchema();
  if(action==='revoke'){
   await db.query("UPDATE marketplace_compare_pages SET index_approved=false,seo_blocked=true,updated_at=now() WHERE id=$1",[id]);
  }else if(action==='unblock'){
   await db.query("UPDATE marketplace_compare_pages SET seo_blocked=false,updated_at=now() WHERE id=$1",[id]);
  }else if(action==='approve'){
   const summary=String(req.body?.summary||'').trim().replace(/\s+/g,' ');
   if(summary.length<80||summary.length>2000)return res.status(400).send('El comentario original debe tener entre 80 y 2000 caracteres.');
   const r=await db.query(
    "UPDATE marketplace_compare_pages SET editorial_summary=$2,index_approved=true,seo_blocked=false,updated_at=now() "+
    "WHERE id=$1 AND query_text ~ '[0-9]' AND btrim(query_text) LIKE '% %' AND provider_status='ok' "+
    "AND last_checked_at>now()-interval '48 hours' "+
    "AND (SELECT COUNT(*) FROM jsonb_array_elements(external_results) o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2 "+
    "AND (SELECT COUNT(DISTINCT lower(trim(o->>'shop'))) FROM jsonb_array_elements(external_results) o WHERE COALESCE(o->>'sponsored','false')<>'true')>=2 RETURNING id",
    [id,summary]
   );
   if(!r.rowCount)return res.status(409).send('La ficha no cumple las condiciones mínimas de ofertas actuales.');
  }else return res.sendStatus(400);
  res.redirect(303,'/admin/comparador');
 }catch(e){next(e);}
});

// Consulta voluntaria: solo al pulsar, nunca durante el render o el sondeo.
// Cada intento consume como máximo una consulta autorizada de Google Product API.
router.post('/comparar/tienda/:slug/:offerKey',
 rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),
 async(req,res,next)=>{
 try{
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Vuelve al comparador.');
  const {slug,offerKey:hash}=req.params;
  if(!/^[a-z0-9-]{4,120}$/.test(slug)||!/^[a-f0-9]{64}$/.test(hash))return res.sendStatus(404);
  await ensureSchema();
  const p=await db.query('SELECT slug,external_results FROM marketplace_compare_pages WHERE slug=$1',[slug]);
  if(!p.rowCount)return res.sendStatus(404);
  const list=Array.isArray(p.rows[0].external_results)?p.rows[0].external_results:[];
  const offer=list.find(o=>o&&!o.internal&&offerKey(o)===hash);
  if(!offer)return res.sendStatus(404);
  const existing=provider.resolveOfferLink(offer);
  if(existing?.destination==='store')return res.redirect(303,existing.href);
  const returnLink='/comparar/'+slug;
  function explain(){
   // Un error o ausencia de URL externa no debe crear una página muerta.
   return res.redirect(303,returnLink+'?enlace=sin-verificar#precios-y-tiendas');
  }
  if(!provider.canLookupSeller(offer)||!provider.configured()||!provider.hasProductReference(offer))return explain();
  const cached=await db.query("SELECT status,href FROM marketplace_compare_merchant_links WHERE offer_key=$1 AND checked_at>now()-interval '24 hours' AND (status!='checking' OR checked_at>now()-interval '2 minutes')",[hash]);
  if(cached.rowCount){
   const current=cached.rows[0];
   if(current.status==='ok'&&current.href){
    const resolved=provider.resolveOfferLink({...offer,resolved_href:current.href});
    if(resolved?.destination==='store')return res.redirect(303,resolved.href);
   }
   if(current.status==='checking')return explain('Ya se está comprobando este comercio. Puedes volver al comparador.');
   return explain('No hemos podido verificar un enlace directo para esta oferta. El enlace de Google Shopping es una alternativa.');
  }
  const locked=await db.query(
   "INSERT INTO marketplace_compare_merchant_links(offer_key,status,checked_at) VALUES($1,'checking',now()) "+
   "ON CONFLICT(offer_key) DO UPDATE SET status='checking',href=NULL,checked_at=now() "+
   "WHERE marketplace_compare_merchant_links.checked_at<now()-interval '24 hours' "+
   "OR (marketplace_compare_merchant_links.status='checking' AND marketplace_compare_merchant_links.checked_at<now()-interval '2 minutes') "+
   "RETURNING offer_key",[hash]
  );
  if(!locked.rowCount)return explain('Esta tienda ya se está comprobando. Vuelve a intentarlo después.');
  if(!await compareWorker.reserveQuota()){
   // No penalizar esta oferta 24 horas: el presupuesto puede renovarse antes.
   await db.query("DELETE FROM marketplace_compare_merchant_links WHERE offer_key=$1 AND status='checking'",[hash]);
   return explain('Se ha alcanzado el límite compartido de consultas de SerpApi. Podrás comprobar este vendedor cuando se renueve la cuota; no se ha realizado otra consulta.');
  }
  try{
   const result=await provider.fetchDirectRetailer(offer);
   await db.query("UPDATE marketplace_compare_merchant_links SET status=$2,href=$3,checked_at=now() WHERE offer_key=$1",
    [hash,result?'ok':'unavailable',result?.href||null]);
   if(result)return res.redirect(303,result.href);
   return explain('No hemos encontrado una página directa de esa tienda que coincida con el precio del producto. No mostraremos una dirección sin verificar.');
  }catch(error){
   console.warn('Comparador direct seller:',String(error?.message||'lookup_error').slice(0,70));
   await db.query("UPDATE marketplace_compare_merchant_links SET status='unavailable',href=NULL,checked_at=now() WHERE offer_key=$1",[hash]);
   return explain('El proveedor no ha podido verificar ahora mismo el enlace de esta oferta.');
  }
 }catch(error){next(error);}
});
router.get('/comparar/:slug',async(req,res,next)=>{
 try{
  const slug=String(req.params.slug||'');
  if(!/^[a-z0-9-]{4,120}$/.test(slug))return res.sendStatus(404);
  await ensureSchema();
  const result=await db.query('SELECT * FROM marketplace_compare_pages WHERE slug=$1',[slug]);
  if(!result.rowCount)return res.sendStatus(404);
  const page=result.rows[0];
  if(await compareWorker.enqueue(page,ensureSchema))page.provider_status='queued';
  const local=await localOffers(page.query_text);
  const external=Array.isArray(page.external_results)?page.external_results.filter(o=>o&&!o.internal&&safeHref(o.href)&&Number.isSafeInteger(o.price_cents)&&o.price_cents>0):[];
  // Aplicar el mismo filtro también a ofertas antiguas ya guardadas.
  // Así una búsqueda base «iPhone 12 128 GB» no anunciará el precio del Pro
  // ni requiere volver a gastar créditos de SerpApi.
  const offers=[...local,...external].filter(o=>provider.titleMatches(page.query_text,o.title))
   .sort((a,b)=>a.price_cents-b.price_cents);
  await attachCachedMerchantLinks(offers);
  await attachManualMerchantLinks(page,offers);
  const insight=insights.buildInsights(page.query_text,offers);
  const history=seo.auto.capacity(page.query_text)?
   await db.query("SELECT checked_day::text AS checked_day,low_price_cents,shop_count FROM marketplace_compare_price_history WHERE page_id=$1 AND checked_day>=CURRENT_DATE-INTERVAL '180 days' ORDER BY checked_day DESC LIMIT 6",[page.id]):{rows:[]};
  const quota=offers.some(o=>!o.internal && provider.canLookupSeller(o) && provider.hasProductReference(o))?
   await compareWorker.quotaStatus():null;
  const freshness=priceFreshness.freshness(page.last_checked_at);
  const priceInfo=priceFreshness.priceNotice(page.last_checked_at,page.provider_status);
  // Solo describimos la antigüedad de resultados externos: las publicaciones
  // propias de RedLibertad se consultan en la base de datos al abrir la página.
  const hasExternal=offers.some(o=>!o.internal);
  const checked=hasExternal?priceInfo.date:null;
  const priceWarning=hasExternal && (freshness.needsRefresh||page.provider_status==='unavailable'||page.provider_status==='limit_reached')?
   '<aside class="compare-price-age compare-price-age-'+esc(priceInfo.level)+'" role="status">'+esc(priceInfo.text)+'</aside>':'';
  const externalPriceInfo={...priceInfo,isStale:freshness.isStale};
  const exact=provider.isSpecificModel(page.query_text);
  const approved=seo.indexEligible(page,offers);
  const title='Comparar '+page.query_text+' | RedLibertad';
  const automatic=seo.auto.eligibleOffers(page,offers);
  const factualSummary=automatic.eligible?seo.auto.autoSummary(page,automatic):null;
  const description=(factualSummary||String(page.editorial_summary||'')||('Compara ofertas para '+page.query_text+' en España. Consulta vendedores y precios orientativos.')).slice(0,155);
  const csrfToken=issueCsrf(req,res);
  const pending=['queued','checking'].includes(page.provider_status);
  const bestOffer=offers.length?offers[0]:null;
  const best=bestOffer?.price_cents??null;
  const bestCondition=bestOffer?insights.conditionOf(bestOffer):null;
  const singleOffer=offers.length===1;
  const status=singleOffer?
   '<section class="compare-single-status" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+priceWarning+
   '<span>1 oferta coincidente</span>'+(checked?'<time>Precios consultados: '+esc(checked)+'</time>':'')+'</section>':
   offers.length?
   '<section class="info compare-status-summary" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+priceWarning+
   '<div class="compare-status-head"><h2>Precios encontrados</h2>'+
   (checked?'<span>Precios consultados: '+esc(checked)+'</span>':'')+'</div>'+
   '<p class="cmp-start-price"><strong>'+(bestOffer&&!bestOffer.internal&&freshness.isStale?'Último mínimo registrado: ':'Desde ')+money(best)+'</strong>'+
   (bestCondition && bestCondition!=='Estado sin confirmar'?' · '+esc(bestCondition.toLowerCase()):'')+
   ' · '+offers.length+' '+(offers.length===1?'oferta':'ofertas')+
   (insight.hasMixedVariants?' en varias versiones y estados':'')+'</p>'+
   '</section>':
   '<section class="compare-awaiting" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+
   '<div class="compare-awaiting-icon" aria-hidden="true">⌕</div>'+
   '<h2>'+(pending?'Buscando ofertas para tu producto':page.provider_status==='ok'?'Todavía no encontramos ofertas':'Estamos preparando esta comparación')+'</h2>'+
   '<p>'+(pending?'Estamos consultando los precios disponibles. Los resultados aparecerán aquí cuando termine la búsqueda.':
     page.provider_status==='ok'?'Prueba con un modelo diferente o una búsqueda más general.':
     'Esta página está guardada. Puedes volver más tarde o explorar otras comparaciones.')+'</p>'+
   '<a class="compare-awaiting-link" href="/comparar">Ver otras comparaciones</a>'+
   '</section>';
  const cards=offers.length?'<ol class="comparison-list">'+offers.map((o,i)=>offerMarkup(o,i,offers.length,slug,csrfToken,quota,o.internal?null:externalPriceInfo)).join('')+'</ol>':'';
  const results=singleOffer?
   '<section class="compare-single-product" data-comparison-results aria-labelledby="precios-y-tiendas">'+
   '<h2 id="precios-y-tiendas">'+(hasExternal&&freshness.isStale?'Oferta guardada':'Oferta encontrada')+'</h2>'+
   (req.query?.enlace==='sin-verificar'?'<p class="compare-merchant-notice" role="status">No se ha podido confirmar un enlace directo para esa oferta. Puedes utilizar «Buscar en Google» para consultar otras opciones.</p>':'')+
   cards+
   '<p class="compare-help">Solo tenemos una oferta coincidente. El precio, la disponibilidad y el envío se confirman con el vendedor.</p></section>':
   offers.length?
   '<section data-comparison-results>'+insightsMarkup(page.query_text,insight)+historyMarkup(history.rows)+
   '<h2 id="precios-y-tiendas">'+(exact?'Precios y tiendas':'Productos y modelos relacionados')+'</h2>'+
   (req.query?.enlace==='sin-verificar'?'<p class="compare-merchant-notice" role="status">No se ha podido confirmar un enlace directo para esa oferta. Puedes utilizar «Buscar en Google» para consultar otras opciones.</p>':'')+
   (!insight.variants.length?'<p class="compare-guide">Comprueba el modelo y su estado antes de comprar.</p>':'')+
   cards+
   '<p class="compare-help">Precio final y envío a confirmar en la tienda. Si no hay enlace directo, la búsqueda de Google puede mostrar otras ofertas, no necesariamente el mismo anuncio.</p></section>':
   '<section data-comparison-results aria-label="Ofertas pendientes"></section>';
  const content='<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / <a href="/comparar">Comparador</a></p>'+
   '<h1>Comparar precios de '+esc(page.query_text)+'</h1>'+
   '<p class="cmp-page-subtitle">Ofertas en tiendas españolas · página permanente</p>'+
   formMarkup('',page.query_text,csrfToken)+
   (approved&&(factualSummary||page.editorial_summary)?'<section class="info"><h2>Comparación de precios</h2><p>'+esc(factualSummary||page.editorial_summary)+'</p></section>':'')+
   '<div data-comparison-status-wrapper>'+status+'</div>'+results+
   (pending?'<p><a class="offer-link" href="/comparar/'+esc(slug)+'">Actualizar resultados manualmente</a></p>':'');
  res.set('Cache-Control','private,no-store');
  res.send(shell(title,description,content,'/comparar/'+slug,approved,seo.structuredData(page,offers,approved,'/comparar/'+slug)));
 }catch(e){next(e);}
});
// Sitemap sincronizado con las condiciones index/noindex del render HTML.
// Crear una búsqueda nunca implica publicarla en Google.
router.get('/sitemap-comparador.xml',async(_req,res,next)=>{
 try{
  await ensureSchema();
  const result=await db.query(
   "SELECT slug,query_text,index_approved,seo_blocked,editorial_summary,external_results,provider_status,last_checked_at,updated_at "+
   "FROM marketplace_compare_pages WHERE seo_blocked=false AND provider_status='ok' "+
   "AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=2 "+
   "ORDER BY updated_at DESC LIMIT 2000"
  );
  const urls=['<url><loc>'+esc(ORIGIN+'/comparar')+'</loc></url>'];
  for(const p of result.rows){
   if(!seo.indexEligible(p,p.external_results))continue;
   urls.push('<url><loc>'+esc(ORIGIN+'/comparar/'+p.slug)+'</loc><lastmod>'+
    new Date(p.updated_at||p.last_checked_at).toISOString()+'</lastmod></url>');
  }
  res.set('Cache-Control','public,max-age=300');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>');
 }catch(e){next(e);}
});
module.exports={router,cleanQuery,queryKey,slugFor,parseExternal,safeHref,ensureSchema,localOffers,seoAdminView,seoRefinementSuggestions,issueCsrf,validCsrf,csrfName,startBackgroundWorker:()=>compareWorker.start(ensureSchema),stopBackgroundWorker:compareWorker.stop};
