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
const directAccess=require('../services/marketplace-comparador-direct-access-v3439');
const {describeDestination}=require('../services/marketplace-comparador-destinations-v3449');
const offerFilters=require('../services/marketplace-comparador-offer-filters-v3440');
const manualLinks=require('../services/marketplace-comparador-manual-links-v32147');
const priceFreshness=require('../services/marketplace-comparador-price-freshness-v32148');
const priceSource=require('../services/marketplace-comparador-price-source-v34413');
const productDetail=require('../services/marketplace-comparador-product-detail-v3418');
const photoReview=require('../services/marketplace-comparador-photo-review-v3441');
const offerQuality=require('../services/marketplace-comparador-offer-quality-v3419');
const {uniqueOffers}=require('../services/marketplace-comparador-offer-dedupe-v3446');
const {splitPaidOffers}=require('../services/marketplace-comparador-sponsored-v3447');
const {requireAdmin,requireAuth,optionalAuth}=require('../middleware/auth');
const {enrichLocalOffers}=require('../services/marketplace-comparador-merchant-offers-v3421');
const merchantClicks=require('../services/marketplace-comparador-clicks-v3422');
const merchantFollowup=require('../services/marketplace-comparador-merchant-followup-v3424');
const {sellerProgress}=require('../services/marketplace-comparador-merchant-guide-v3425');
const merchantWoo=require('../services/marketplace-woocommerce-v3277');
const catalogDiagnostics=require('../services/marketplace-comparador-catalog-diagnostics-v3429');
const {recentImage,recentFallback}=require('../services/marketplace-comparador-recent-images-v3432');
const {PLATFORMS,normalizeStoreUrl}=require('../services/marketplace-professional-v3276');
const {ensureProfessionalSchema}=require('./marketplace-professional-v3276');
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
   await db.query("CREATE TABLE IF NOT EXISTS marketplace_compare_photo_reviews (page_id BIGINT PRIMARY KEY REFERENCES marketplace_compare_pages(id) ON DELETE CASCADE, offer_key VARCHAR(64) NOT NULL, image_url TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now())");
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
 // Solo tiendas profesionales ya aprobadas, enlaces del mismo dominio y stock válido.
 // Es la misma base de datos: no crea un catálogo paralelo ni consume SerpApi.
 if(!rows.rows.length)return [];
 await ensureProfessionalSchema();
 const linked=await db.query(
  "SELECT x.listing_id,x.store_id,x.product_url,x.stock_status,x.source,x.last_checked_at,"+
  "s.name AS store_name,s.store_url,s.status AS store_status,s.purchase_enabled "+
  "FROM marketplace_external_products x JOIN marketplace_professional_stores s ON s.id=x.store_id "+
  "WHERE x.listing_id=ANY($1::bigint[]) AND x.seller_id=s.seller_id AND s.status='approved' AND s.purchase_enabled=true",
  [rows.rows.map(row=>row.id)]);
 return enrichLocalOffers(rows.rows,linked.rows);
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
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+robots+'"><meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"'+esc(title)+'\"><meta property=\"og:description\" content=\"'+esc(description)+'\"><meta property=\"og:url\" content=\"'+esc(ORIGIN+canonical)+'\"><meta name=\"twitter:card\" content=\"summary\">'+(structured?'<script type=\"application/ld+json\">'+seo.jsonLd(structured)+'</script>':'')+'<link rel="canonical" href="'+esc(ORIGIN+canonical)+'"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><style>'+styles+'</style><link rel="stylesheet" href="/comparador-v32135.css"><link rel="stylesheet" href="/comparador-premium-v3431.css"><script defer src="/comparador-v32135.js"></script></head><body class="cmp-premium"><a class="cmp-skip" href="#contenido">Saltar al contenido</a><header class="cmp-site-header"><nav class="cmp-site-nav" aria-label="Navegación del comparador"><a class="cmp-brand" href="/comparar" aria-label="RedLibertad, comparador"><img class="cmp-brand-logo" src="/assets/logo-mark.svg" width="44" height="44" alt="" decoding="async"><span class="cmp-brand-copy">RedLibertad <span>· Comparador</span></span></a><div class="cmp-top-links"><a href="/comparar">Comparar</a><a href="/comparar/comercios/tiendas">Tiendas</a><a href="/comparar/comercios" class="cmp-top-cta">Para comercios</a></div></nav></header><main id="contenido">'+body+'</main><footer class="cmp-site-footer"><div class="cmp-footer-inner"><nav aria-label="Enlaces de pie de página"><a href="/marketplace/explorar">Marketplace</a><a href="/comparar">Comparador</a><a href="/comparar/comercios/tiendas">Tiendas participantes</a><a href="/comparar/comercios">Añadir una tienda</a></nav><p>Precios orientativos · Compra siempre en la tienda del vendedor.</p></div></footer></body></html>';
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
 // Los comercios aprobados tienen una URL real de compra aunque la oferta
 // proceda de un anuncio local. No etiquetarla como búsqueda de Google.
 const merchant=directAccess.isDirectStore(o);
 const link=o.partner_store?(merchant?{href:o.href,destination:'store'}:null):
  o.internal?{href:o.href,destination:'internal'}:provider.resolveOfferLink(o);
 if(!link||!link.href)return '';
 const href=link.href;
 const img=o.internal?/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||'')?o.image:null:provider.safeImage(o.image);
 // Imagen decorativa: dimensiones reservadas y marcador legible cuando no existe.
 const picture=img?'<img class="offer-photo" src="'+esc(img)+'" alt="" width="110" height="108" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'<div class="offer-noimage" aria-hidden="true">Sin fotografía</div>';
 const shop=String(o.shop||'Tienda no identificada');
 const directFlag=merchant?'direct':'alternate';
 const tags=offerFilters.attributes(o);
 // Etiquetas breves basadas en la clasificación de la oferta; no confirman su estado.
 const states={nuevo:'Nuevo · según anuncio',usado:'Usado · según anuncio',
  reacondicionado:'Reacondicionado · según anuncio','sin-confirmar':'Estado sin confirmar'};
 const stateLabel=states[tags.condition]||states['sin-confirmar'];
 const stateHelp=tags.condition==='sin-confirmar'?'Estado no verificado':
  'Estado declarado por el vendedor; compruébalo antes de comprar';
 const dest=link.destination==='internal'?'Ver anuncio':merchant?'Ver oferta en tienda':'Buscar en Google';
 const destinationInfo=describeDestination(o,link,merchant);
 const note=destinationInfo.note;
 const shipping=o.delivery?'<small>🚚 '+esc(o.delivery)+'</small>':'';
 const possible=link.destination==='shopping-search' && provider.canLookupSeller(o) &&
   !['unavailable','checking'].includes(o.lookup_status) && provider.hasProductReference(o);
 const candidate=possible && quota?.available!==false;
 const lookup=candidate?'<form class="offer-lookup" method="post" action="/comparar/tienda/'+esc(slug)+'/'+offerKey(o)+'"><input type="hidden" name="_csrf" value="'+esc(csrfToken)+'"><button class="offer-link" type="submit">Consultar enlace de la tienda</button></form>':
   (o.lookup_status==='unavailable'&&link.destination==='shopping-search'?
    '<p class="offer-lookup-feedback" role="status">No se ha confirmado un enlace directo de esta oferta.</p>':'');
 const clickToken=o.partner_store?merchantClicks.proof(o.partner_store_id,o.listing_id):null;
 const clickAttrs=clickToken?' data-comparison-merchant-click="1" data-store-id="'+esc(o.partner_store_id)+'" data-listing-id="'+esc(o.listing_id)+'" data-proof="'+clickToken+'"':'';
 const provenance=priceSource.sourceLabel(o,priceInfo);
 // Enlace permanente a ESTA tarjeta, no al vendedor; no enviar URLs externas al compartir.
 const share=index>=0?'<a class="cmp-share-offer" data-share-comparison-offer href="'+
  esc('/comparar/'+slug+'#oferta-'+offerKey(o))+'" aria-label="'+esc('Compartir esta oferta de '+shop)+'">Compartir esta oferta</a>'+
  '<small class="cmp-share-feedback" data-share-offer-feedback role="status" hidden></small>':'';
 const pricing=o.internal?'':priceInfo?.date?
   '<small class="offer-price-date'+(priceInfo.isStale?' offer-price-old':'')+'">'+
   esc((priceInfo.isStale?'Último precio guardado: ':'Precio consultado: ')+priceInfo.date)+'</small>':
   '<small class="offer-price-date offer-price-old">Sin fecha de precio externo</small>';
 return '<li class="offer" data-offer-access="'+directFlag+'" data-offer-condition="'+tags.condition+'" data-offer-capacity="'+tags.capacity+'" data-offer-price-cents="'+(Number.isSafeInteger(o.price_cents)&&o.price_cents>0?o.price_cents:'')+'" id="oferta-'+offerKey(o)+'">'+(index===0&&total>1?'<span class="best-offer">'+(priceInfo?.isStale?'Mínimo de la consulta anterior':'Precio más bajo mostrado')+'</span>':'')+(o.sponsored?'<span class="offer-sponsored">Publicidad</span>':'')+
  picture+'<div class="offer-main">'+(merchant?'<span class="cmp-direct-tag">Acceso directo a tienda</span>':'')+'<strong>'+esc(o.title)+'</strong><div class="cmp-offer-meta"><small class="cmp-offer-shop">'+esc(shop)+'</small>'+
  '<span class="cmp-condition-chip cmp-condition-'+tags.condition+'" title="'+esc(stateHelp)+'">'+esc(stateLabel)+'</span></div>'+shipping+
  '</div><div class="offer-side"><div class="price">'+money(o.price_cents)+'</div>'+
  '<small class="cmp-price-source">'+esc(provenance)+'</small>'+pricing+
  lookup+'<a class="offer-link'+(link.destination==='shopping-search'?' offer-search-backup':'')+'" href="'+esc(href)+'" aria-label="'+esc(destinationInfo.ariaLabel)+'"'+clickAttrs+(o.internal&&!o.partner_store?'':' target="_blank" rel="noopener noreferrer nofollow'+(o.sponsored?' sponsored':'')+'"')+'>'+dest+'</a>'+
  (note?'<span class="offer-destination">'+note+'</span>':'')+share+'</div></li>';
}
function nonComparableMarkup(accessories,review,slug,csrfToken,priceInfo){
 const sections=[];
 for(const [items,kind,title,advice] of [
  [accessories,'accessory','Accesorios relacionados','Estas ofertas describen accesorios. Sus precios no corresponden al teléfono buscado.'],
  [review,'review','Ofertas por verificar','No se ha podido confirmar que estos anuncios correspondan al teléfono o su precio parece atípico. Comprueba el producto y su estado.']
 ]){
  if(!items.length)continue;
  const rows=items.map(o=>'<li class="cmp-noncomparable-item">'+
   '<small>'+esc(o.quality_reason||'Revisar oferta')+'</small>'+
   '<ol class="comparison-list">'+offerMarkup(o,-1,0,slug,csrfToken,null,o.internal?null:priceInfo)+'</ol></li>').join('');
  sections.push('<section class="cmp-noncomparable-section cmp-'+kind+'-section"><details>'+
   '<summary>'+title+' ('+items.length+')</summary><p>'+advice+'</p>'+
   '<ul class="cmp-noncomparable-list">'+rows+'</ul></details></section>');
 }
 return sections.join('');
}
function repairOffersMarkup(offers,slug,csrfToken,priceInfo){
 if(!offers.length)return '';
 const count=offers.length;
 return '<section class="cmp-repair-section" aria-labelledby="cmp-repair-title"><details>'+
  '<summary id="cmp-repair-title">Ver '+count+' '+(count===1?'anuncio averiado o para piezas':'anuncios averiados o para piezas')+'</summary>'+
  '<p class="cmp-repair-advice">Estas ofertas declaran una avería o venta para piezas. No se incluyen en el precio mínimo del producto para uso normal. Comprueba las condiciones con el vendedor.</p>'+
  '<ol class="comparison-list">'+offers.map(o=>offerMarkup(o,-1,0,slug,csrfToken,null,o.internal?null:priceInfo)).join('')+'</ol>'+
  '</details></section>';
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
  const recent=await db.query("SELECT slug,query_text,jsonb_array_length(external_results) AS offer_count,external_results FROM marketplace_compare_pages WHERE jsonb_array_length(external_results)>0 AND provider_status IN ('ok','limit_reached','unavailable') ORDER BY last_checked_at DESC NULLS LAST,created_at DESC LIMIT 12");
  const potential=await db.query("SELECT slug,query_text,external_results,provider_status,last_checked_at,index_approved,editorial_summary,seo_blocked FROM marketplace_compare_pages WHERE provider_status='ok' AND seo_blocked=false AND last_checked_at>now()-interval '48 hours' AND jsonb_array_length(external_results)>=2 ORDER BY updated_at DESC LIMIT 400");
  const indexed=potential.rows.filter(p=>seo.indexEligible(p,p.external_results)).slice(0,8).map(p=>'<li><a href="/comparar/'+esc(p.slug)+'">'+esc(p.query_text)+'</a></li>').join('');
  const items=recent.rows.map(p=>{
   const photo=recentImage(p.query_text,p.external_results);
   const image=photo?'<img src="'+esc(photo)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="82" height="82">':
    '<img src="'+esc(recentFallback(p.query_text))+'" alt="" loading="lazy" width="82" height="82">';
   return '<li class="cmp-recent-card"><a href="/comparar/'+esc(p.slug)+'">'+
    '<span class="cmp-recent-image">'+image+'</span><span class="cmp-recent-copy"><strong>'+esc(p.query_text)+'</strong>'+
    '<small>'+Number(p.offer_count)+' ofertas guardadas</small></span></a></li>';
  }).join('');
  const csrfToken=issueCsrf(req,res);
  res.set('Cache-Control','private,no-store');
  res.send(shell('Comparador de precios | RedLibertad','Busca un producto y consulta páginas de comparación guardadas en RedLibertad.',
   '<p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / Comparador</p>'+
   '<section class="cmp-home-hero" aria-labelledby="cmp-home-title">'+
   '<span class="cmp-home-eyebrow">RedLibertad · Compara antes de comprar</span>'+
   '<h1 id="cmp-home-title">Comparador de precios</h1>'+
   '<p class="cmp-home-subtitle">Encuentra ofertas, compara tiendas y comprueba el estado del producto antes de decidir.</p>'+ 
   '<img class="cmp-home-art" src="/assets/comparador-hero-v3432.svg" width="470" height="330" alt="" decoding="async" aria-hidden="true">'+
   formMarkup('',cleanQuery(req.query?.q)||'',csrfToken)+
   '<p class="cmp-home-trust"><span>Precios por producto y estado</span><span>Enlaces a vendedores</span><span>Comparaciones guardadas</span></p></section>'+
   '<p class="cmp-commerce-cta"><a href="/comparar/comercios/tiendas">Explorar tiendas participantes</a><span class="cmp-cta-sep">·</span>¿Tienes una tienda? <a href="/comparar/comercios">Añádela gratis</a></p>'+
   '<section class="info cmp-home-panel" aria-labelledby="cmp-recent-title"><span class="cmp-section-eyebrow">Explora productos</span>'+
   '<h2 id="cmp-recent-title">Comparaciones recientes</h2>'+
   (items?'<p class="cmp-section-note">Búsquedas guardadas con ofertas; consulta la ficha para ver precios y disponibilidad.</p><ul class="compare-recent-list">'+items+'</ul>':
   '<p>Todavía no hay comparaciones con ofertas guardadas.</p>')+'</section>'+
   (indexed?'<section class="info cmp-home-panel"><span class="cmp-section-eyebrow">Fichas públicas</span><h2>Comparaciones seleccionadas</h2>'+
   '<p class="cmp-section-note">Preparadas para indexación; Google decide si aparecen en sus resultados.</p>'+
   '<ul class="compare-recent-list">'+indexed+'</ul></section>':'')+
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
   '</details></div><p><a href="/admin/comparador/fotos/'+esc(p.slug)+'">Revisar fotografía principal</a></p>'+linkDiagnosticsMarkup(p,merchantCache,quota,manualCache,token)+'</li>';
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
// V3.4.4.1: moderación de fotografías existentes, sin uploads ni búsquedas externas.
router.get('/admin/comparador/fotos/:slug',requireAdmin,async(req,res,next)=>{
 try{
  const slug=String(req.params.slug||'');
  if(!/^[a-z0-9-]{4,120}$/.test(slug))return res.sendStatus(404);
  await ensureSchema();
  const result=await db.query('SELECT id,slug,query_text,external_results FROM marketplace_compare_pages WHERE slug=$1',[slug]);
  if(!result.rowCount)return res.sendStatus(404);
  const page=result.rows[0],photos=photoReview.candidates(page);
  const selected=await db.query('SELECT offer_key,image_url,reviewed_at FROM marketplace_compare_photo_reviews WHERE page_id=$1',[page.id]);
  const active=selected.rows[0]||null;
  const token=issueCsrf(req,res);
  const cards=photos.map(o=>'<li class="cmp-review-image-card"><img src="'+esc(o.image)+'" alt="'+esc(o.title)+'" loading="lazy" referrerpolicy="no-referrer" width="150" height="150">'+
   '<div><strong>'+esc(o.title)+'</strong><small>'+esc(o.shop)+'</small>'+
   (active?.offer_key===o.key&&active.image_url===o.image?'<span>Seleccionada actualmente</span>':'')+
   '<form method="post" action="/admin/comparador/'+page.id+'/foto">'+
   '<input type="hidden" name="_csrf" value="'+esc(token)+'">'+
   '<input type="hidden" name="offer_key" value="'+esc(o.key)+'">'+
   '<label><input type="checkbox" name="confirmed" value="yes" required> He revisado la imagen y corresponde al modelo buscado</label>'+
   '<button type="submit" name="action" value="approve">Seleccionar esta fotografía</button></form></div></li>').join('');
  const content='<div class="cmp-commerce-intro cmp-photo-review">'+
   '<p class="crumb"><a href="/admin/comparador">Administración</a> / Fotografías</p>'+
   '<h1>Revisar fotografías: '+esc(page.query_text)+'</h1>'+
   '<p>Solo imágenes de anuncios guardados que coinciden con la búsqueda. Comprueba visualmente que no se trate de una funda, caja u otro producto. Las imágenes externas pueden cambiar.</p>'+
   (active?'<p class="cmp-review-current">Hay una fotografía seleccionada. Si la oferta cambia o desaparece, no se utilizará como imagen aprobada.</p>'+
   '<form method="post" action="/admin/comparador/'+page.id+'/foto">'+
   '<input type="hidden" name="_csrf" value="'+esc(token)+'">'+
   '<button type="submit" name="action" value="remove">Retirar fotografía aprobada</button></form>':'')+
   (cards?'<ul class="cmp-review-images">'+cards+'</ul>':'<p>No hay fotografías candidatas para este modelo.</p>')+
   '<p><a href="/admin/comparador">Volver a Administración</a></p></div>';
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Revisión de fotos | RedLibertad','Revisión privada de fotografías.',content,'/admin/comparador/fotos/'+slug));
 }catch(error){next(error);}
});
router.post('/admin/comparador/:id/foto',requireAdmin,
 rateLimit({windowMs:60*60*1000,limit:25,standardHeaders:'draft-7',legacyHeaders:false}),
 async(req,res,next)=>{
 try{
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  if(!validCsrf(req))return res.sendStatus(403);
  const id=String(req.params.id||''),action=req.body?.action;
  if(!/^[1-9]\d{0,15}$/.test(id)||!['approve','remove'].includes(action))return res.sendStatus(400);
  await ensureSchema();
  const row=await db.query('SELECT id,slug,query_text,external_results FROM marketplace_compare_pages WHERE id=$1',[id]);
  if(!row.rowCount)return res.sendStatus(404);
  const page=row.rows[0];
  if(action==='remove'){
   await db.query('DELETE FROM marketplace_compare_photo_reviews WHERE page_id=$1',[id]);
  }else{
   if(req.body?.confirmed!=='yes')return res.status(400).send('Confirma que has revisado la fotografía.');
   const candidate=photoReview.candidates(page).find(o=>o.key===req.body?.offer_key);
   if(!candidate)return res.status(400).send('La fotografía no pertenece a una oferta vigente de ese modelo.');
   await db.query(
    'INSERT INTO marketplace_compare_photo_reviews(page_id,offer_key,image_url,reviewed_at) VALUES($1,$2,$3,now()) '+
    'ON CONFLICT(page_id) DO UPDATE SET offer_key=EXCLUDED.offer_key,image_url=EXCLUDED.image_url,reviewed_at=now()',
    [id,candidate.key,candidate.image]
   );
  }
  res.redirect(303,'/admin/comparador/fotos/'+page.slug);
 }catch(error){next(error);}
});
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
  const asynchronous=req.get('X-Requested-With')==='XMLHttpRequest' && req.accepts('json');
  function sellerFound(href){
   if(asynchronous)return res.json({ok:true,href});
   return res.redirect(303,href);
  }
  const existing=provider.resolveOfferLink(offer);
  if(existing?.destination==='store')return sellerFound(existing.href);
  const returnLink='/comparar/'+slug;
  function explain(message='No se ha confirmado un enlace directo de esta oferta. Puedes utilizar «Buscar en Google».',reason='unavailable'){
   // Respuesta en línea para JavaScript; navegación accesible como alternativa.
   if(asynchronous)return res.json({ok:false,reason,message});
   return res.redirect(303,returnLink+'?enlace=sin-verificar#precios-y-tiendas');
  }
  if(!provider.canLookupSeller(offer)||!provider.configured()||!provider.hasProductReference(offer))return explain();
  const cached=await db.query("SELECT status,href FROM marketplace_compare_merchant_links WHERE offer_key=$1 AND checked_at>now()-interval '24 hours' AND (status!='checking' OR checked_at>now()-interval '2 minutes')",[hash]);
  if(cached.rowCount){
   const current=cached.rows[0];
   if(current.status==='ok'&&current.href){
    const resolved=provider.resolveOfferLink({...offer,resolved_href:current.href});
    if(resolved?.destination==='store')return sellerFound(resolved.href);
   }
   if(current.status==='checking')return explain('La comprobación de esta oferta está en curso.','checking');
   return explain('No se ha confirmado un enlace directo de esta oferta. Puedes usar «Buscar en Google».','unavailable');
  }
  const locked=await db.query(
   "INSERT INTO marketplace_compare_merchant_links(offer_key,status,checked_at) VALUES($1,'checking',now()) "+
   "ON CONFLICT(offer_key) DO UPDATE SET status='checking',href=NULL,checked_at=now() "+
   "WHERE marketplace_compare_merchant_links.checked_at<now()-interval '24 hours' "+
   "OR (marketplace_compare_merchant_links.status='checking' AND marketplace_compare_merchant_links.checked_at<now()-interval '2 minutes') "+
   "RETURNING offer_key",[hash]
  );
  if(!locked.rowCount)return explain('La comprobación de esta oferta está en curso.','checking');
  if(!await compareWorker.reserveQuota()){
   // No penalizar esta oferta 24 horas: el presupuesto puede renovarse antes.
   await db.query("DELETE FROM marketplace_compare_merchant_links WHERE offer_key=$1 AND status='checking'",[hash]);
   return explain('El límite de comprobaciones se ha alcanzado. Puedes usar «Buscar en Google». No se ha realizado otra consulta.','quota');
  }
  try{
   const result=await provider.fetchDirectRetailer(offer);
   await db.query("UPDATE marketplace_compare_merchant_links SET status=$2,href=$3,checked_at=now() WHERE offer_key=$1",
    [hash,result?'ok':'unavailable',result?.href||null]);
   if(result)return sellerFound(result.href);
   return explain('No se ha encontrado una página de esta tienda que coincida con la oferta y su precio. Puedes usar «Buscar en Google».','unavailable');
  }catch(error){
   console.warn('Comparador direct seller:',String(error?.message||'lookup_error').slice(0,70));
   await db.query("UPDATE marketplace_compare_merchant_links SET status='unavailable',href=NULL,checked_at=now() WHERE offer_key=$1",[hash]);
   return explain('No se ha podido comprobar el enlace de esta oferta. Puedes usar «Buscar en Google».','unavailable');
  }
 }catch(error){next(error);}
});
// V3.4.2.0: solicitud gratuita de tiendas; conserva la aprobación administrativa real.
// No permite activar checkout, pagos ni conexión de credenciales desde el formulario.
router.get('/comparar/comercios', (req,res)=>{
 const token=issueCsrf(req,res);
 const content='<div class="cmp-commerce-intro cmp-application-page"><p class="crumb"><a href="/comparar">Comparador</a> / Comercios</p>'+
  '<span class="cmp-section-eyebrow">Programa de comercios · Gratis</span><h1>Tu tienda en el comparador de RedLibertad</h1>'+
  '<p class="cmp-commerce-lead">Lleva tus productos a quienes ya están comparando precios. El alta es gratuita: sin cuota, sin comisiones y sin gestionar pagos de tus clientes.</p>'+
  '<p>Las tiendas se revisan antes de habilitar enlaces de compra. La venta se realiza exclusivamente en tu propia web.</p>'+
  '<ol class="cmp-commerce-steps"><li><strong>Solicita el alta</strong><span>Registra la web de tu tienda desde tu cuenta de RedLibertad.</span></li><li><strong>Verifica tu dominio</strong><span>Comprueba la titularidad mediante el código proporcionado y espera la revisión.</span></li><li><strong>Comparte tus productos</strong><span>Si usas WooCommerce, podrás conectar el catálogo con acceso de solo lectura tras la aprobación; otras plataformas se revisan individualmente.</span></li></ol>'+
  '<div class="cmp-application-panel"><form class="compare-search cmp-commerce-form" method="post" action="/comparar/comercios/solicitar">'+
  '<input type="hidden" name="_csrf" value="'+esc(token)+'">'+
  '<label for="comercioNombre">Nombre de la tienda</label><input id="comercioNombre" name="name" maxlength="120" minlength="3" required autocomplete="organization">'+
  '<label for="comercioWeb">Web de la tienda (HTTPS)</label><input id="comercioWeb" type="url" name="storeUrl" maxlength="500" placeholder="https://mitienda.es/" required autocomplete="url">'+
  '<label for="comercioPlataforma">Plataforma</label><select id="comercioPlataforma" name="platform"><option value="woocommerce">WooCommerce</option><option value="prestashop">PrestaShop</option><option value="shopify">Shopify</option><option value="other">Otra</option></select>'+ 
   '<small class="cmp-merchant-platform-hint">WooCommerce permite conexión de lectura tras la aprobación. Para otras plataformas revisaremos la incorporación de productos contigo.</small>'+
  '<button type="submit">Solicitar incorporación gratuita</button>'+
  '<small>Se requiere una cuenta de RedLibertad. No introduzcas contraseñas ni claves de tu tienda en este formulario.</small><p class="cmp-merchant-form-help">¿Ya la has solicitado? <a href="/comparar/comercios/mi-panel">Consulta el estado desde tu panel</a>. No es necesario repetir el registro.</p></form>'+ 
  '<aside class="cmp-application-note"><strong>Venderás en tu propia tienda</strong><p>Los compradores irán directamente a tu web para finalizar la compra. RedLibertad no cobra ninguna comisión.</p><strong>Tú mantienes el control</strong><p>Las tiendas pasan una revisión manual y cada producto conserva su precio, estado y enlace original.</p><a href="/comparar/comercios/tiendas">Explorar tiendas participantes</a></aside></div>'+
  '<nav class="cmp-section-subnav" aria-label="Opciones de comercios"><a href="/app">Entrar o crear cuenta</a><a href="/comparar/comercios/mi-panel">Mi panel de comercios</a></nav></div>';
 res.set('Cache-Control','private,no-store');
 res.send(shell('Comercios en el comparador | RedLibertad','Solicitud gratuita para incorporar una tienda online al comparador.',content,'/comparar/comercios',true));
});
router.post('/comparar/comercios/solicitar',optionalAuth,
 rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
 try{
  res.set('Cache-Control','private,no-store');
  if(!req.user)return res.status(401).send(shell('Inicia sesión | RedLibertad','Identifícate para solicitar una tienda.',
   '<div class="cmp-commerce-intro"><h1>Inicia sesión para continuar</h1><p>Para solicitar una tienda debes acceder a tu cuenta de RedLibertad. El alta sigue siendo gratuita.</p><p><a href="/app">Entrar o crear cuenta</a> · <a href="/comparar/comercios">Volver a la solicitud</a></p></div>',
   '/comparar/comercios'));
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Vuelve a /comparar/comercios.');
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const platform=req.body?.platform;
  const url=normalizeStoreUrl(req.body?.storeUrl);
  if(name.length<3||name.length>120||name.includes('<')||name.includes('>')||Array.from(name).some(ch=>ch.charCodeAt(0)<32)||!PLATFORMS.includes(platform)||!url)
   return res.status(400).send('Datos no válidos. Comprueba el nombre, plataforma y dirección HTTPS.');
  await ensureProfessionalSchema();
  const out=await db.query(
   "INSERT INTO marketplace_professional_stores(seller_id,name,platform,store_url,status,purchase_enabled) "+
   "VALUES($1,$2,$3,$4,'pending',false) ON CONFLICT(seller_id,store_url) DO NOTHING RETURNING id",
   [req.user.id,name,platform,url]);
  if(!out.rowCount)return res.status(409).send(shell('Tienda ya registrada | RedLibertad','Consulta el estado de tu solicitud anterior.',
    '<div class="cmp-commerce-intro cmp-merchant-result"><span class="cmp-section-eyebrow">Solicitud existente</span><h1>Esta tienda ya está registrada</h1><p>No tienes que repetir el alta. Puedes consultar la revisión del dominio y los próximos pasos en tu panel.</p><p>El servicio sigue siendo gratuito y no se ha efectuado ningún cobro.</p><nav class="cmp-section-subnav"><a href="/comparar/comercios/mi-panel">Ver mis tiendas</a><a href="/comparar">Volver al comparador</a></nav></div>',
    '/comparar/comercios'));
  res.status(201).send(shell('Solicitud recibida | RedLibertad','Solicitud gratuita de comercio.',
   '<div class="cmp-commerce-intro"><h1>Solicitud registrada</h1><p>Tu tienda está pendiente de revisión. Ninguna oferta se publicará automáticamente en el comparador.</p>'+
   '<p>No se ha realizado ningún cobro ni activado una suscripción.</p><p>El siguiente paso es consultar tu panel, obtener el código de dominio cuando esté disponible y esperar la revisión administrativa.</p><nav class="cmp-section-subnav"><a href="/comparar/comercios/mi-panel">Consultar mi solicitud</a><a href="/comparar">Volver al comparador</a></nav></div>',
   '/comparar/comercios'));
 }catch(error){next(error);}
});
// V3.4.2.7: prueba manual opcional de control del dominio, sin peticiones HTTP
// a páginas de comerciantes, ni activación de compras ni de pagos.
router.post('/comparar/comercios/verificacion/:id',requireAuth,
 rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
 try{
  res.set('Cache-Control','private,no-store');
  res.set('X-Robots-Tag','noindex,nofollow');
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Actualiza tu panel y vuelve a intentarlo.');
  const id=String(req.params.id||'');
  if(!/^[1-9]\d{0,15}$/.test(id))return res.sendStatus(400);
  await ensureProfessionalSchema();
  const generated='rl-verify-'+crypto.randomBytes(16).toString('hex');
  const result=await db.query(
   "UPDATE marketplace_professional_stores SET verification_token=COALESCE(verification_token,$3),updated_at=now() "+
   "WHERE id=$1 AND seller_id=$2 AND status='pending' RETURNING id",
   [id,req.user.id,generated]);
  if(!result.rowCount)return res.status(404).send('No existe una tienda pendiente en esta cuenta.');
  res.redirect(303,'/comparar/comercios/mi-panel');
 }catch(error){next(error);}
});
// V3.4.2.8 — conexión WooCommerce de solo lectura, por su propietario aprobado.
// Las credenciales nunca se incluyen en HTML, logs, JSON o una respuesta de error.
router.get('/comparar/comercios/woocommerce/:id',requireAuth,async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const id=String(req.params.id||'');
  if(!/^[1-9][0-9]{0,15}$/.test(id))return res.sendStatus(400);
  const result=await db.query(
   "SELECT s.id,s.name,s.store_url,s.platform,s.status,"+
   "(c.credentials_encrypted IS NOT NULL) AS connected "+
   "FROM marketplace_professional_stores s LEFT JOIN marketplace_woocommerce_connections c ON c.store_id=s.id "+
   "WHERE s.id=$1 AND s.seller_id=$2 AND s.status='approved' AND s.platform='woocommerce'",
   [id,req.user.id]);
  if(!result.rowCount)return res.sendStatus(404);
  const store=result.rows[0],csrfToken=issueCsrf(req,res);
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  const content='<div class="cmp-commerce-intro"><h1>Conectar WooCommerce</h1>'+
   '<p>'+esc(store.name)+' · '+esc(store.store_url)+'</p>'+
   '<p>Utiliza claves WooCommerce con permiso <strong>Lectura</strong>. No solicitamos permisos de escritura, pedidos ni pagos. Las credenciales quedan cifradas.</p>'+
   '<p>Estado: '+(store.connected?'Conexión guardada. Puedes sustituir las claves con otras de solo lectura.':'Pendiente de conectar.')+'</p>'+
   '<form class="compare-search cmp-commerce-form" method="post" action="/comparar/comercios/woocommerce/'+esc(id)+'">'+
   '<input type="hidden" name="_csrf" value="'+esc(csrfToken)+'">'+
   '<label for="wooMerchantKey">Consumer Key (solo lectura)</label><input id="wooMerchantKey" type="password" name="consumerKey" minlength="28" maxlength="83" required autocomplete="off">'+
   '<label for="wooMerchantSecret">Consumer Secret</label><input id="wooMerchantSecret" type="password" name="consumerSecret" minlength="28" maxlength="83" required autocomplete="off">'+
   '<button type="submit">Verificar y conectar</button><small>La sincronización automática permanece desactivada. Administración revisa las importaciones y productos.</small></form>'+
   '<p><a href="/comparar/comercios/mi-panel">Volver a mis tiendas</a></p></div>';
  res.send(shell('Conectar WooCommerce | RedLibertad','Conexión segura de catálogo en modo lectura.',content,'/comparar/comercios/woocommerce/'+esc(id)));
 }catch(error){next(error);}
});
router.post('/comparar/comercios/woocommerce/:id',requireAuth,
 rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
 try{
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  if(!validCsrf(req))return res.status(403).send('Formulario caducado. Recarga la página.');
  const id=String(req.params.id||'');
  if(!/^[1-9][0-9]{0,15}$/.test(id))return res.sendStatus(400);
  const key=typeof req.body?.consumerKey==='string'?req.body.consumerKey:'';
  const secret=typeof req.body?.consumerSecret==='string'?req.body.consumerSecret:'';
  if(!/^ck_[A-Za-z0-9]{25,80}$/.test(key)||!/^cs_[A-Za-z0-9]{25,80}$/.test(secret))
   return res.status(400).send('Las claves de WooCommerce no tienen un formato válido.');
  await ensureProfessionalSchema();
  const owned=await db.query(
   "SELECT id,store_url,status,platform FROM marketplace_professional_stores "+
   "WHERE id=$1 AND seller_id=$2 AND status='approved' AND platform='woocommerce'",
   [id,req.user.id]);
  if(!owned.rowCount)return res.sendStatus(404);
  try{
   merchantWoo.secretKey();
   // La conexión solo hace GET al dominio aprobado, con DNS/IP pública fijada.
   await merchantWoo.listProducts(owned.rows[0],{key,secret},1);
   const encrypted=merchantWoo.encryptCredentials(key,secret);
   await db.query(
    "INSERT INTO marketplace_woocommerce_connections(store_id,credentials_encrypted,sync_enabled) VALUES($1,$2,false) "+
    "ON CONFLICT(store_id) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,sync_enabled=false,last_error=NULL,updated_at=now()",
    [id,encrypted]);
   return res.status(200).send(shell('WooCommerce conectado | RedLibertad','Conexión segura guardada.',
    '<div class="cmp-commerce-intro"><h1>WooCommerce conectado</h1>'+
    '<p>Las claves se han verificado y guardado cifradas. La importación y sincronización automática siguen desactivadas hasta la revisión de Administración.</p>'+
    '<a href="/comparar/comercios/mi-panel">Volver a mis tiendas</a></div>',
    '/comparar/comercios/mi-panel'));
  }catch(err){
   const msg=merchantWoo.publicError(err);
   const statuses={woocommerce_key_not_configured:503,woocommerce_auth_failed:400};
   return res.status(statuses[msg]||502).send('No se ha podido conectar la tienda ('+esc(msg)+'). No se han guardado las claves.');
  }
 }catch(error){next(error);}
});
// V3.4.2.9: informe privado del catálogo, solo lectura. No consulta SerpApi.
router.get('/comparar/comercios/productos/:id',requireAuth,async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const id=String(req.params.id||'');
  if(!/^[1-9][0-9]{0,15}$/.test(id))return res.sendStatus(400);
  const store=await db.query(
   'SELECT id,name,store_url,status,purchase_enabled FROM marketplace_professional_stores WHERE id=$1 AND seller_id=$2',
   [id,req.user.id]);
  if(!store.rowCount)return res.sendStatus(404);
  const products=await db.query(
   "SELECT x.listing_id,l.title,l.kind,l.deal,l.status AS listing_status,l.moderation_status,"+
   "x.stock_status,x.source,x.last_checked_at,x.product_url,s.store_url,"+
   "s.status AS store_status,s.purchase_enabled "+
   "FROM marketplace_external_products x "+
   "JOIN marketplace_professional_stores s ON s.id=x.store_id "+
   "JOIN marketplace_listings l ON l.id=x.listing_id AND l.seller_id=x.seller_id "+
   "WHERE x.store_id=$1 AND s.seller_id=$2 AND x.seller_id=s.seller_id "+
   "ORDER BY x.updated_at DESC LIMIT 101",[id,req.user.id]);
  const shown=products.rows.slice(0,100);
  const statistics=catalogDiagnostics.summary(shown);
   const duplicateLinks=catalogDiagnostics.suspectedDuplicateLinks(shown);
  const cards=shown.map(product=>{
   const result=catalogDiagnostics.diagnoseProduct(product);
   return '<li class="cmp-merchant-diagnostic"><strong>'+esc(product.title)+'</strong>'+
    '<span>'+esc(result.label)+' · '+esc(product.stock_status)+'</span>'+ 
     (duplicateLinks.listingIds.has(String(product.listing_id))?'<span class="cmp-catalog-duplicate-note">Posible duplicado: otro anuncio utiliza la misma URL de compra. Comprueba si se trata de una variante.</span>':'')+
    '<p>'+esc(result.reason)+'</p>'+
    '<a href="/marketplace/p/'+esc(product.listing_id)+'">Ver anuncio de RedLibertad</a></li>';
  }).join('');
  const heading='<div class="cmp-commerce-intro"><p class="crumb"><a href="/comparar/comercios/mi-panel">Mis tiendas</a> / Productos</p>'+
   '<h1>Diagnóstico de productos</h1><p>'+esc(store.rows[0].name)+'</p>'+
   '<p>'+statistics.total+' productos revisados · '+statistics.ready+' disponibles · '+
   statistics.needsReview+' pendientes de publicación · '+statistics.stock+' con incidencia de stock · '+
   statistics.sync+' para sincronizar · '+statistics.invalidLink+' con enlace a revisar.</p>'+ 
    (duplicateLinks.groups?'<p class="cmp-catalog-duplicate-summary" role="status">'+duplicateLinks.items+' anuncios comparten enlaces de compra en '+duplicateLinks.groups+' '+(duplicateLinks.groups===1?'grupo':'grupos')+'. Revisa posibles duplicados o variantes antes de hacer cambios.</p>':'')+
   '<p>Estos resultados informan del estado de catálogo: no verifican las ventas y no cambian precios ni publicaciones. Los enlaces compartidos se señalan como posibles duplicados, sin eliminar ninguna variante.</p>'+
   '<ul class="cmp-commerce-stat-list">'+(cards||'<li>Todavía no hay productos vinculados.</li>')+'</ul>'+
   (products.rows.length>100?'<p>Se muestran los 100 productos más recientes.</p>':'')+
   '<a href="/comparar/comercios/mi-panel">Volver a mis tiendas</a></div>';
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Diagnóstico de productos | RedLibertad','Estado del catálogo de tu tienda.',heading,
    '/comparar/comercios/productos/'+esc(id)));
 }catch(error){next(error);}
});
router.get('/comparar/comercios/mis-solicitudes',requireAuth,async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const stores=await db.query('SELECT id,name,platform,store_url,status FROM marketplace_professional_stores WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id]);
  res.set('Cache-Control','private,no-store');
  res.set('X-Robots-Tag','noindex,nofollow');
  res.json({ok:true,billingEnabled:false,stores:stores.rows});
 }catch(error){next(error);}
});
// V3.4.2.2: el enlace sigue siendo directo a la tienda. Solo registramos clics
// agregados y con prueba firmada, sin datos identificadores del visitante.
router.post('/comparar/comercios/registrar-clic',
 rateLimit({windowMs:60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}),
 async(req,res,next)=>{
 try{
  const storeId=String(req.body?.storeId||''),listingId=String(req.body?.listingId||'');
  if(!merchantClicks.validProof(storeId,listingId,req.body?.proof))
   return res.sendStatus(403);
  const accepted=await merchantClicks.record(storeId,listingId);
  res.set('Cache-Control','no-store');
  return res.sendStatus(accepted?204:404);
 }catch(error){next(error);}
});
router.get('/comparar/comercios/mis-estadisticas',requireAuth,async(req,res,next)=>{
 try{
  await merchantClicks.ensureSchema();
  const result=await db.query(
   "SELECT s.name,s.store_url,s.status,COUNT(DISTINCT x.listing_id)::integer AS products,"+
   "COALESCE(SUM(t.click_count),0)::integer AS clicks "+
   "FROM marketplace_professional_stores s "+
   "LEFT JOIN marketplace_external_products x ON x.store_id=s.id AND x.seller_id=s.seller_id "+
   "LEFT JOIN marketplace_comparison_store_clicks t ON t.store_id=s.id AND t.listing_id=x.listing_id AND t.clicked_day>=CURRENT_DATE-INTERVAL '29 days' "+
   "WHERE s.seller_id=$1 GROUP BY s.id ORDER BY s.id DESC LIMIT 30",[req.user.id]);
  const cards=result.rows.map(row=>'<li><strong>'+esc(row.name)+'</strong> · '+esc(row.status)+
    '<span>'+Number(row.products)+' productos vinculados · '+Number(row.clicks)+' clics registrados (30 días)</span></li>').join('');
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Estadísticas de mis comercios | RedLibertad','Clics agregados en tiendas.',
   '<div class="cmp-commerce-intro"><h1>Estadísticas de mis comercios</h1>'+
   '<p>Datos gratuitos de los últimos 30 días. Los clics registrados no equivalen a ventas ni visitantes únicos.</p>'+
   '<ul class="cmp-commerce-stat-list">'+(cards||'<li>Todavía no tienes tiendas registradas.</li>')+'</ul>'+
   '<a href="/comparar/comercios">Solicitar otra tienda</a></div>',
   '/comparar/comercios/mis-estadisticas'));
 }catch(error){next(error);}
});
router.get('/admin/comparador/comercios-estadisticas',requireAdmin,async(req,res,next)=>{
 try{
  await merchantClicks.ensureSchema();
  const r=await db.query(
   "SELECT s.id,s.name,s.status,u.username,COUNT(DISTINCT x.listing_id)::integer AS products,"+
   "COALESCE(SUM(t.click_count),0)::integer AS clicks "+
   "FROM marketplace_professional_stores s JOIN users u ON u.id=s.seller_id "+
   "LEFT JOIN marketplace_external_products x ON x.store_id=s.id "+
   "LEFT JOIN marketplace_comparison_store_clicks t ON t.store_id=s.id AND t.listing_id=x.listing_id AND t.clicked_day>=CURRENT_DATE-INTERVAL '29 days' "+
   "GROUP BY s.id,u.username ORDER BY s.updated_at DESC LIMIT 100");
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.json({ok:true,billingEnabled:false,periodDays:30,clickMetric:'eventos, no ventas ni visitantes únicos',stores:r.rows});
 }catch(error){next(error);}
});
// V3.4.2.3: escaparate de participación gratuita; NO anuncios de pago.
// Solo tiendas aprobadas con productos realmente disponibles y enlaces HTTPS propios.
router.get('/comparar/comercios/tiendas',async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const result=await db.query(
   "SELECT s.name,s.store_url,COUNT(DISTINCT x.listing_id)::integer AS products "+
   "FROM marketplace_professional_stores s "+
   "JOIN users u ON u.id=s.seller_id "+
   "JOIN marketplace_external_products x ON x.store_id=s.id AND x.seller_id=s.seller_id "+
   "JOIN marketplace_listings l ON l.id=x.listing_id AND l.seller_id=s.seller_id "+
   "WHERE s.status='approved' AND s.purchase_enabled=true AND u.status='active' AND u.discoverable=true "+
   "AND l.kind='product' AND l.deal='sale' AND l.status='active' AND l.moderation_status='published' "+
   "AND x.stock_status='in_stock' AND (x.source<>'api' OR x.last_checked_at>now()-interval '48 hours') "+
   "GROUP BY s.id ORDER BY s.updated_at DESC,s.id DESC LIMIT 40");
  // Solo dominios HTTPS únicos: evita tarjetas duplicadas y SEO con poco contenido.
  const domains=new Set();
  const stores=result.rows.filter(s=>{
   const url=normalizeStoreUrl(s.store_url);
   if(!url)return false;
   const domain=new URL(url).hostname.replace(/^www[.]/,'').toLowerCase();
   if(domains.has(domain))return false;
   domains.add(domain);return true;
  });
  const indexReady=stores.length>=3 &&
   stores.filter(s=>Number(s.products)>=2).length>=3 &&
   stores.reduce((sum,s)=>sum+Math.max(0,Number(s.products)||0),0)>=12;
  const cards=stores.map(s=>'<li><div class="cmp-store-card-top"><span class="cmp-store-icon" aria-hidden="true">'+esc(String(s.name||'T').trim().charAt(0).toLocaleUpperCase('es-ES'))+'</span><strong>'+esc(s.name)+'</strong></div><span class="cmp-store-check">Comercio aprobado</span>'+
   '<small class="cmp-store-meta">'+Number(s.products)+' '+(Number(s.products)===1?'producto':'productos')+' disponibles</small>'+
   '<a class="cmp-store-action" href="'+esc(normalizeStoreUrl(s.store_url))+'" target="_blank" rel="noopener noreferrer nofollow">Visitar tienda ↗</a></li>').join('');
  const html='<div class="cmp-commerce-intro cmp-directory-page"><p class="crumb"><a href="/comparar">Comparador</a> / Comercios</p>'+
   '<span class="cmp-section-eyebrow">Compra directamente a los vendedores</span><h1>Tiendas participantes</h1>'+
   '<p>Comercios aprobados que comparten sus productos gratuitamente. El pago y la compra se realizan siempre en cada tienda.</p>'+
   '<div class="cmp-directory-toolbar"><span class="cmp-directory-count">'+stores.length+' '+(stores.length===1?'tienda participante':'tiendas participantes')+'</span><a href="/comparar/comercios">¿Tienes una tienda? Únete gratis</a></div>'+ 
   '<ul class="cmp-commerce-directory'+(stores.length===1?' cmp-directory-single':'')+'">'+(cards||'<li class="cmp-commerce-empty"><strong>Estamos incorporando comercios</strong><p>Pronto aparecerán aquí las tiendas que superen la revisión y tengan productos disponibles.</p><a href="/comparar/comercios">Solicitar alta gratuita</a></li>')+'</ul>'+
   '<nav class="cmp-section-subnav" aria-label="Enlaces del directorio"><a href="/comparar">Buscar y comparar precios</a><a href="/comparar/comercios">Solicitar aparecer gratis</a></nav></div>';
  res.set('Cache-Control','private,no-store');
  res.send(shell('Tiendas participantes | RedLibertad','Tiendas online aprobadas y ofertas disponibles.',
   html,'/comparar/comercios/tiendas',indexReady));
 }catch(error){next(error);}
});
// V3.4.2.4: bandeja de seguimiento read-only: nadie se aprueba ni se factura solo.
router.get('/admin/comparador/comercios-seguimiento',requireAdmin,async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const result=await db.query(
   "SELECT s.id,s.name,s.store_url,s.status,s.platform,u.username,"+
   "COUNT(DISTINCT x.listing_id)::integer AS product_count,c.sync_enabled,c.last_sync_at,c.last_error "+
   "FROM marketplace_professional_stores s JOIN users u ON u.id=s.seller_id "+
   "LEFT JOIN marketplace_external_products x ON x.store_id=s.id "+
   "LEFT JOIN marketplace_woocommerce_connections c ON c.store_id=s.id "+
   "GROUP BY s.id,u.username,c.sync_enabled,c.last_sync_at,c.last_error "+
   "ORDER BY s.updated_at DESC LIMIT 101");
  const {items,summary}=merchantFollowup.assess(result.rows.slice(0,100));
  const priority=items.filter(x=>x.needsAttention);
  const htmlRows=priority.map(s=>{
   const reasons=[s.pending?'Pendiente de verificación':null,s.empty?'Sin productos vinculados':null,
    s.syncStale?'Sincronización atrasada':null,s.syncError?'Error de sincronización':null].filter(Boolean).join(' · ');
   return '<li><strong>'+esc(s.name)+'</strong><small>'+esc(s.username)+' · '+esc(reasons)+'</small></li>';
  }).join('');
  const content='<div class="cmp-commerce-intro"><h1>Seguimiento de comercios</h1>'+
   '<p>Solo información de tiendas existentes. Las aprobaciones y las credenciales se siguen gestionando desde Administración.</p>'+
   '<ul class="cmp-commerce-stat-list"><li>Pendientes: '+summary.pending+' · Aprobadas: '+summary.approved+
   ' · Sin productos: '+summary.noProducts+' · Revisar sincronización: '+summary.syncReview+'</li></ul>'+
   '<h2>Tiendas que necesitan revisión</h2><ul class="cmp-commerce-stat-list">'+(htmlRows||'<li>Sin incidencias en las tiendas revisadas.</li>')+'</ul>'+
   (result.rows.length>100?'<p>Mostrando solo las 100 tiendas más recientes.</p>':'')+
   '<p><a href="/marketplace/tiendas">Gestionar tiendas y aprobación</a> · <a href="/admin/comparador/comercios-estadisticas">Estadísticas (JSON)</a></p>'+
   '<small>Sin facturación, renovaciones automáticas ni cambios de permisos.</small></div>';
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Seguimiento de comercios | RedLibertad','Panel privado de seguimiento.',content,'/admin/comparador/comercios-seguimiento'));
 }catch(error){next(error);}
});
router.get('/comparar/comercios/mi-panel',requireAuth,async(req,res,next)=>{
 try{
  await ensureProfessionalSchema();
  const csrfToken=issueCsrf(req,res);
  const result=await db.query(
   "SELECT s.id,s.name,s.platform,s.store_url,s.status,s.verification_token,"+
   "COUNT(DISTINCT x.listing_id)::integer AS linked_count,"+
   "COUNT(DISTINCT x.listing_id) FILTER (WHERE x.stock_status='in_stock' "+
   "AND (x.source<>'api' OR x.last_checked_at>now()-interval '48 hours') "+
   "AND l.kind='product' AND l.deal='sale' AND l.status='active' AND l.moderation_status='published')::integer AS available_count,"+
   "COALESCE(BOOL_OR(c.sync_enabled),false) AS sync_enabled,"+
   "COALESCE(BOOL_OR(c.credentials_encrypted IS NOT NULL),false) AS connected "+
   "FROM marketplace_professional_stores s "+
   "LEFT JOIN marketplace_external_products x ON x.store_id=s.id AND x.seller_id=s.seller_id "+
   "LEFT JOIN marketplace_listings l ON l.id=x.listing_id AND l.seller_id=s.seller_id "+
   "LEFT JOIN marketplace_woocommerce_connections c ON c.store_id=s.id "+
   "WHERE s.seller_id=$1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 30",
   [req.user.id]);
  const cards=result.rows.map(store=>{
   const info=sellerProgress(store);
   const verification=store.status==='pending'?
    (store.verification_token?
     '<div class="cmp-merchant-verification"><strong>Verificación de titularidad (manual)</strong>'+
     '<p>Publica este código de texto en una página visible de tu dominio '+esc(store.store_url)+'. Administración comprobará el código antes de aprobar la tienda.</p>'+
     '<code>'+esc(store.verification_token)+'</code><small>No introduzcas contraseñas ni datos de clientes. El código no activa nada automáticamente.</small></div>':
     '<form method="post" action="/comparar/comercios/verificacion/'+esc(store.id)+'">'+
     '<input type="hidden" name="_csrf" value="'+esc(csrfToken)+'">'+
     '<button type="submit">Obtener código de verificación</button></form>'):'';
   return '<li class="cmp-merchant-progress"><strong>'+esc(store.name)+'</strong>'+
    '<span>'+esc(info.label)+' · '+esc(store.platform)+'</span>'+
    '<span>'+info.linked+' productos vinculados · '+info.available+' con existencias aptas</span>'+
    '<p>'+esc(info.next)+'</p>'+verification+
    (store.status==='approved'&&store.platform==='woocommerce'?'<p><a href="/comparar/comercios/woocommerce/'+esc(store.id)+'">Conectar WooCommerce con claves de lectura</a></p>':'')+
    (info.linked?'<p><a href="/comparar/comercios/productos/'+esc(store.id)+'">Ver diagnóstico de mis productos</a></p>':'')+'</li>';
  }).join('');
  const content='<div class="cmp-commerce-intro cmp-dashboard-page"><span class="cmp-section-eyebrow">Área privada de comercios</span><h1>Mis tiendas del comparador</h1>'+
   '<p>El servicio es gratuito. Cada tienda necesita aprobación y productos revisados antes de aparecer en una comparación.</p>'+
   '<ul class="cmp-commerce-stat-list">'+(cards||'<li class="cmp-dashboard-note">Todavía no tienes tiendas registradas. Puedes solicitar una gratuitamente y seguir su revisión desde aquí.</li>')+'</ul>'+
   '<nav class="cmp-section-subnav" aria-label="Opciones de mis tiendas"><a href="/comparar/comercios/mis-estadisticas">Ver estadísticas de clics</a><a href="/comparar/comercios">Solicitar otra tienda</a></nav></div>';
  res.set('Cache-Control','private,no-store');res.set('X-Robots-Tag','noindex,nofollow');
  res.send(shell('Mis tiendas | RedLibertad','Solicitudes y estado de tiendas.',content,'/comparar/comercios/mi-panel'));
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
  const offers=[...local,...external].filter(o=>provider.titleMatches(page.query_text,o.title,
    {includeAccessories:offerQuality.isPhoneSearch(page.query_text)&&!offerQuality.isAccessorySearch(page.query_text)}))
   .sort((a,b)=>a.price_cents-b.price_cents);
  await attachCachedMerchantLinks(offers);
  await attachManualMerchantLinks(page,offers);
  // Quitar repeticiones solo en la ficha: no tocar anuncios, enlaces ni resultados guardados.
  // Separar publicidad ANTES de evaluar precios atípicos: una promoción barata
  // no puede sesgar el umbral ni formar parte del precio mínimo independiente.
  const {ordinary:unpaidOffers,sponsored:paidOffers}=splitPaidOffers(offers);
  const grouped=offerQuality.groupOffers(page.query_text,unpaidOffers);
  const ordinary=uniqueOffers(grouped.main),sponsored=uniqueOffers(paidOffers);
  const repair=uniqueOffers(grouped.repair);
  const accessories=uniqueOffers(grouped.accessories),review=uniqueOffers(grouped.review);
  const insight=insights.buildInsights(page.query_text,ordinary);
  // El historial anterior puede incluir mínimos averiados sin desglose por condición.
  // No presentar cifras históricas no depurables junto a una ficha que hoy contiene averías.
  const history=!repair.length && !accessories.length && !review.length && !sponsored.length && ordinary.length && seo.auto.capacity(page.query_text)?
   await db.query("SELECT checked_day::text AS checked_day,low_price_cents,shop_count FROM marketplace_compare_price_history WHERE page_id=$1 AND checked_day>=CURRENT_DATE-INTERVAL '180 days' ORDER BY checked_day DESC LIMIT 6",[page.id]):{rows:[]};
  const quota=ordinary.some(o=>!o.internal && provider.canLookupSeller(o) && provider.hasProductReference(o))?
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
  const approved=seo.indexEligible(page,ordinary);
  const title='Comparar '+page.query_text+' | RedLibertad';
  const automatic=seo.auto.eligibleOffers(page,ordinary);
  const factualSummary=automatic.eligible?seo.auto.autoSummary(page,automatic):null;
  const description=(factualSummary||String(page.editorial_summary||'')||('Compara ofertas para '+page.query_text+' en España. Consulta vendedores y precios orientativos.')).slice(0,155);
  const csrfToken=issueCsrf(req,res);
  const pending=['queued','checking'].includes(page.provider_status);
  const bestOffer=ordinary.length?ordinary[0]:null;
  const best=bestOffer?.price_cents??null;
  const bestCondition=bestOffer?insights.conditionOf(bestOffer):null;
  const singleOffer=ordinary.length===1;
  const status=singleOffer?
   '<section class="compare-single-status" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+priceWarning+
   '<span>1 oferta coincidente</span>'+(checked?'<time>Precios consultados: '+esc(checked)+'</time>':'')+'</section>':
   ordinary.length?
   '<section class="info compare-status-summary" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+priceWarning+
   '<div class="compare-status-head"><h2>Precios encontrados</h2>'+
   (checked?'<span>Precios consultados: '+esc(checked)+'</span>':'')+'</div>'+
   '<p class="cmp-start-price"><strong>'+(bestOffer&&!bestOffer.internal&&freshness.isStale?'Último mínimo registrado: ':'Desde ')+money(best)+'</strong>'+
   (bestCondition && bestCondition!=='Estado sin confirmar'?' · '+esc(bestCondition.toLowerCase()):'')+
   ' · '+ordinary.length+' '+(ordinary.length===1?'oferta':'ofertas')+
   (exact?(insight.hasMixedVariants?' en varias versiones y estados':''):' de productos potencialmente diferentes')+'</p>'+
   '</section>':
   (accessories.length||review.length)?
   '<section class="info cmp-only-review-status" role="status"><h2>Ofertas por confirmar</h2>'+
   '<p>No tenemos precios suficientemente fiables para destacar un teléfono completo. Consulta los anuncios relacionados más abajo, sin mezclar sus importes.</p></section>':
   repair.length?
   '<section class="info cmp-only-repair-status" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite"><h2>Solo se han encontrado anuncios para reparar</h2><p>Ninguna de las ofertas actuales está libre de averías expresamente declaradas. Puedes consultar los anuncios por piezas más abajo.</p></section>':
   sponsored.length?
   '<section class="info cmp-only-sponsored-status" role="status"><h2>Solo hay ofertas publicitarias</h2><p>No se han encontrado ofertas independientes para destacar un precio mínimo. Puedes consultar los anuncios etiquetados como publicidad más abajo.</p></section>':
   '<section class="compare-awaiting" data-comparison-status="'+esc(page.provider_status)+'" aria-live="polite">'+
   '<div class="compare-awaiting-icon" aria-hidden="true">⌕</div>'+
   '<h2>'+(pending?'Buscando ofertas para tu producto':page.provider_status==='ok'?'Todavía no encontramos ofertas':'Estamos preparando esta comparación')+'</h2>'+
   '<p>'+(pending?'Estamos consultando los precios disponibles. Los resultados aparecerán aquí cuando termine la búsqueda.':
     page.provider_status==='ok'?'Prueba con un modelo diferente o una búsqueda más general.':
     'Esta página está guardada. Puedes volver más tarde o explorar otras comparaciones.')+'</p>'+
   '<a class="compare-awaiting-link" href="/comparar">Ver otras comparaciones</a>'+
   '</section>';
  const access=directAccess.summary(ordinary);
  const filters=offerFilters.choices(ordinary,{specificModel:exact});
  const conditionNames={
   'nuevo':'Nuevo','usado':'Usado','reacondicionado':'Reacondicionado','sin-confirmar':'Estado no indicado'
  };
  const conditionMenu=filters.conditionOptions.length?
   '<label class="cmp-facet"><span>Estado</span><select aria-label="Filtrar ofertas por estado" data-condition-filter>'+
   '<option value="all">Todos los estados</option>'+
   filters.conditionOptions.map(v=>'<option value="'+esc(v)+'">'+esc(conditionNames[v])+'</option>').join('')+
   '</select></label>':'';
  const capacityMenu=filters.capacityOptions.length?
   '<label class="cmp-facet"><span>Capacidad</span><select aria-label="Filtrar ofertas por capacidad" data-capacity-filter>'+
   '<option value="all">Todas las capacidades</option>'+
   filters.capacityOptions.map(v=>'<option value="'+esc(v.code)+'">'+esc(v.label)+'</option>').join('')+
   '</select></label>':'';
  // Navegación interna sin JS, solo en fichas con suficientes ofertas para desplazar en móvil.
  const longList=ordinary.length>=4;
  const directControls=ordinary.length>1?
   '<div class="cmp-access-toolbar" data-direct-filter'+(longList?' id="filtros-ofertas"':'')+'>'+
   '<div class="cmp-access-intro"><strong>'+access.direct+' '+(access.direct===1?'oferta con enlace directo':'ofertas con enlace directo')+'</strong>'+
   '<small>'+access.other+' '+(access.other===1?'oferta sin enlace directo':'ofertas sin enlace directo')+' · precios ordenados de menor a mayor</small></div>'+
   (access.direct&&access.other?
    '<div class="cmp-access-options" role="group" aria-label="Filtrar ofertas por tipo de enlace">'+
    '<button type="button" class="cmp-access-option" data-access-choice="all" aria-pressed="true">Todas ('+access.total+')</button>'+
    '<button type="button" class="cmp-access-option" data-access-choice="direct" aria-pressed="false">Solo acceso directo ('+access.direct+')</button></div>':'')+
   (conditionMenu||capacityMenu?'<div class="cmp-facet-group">'+conditionMenu+capacityMenu+'</div>':'')+
   '<p class="cmp-access-filter-note" data-access-note hidden>El precio mínimo destacado corresponde a todas las ofertas comparables, no solo a las filtradas.</p>'+
   '<p class="cmp-access-filter-result" role="status" data-filter-results hidden></p>'+
   '<button class="cmp-filter-reset" type="button" data-clear-comparison-filters hidden>Quitar filtros</button>'+
   (longList?'<a class="cmp-first-visible-link" data-first-visible-link href="#oferta-'+offerKey(ordinary[0])+'">Ir a la primera oferta visible</a>':'')+
   '</div>':'';
  const returnNav=longList?'<nav class="cmp-offer-return-nav" aria-label="Moverse por las ofertas"><a href="#filtros-ofertas">Volver a filtros</a><a href="#precios-y-tiendas">Inicio de las ofertas</a></nav>':'';
  const cards=ordinary.length?directControls+'<ol class="comparison-list cmp-primary-offers" data-primary-offers>'+ordinary.map((o,i)=>offerMarkup(o,i,ordinary.length,slug,csrfToken,quota,o.internal?null:externalPriceInfo)).join('')+'</ol>'+returnNav:'';
  const repairCards=repairOffersMarkup(repair,slug,csrfToken,externalPriceInfo);
  const sponsoredCards=sponsored.length?'<section class="cmp-noncomparable-section cmp-sponsored-section" aria-label="Anuncios publicitarios"><details>'+
   '<summary>Publicidad ('+sponsored.length+')</summary>'+
   '<p class="cmp-sponsored-advice">Estas ofertas están etiquetadas como publicidad por su fuente. No se incluyen en el precio mínimo independiente ni en el SEO del producto.</p>'+
   '<ol class="comparison-list">'+sponsored.map(o=>offerMarkup(o,-1,0,slug,csrfToken,null,o.internal?null:externalPriceInfo)).join('')+'</ol>'+
   '</details></section>':'';
  const relatedCards=nonComparableMarkup(accessories,review,slug,csrfToken,externalPriceInfo);
  const photoRows=exact&&ordinary.length?await db.query(
   "SELECT offer_key,image_url,reviewed_at FROM marketplace_compare_photo_reviews WHERE page_id=$1",[page.id]):{rows:[]};
  const curatedPhoto=photoReview.selected(page,photoRows.rows[0],ordinary);
  const richHero=exact?productDetail.heroMarkup(page.query_text,ordinary,page.last_checked_at,freshness.isStale,repair.length,curatedPhoto):
   productDetail.broadResultsMarkup(page.query_text,ordinary,freshness.isStale);
  const richFacts=exact?productDetail.specificationsMarkup(page.query_text,ordinary):'';
  const relatedKey=queryKey(page.query_text).split(' ')[0]||'';
  const related=ordinary.length&&relatedKey.length>=4?
   await db.query("SELECT slug,query_text FROM marketplace_compare_pages "+
    "WHERE query_key LIKE $1 ESCAPE '\\' AND slug<>$2 ORDER BY search_count DESC,updated_at DESC LIMIT 7",
    [escapeLike(relatedKey)+'%',slug]):{rows:[]};
  const relatedMarkup=productDetail.relatedMarkup(related.rows,slug);
  // V3.4.4.21: guía contextual opcional, sin duplicar botones ni comprometer el ranking.
  const priceLegend='<details class="cmp-price-legend"><summary>Cómo leer estos precios</summary>'+
   '<p>Los importes son los publicados por los vendedores o los últimos guardados en la comparación. El precio final, la disponibilidad y el envío se confirman con cada tienda. El estado del producto es el declarado en el anuncio, no una certificación de RedLibertad. La búsqueda externa ofrece otras opciones y no garantiza llegar a esta misma oferta.</p></details>';
  const results=singleOffer?
   '<section class="compare-single-product" data-comparison-results aria-labelledby="precios-y-tiendas">'+
   '<h2 id="precios-y-tiendas">'+(hasExternal&&freshness.isStale?'Oferta guardada':'Oferta encontrada')+'</h2>'+priceLegend+
   (req.query?.enlace==='sin-verificar'?'<p class="compare-merchant-notice" role="status">No se ha podido confirmar un enlace directo para esa oferta. Puedes utilizar «Buscar en Google» para consultar otras opciones.</p>':'')+
   cards+relatedCards+repairCards+sponsoredCards+
   '<p class="compare-help">Solo tenemos una oferta coincidente. El precio, la disponibilidad y el envío se confirman con el vendedor.</p></section>':
   ordinary.length?
   '<section data-comparison-results>'+(exact?insightsMarkup(page.query_text,insight):'')+historyMarkup(history.rows)+
   '<h2 id="precios-y-tiendas">'+(exact?'Precios y tiendas':'Productos y modelos relacionados')+'</h2>'+priceLegend+
   (req.query?.enlace==='sin-verificar'?'<p class="compare-merchant-notice" role="status">No se ha podido confirmar un enlace directo para esa oferta. Puedes utilizar «Buscar en Google» para consultar otras opciones.</p>':'')+
   (!insight.variants.length?'<p class="compare-guide">Comprueba el modelo y su estado antes de comprar.</p>':'')+
   cards+relatedCards+repairCards+sponsoredCards+
   '<p class="compare-help">Precio final y envío a confirmar en la tienda. Si no hay enlace directo, la búsqueda de Google puede mostrar otras ofertas, no necesariamente el mismo anuncio.</p></section>':
   '<section data-comparison-results aria-label="'+(repair.length||relatedCards||sponsored.length?'Ofertas no comparables':'Ofertas pendientes')+'">'+relatedCards+repairCards+sponsoredCards+'</section>';
  const content='<div class="cmp-rich-comparison"><p class="crumb"><a href="/marketplace/explorar">Marketplace</a> / <a href="/comparar">Comparador</a></p>'+
   '<h1 class="cmp-detail-page-title">Comparador de precios</h1>'+
   '<p class="cmp-page-subtitle">Compara tiendas y comprueba el estado antes de comprar.</p>'+
   richHero+
   '<details class="cmp-change-search"><summary>Cambiar de producto</summary>'+formMarkup('',page.query_text,csrfToken)+'</details>'+
   (approved&&(factualSummary||page.editorial_summary)?'<section class="info"><h2>Comparación de precios</h2><p>'+esc(factualSummary||page.editorial_summary)+'</p></section>':'')+
   '<div data-comparison-status-wrapper>'+status+'</div>'+results+
   richFacts+relatedMarkup+
   (pending?'<p><a class="offer-link" href="/comparar/'+esc(slug)+'">Actualizar resultados manualmente</a></p>':'')+
   '</div>';
  res.set('Cache-Control','private,no-store');
  res.send(shell(title,description,content,'/comparar/'+slug,approved,seo.structuredData(page,ordinary,approved,'/comparar/'+slug)));
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
