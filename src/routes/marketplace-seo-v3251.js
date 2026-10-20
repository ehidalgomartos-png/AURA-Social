'use strict';
// V3.2.51 Public Marketplace SEO: server-rendered, accessible without login.
const express=require('express');
const path=require('path');
const db=require('../db');
const {ensureMarketplaceSchema}=require('./marketplace-v3250');
const {icon:marketplaceIcon}=require('../marketplace-icons-v3259');
const {publicLocation,originLocation,coverageLabel,nationalSale,catalogLocation}=require('../services/marketplace-coverage-v3261');
const {validGtin}=require('../services/marketplace-google-v3264');
const {purchaseLink,freshWooStock}=require('../services/marketplace-professional-v3276');
const {ensureProfessionalSchema}=require('./marketplace-professional-v3276');
const {requireAdmin,requireAuth}=require('../middleware/auth');
const {readableDescription,descriptionParts}=require('../services/marketplace-description-v3267');
const marketplaceLandingV32111=require('../marketplace-landing-v32111');
const marketplaceCategorySeoV32112=require('../marketplace-category-seo-v32112');
const marketplaceProductMetaV32118=require('../services/marketplace-product-meta-v32118');
const marketplaceMerchantV32124=require('../services/marketplace-merchant-structured-v32124');
const marketplaceSeoAuditV32120=require('../services/marketplace-seo-audit-v32120');
const marketplaceSitemapPlanV32122=require('../services/marketplace-sitemap-plan-v32122');
const marketplaceGscReadOnlyV32123=require('../services/marketplace-gsc-readonly-v32123');
const marketplaceDiscoveryV32130=require('../services/marketplace-public-discovery-v32130');
const router=express.Router();
const ORIGIN='https://redlibertad.com';
const GENERAL_MARKET_CATEGORIES_V3273=["Hogar y muebles","Electrodomésticos","Decoración","Jardín y bricolaje","Moda y accesorios","Belleza y cuidado personal","Tecnología","Móviles y telefonía","Informática","Videojuegos","Vehículos","Deportes y ocio","Bebés y niños","Juguetes y juegos","Libros y coleccionismo","Arte y antigüedades","Mascotas","Música e instrumentos","Alimentación","Regalos y personalización","Tazas","Otros productos","Reformas y mantenimiento","Clases y formación","Salud y bienestar","Hogar y limpieza","Profesionales","Transporte y mudanzas","Informática y reparación","Eventos y celebraciones","Belleza y estética","Cuidado de personas","Otros servicios","Pisos","Casas","Habitaciones","Locales","Terrenos","Garajes","Trasteros","Oficinas","Otros inmuebles"];
// Preset sections retain the unchanged V3.2.75 taxonomy, ordered by listing type.
const MARKET_CATEGORY_GROUPS_V3274={
 product:GENERAL_MARKET_CATEGORIES_V3273.slice(0,22),
 service:GENERAL_MARKET_CATEGORIES_V3273.slice(22,33),
 property:GENERAL_MARKET_CATEGORIES_V3273.slice(33)
};
const PAGE_SIZE=marketplaceSitemapPlanV32122.PAGE_SIZE;
const safeId=value=>/^[1-9]\d{0,15}$/.test(String(value||''));
const validImage=value=>/^\/uploads\/[A-Za-z0-9._-]{1,180}\.(?:jpe?g|png|webp)$/i.test(String(value||''));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonLd=data=>JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function slugify(value){return String(value||'anuncio').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75)||'anuncio';}
function listingPath(row){return '/marketplace/p/'+encodeURIComponent(row.id)+'/'+slugify(row.title);}
function imagePath(row,index){return '/marketplace/imagen/'+encodeURIComponent(row.id)+'/'+index;}
function imagePaths(row){return (Array.isArray(row.image_urls)?row.image_urls:[]).slice(0,6).map((v,i)=>validImage(v)?ORIGIN+imagePath(row,i):null).filter(Boolean);}
// V3.2.119: the sitemap uses the same public image proxy as listing pages.
// Include at most six different approved local photos, never raw upload paths
// or external media links (which might disclose private origins).
function sitemapImagePaths(row){
 const images=Array.isArray(row?.image_urls)?row.image_urls.slice(0,6):[];
 const seen=new Set(),result=[];
 images.forEach((file,index)=>{
  if(!validImage(file)||seen.has(file))return;
  seen.add(file);
  result.push(ORIGIN+imagePath(row,index));
 });
 return result;
}
function sitemapListingEntry(row){
 const pictures=sitemapImagePaths(row).map(url=>
  '<image:image><image:loc>'+esc(url)+'</image:loc></image:image>').join('');
 return '<url><loc>'+esc(ORIGIN+listingPath(row))+'</loc><lastmod>'+
  new Date(row.updated_at).toISOString()+'</lastmod>'+pictures+'</url>';
}
function seoDescription(row){return readableDescription(row.description).replace(/(?:\s*(?:WhatsApp|Facebook|Twitter)){2,}\s*$/i,'').replace(/\s+/g,' ').trim();}
function locality(row){return publicLocation(row);}
function price(row){return (Number(row.price_cents||0)/100).toFixed(2);}
function displayPrice(row){return (Number(row.price_cents||0)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});}
const RECENT_MS=7*24*60*60*1000;
function recentListing(row,now=Date.now()){
 const created=Date.parse(row?.created_at||'');
 return row?.status!=='paused'&&Number.isFinite(created)&&now>=created&&now-created<=RECENT_MS;
}
function listingFacts(row){
 const d=row?.details||{},facts=[];
 if(row.kind==='product'&&['new','used'].includes(d.condition))facts.push(['Estado',d.condition==='new'?'Nuevo':'Usado']);
 if(row.kind==='product'&&typeof d.brand==='string'&&d.brand.trim())facts.push(['Marca',d.brand.trim().slice(0,80)]);
 if(row.kind==='product'&&validGtin(d.gtin))facts.push(['EAN / GTIN',d.gtin]);
 if(row.kind==='product'&&typeof d.mpn==='string'&&d.mpn.trim())facts.push(['Referencia del fabricante',d.mpn.trim().slice(0,70)]);
 if(row.kind==='service'){
  const modes={in_person:'Presencial',remote:'A distancia',both:'Presencial y a distancia'};
  if(Object.hasOwn(modes,d.serviceMode))facts.push(['Modalidad',modes[d.serviceMode]]);
  if(typeof d.serviceArea==='string'&&d.serviceArea.trim())facts.push(['Zona de servicio',d.serviceArea.trim().slice(0,100)]);
 }
 if(row.kind==='property'){
  if(Number.isInteger(d.areaM2)&&d.areaM2>0&&d.areaM2<=100000)facts.push(['Superficie',d.areaM2+' m²']);
  if(Number.isInteger(d.rooms)&&d.rooms>=0&&d.rooms<=100)facts.push(['Habitaciones',String(d.rooms)]);
  if(typeof d.subtype==='string'&&d.subtype.trim())facts.push(['Tipo',d.subtype.trim().slice(0,60)]);
 }
 return facts;
}
function eligible(row){return !!row&&row.status==='active'&&row.moderation_status==='published'&&row.seller_status==='active'&&row.seller_discoverable===true;}
function entitySchema(row,url,images){
 const data={ '@context':'https://schema.org',name:row.title,description:seoDescription(row).slice(0,3000),url};
 if(images.length)data.image=images;
 if(row.category)data.category=row.category;
 if(row.deal==='buy'){
  // Wanted ads must not masquerade as merchant product offers in Google.
  return {...data,'@type':'WebPage',about:row.kind==='property'?{'@type':'Accommodation',name:row.title}:{'@type':'Product',name:row.title},description:'Busco comprar. '+data.description};
 }
 const offer={'@type':'Offer',url,price:price(row),priceCurrency:'EUR',availability:row.external_source==='api'&&(!freshWooStock(row)||row.external_stock_status!=='in_stock')||row.external_stock_status==='out_of_stock'?'https://schema.org/OutOfStock':'https://schema.org/InStock'};
 const details=row.details&&typeof row.details==='object'?row.details:{};
 if(row.kind==='product'){
   // Seller attribution is based on the same PUBLIC user and, if approved,
   // independently verified external purchase destination already visible.
   const seller=marketplaceMerchantV32124.sellerForOffer(row);
   if(seller)offer.seller=seller;
   if(['new','used'].includes(details.condition))offer.itemCondition='https://schema.org/'+(details.condition==='new'?'NewCondition':'UsedCondition');
   if(nationalSale(row))offer.areaServed={'@type':'Country',name:'España'};
   const product={...data,'@type':'Product',offers:offer};
   if(typeof details.brand==='string'&&details.brand.trim())product.brand={'@type':'Brand',name:details.brand.trim().slice(0,80)};
   if(validGtin(details.gtin))product['gtin'+details.gtin.length]=details.gtin;
   if(typeof details.mpn==='string'&&details.mpn.trim())product.mpn=details.mpn.trim().slice(0,70);
   return product;
 }
 if(row.kind==='service')return {...data,'@type':'Service',serviceType:row.category,areaServed:{'@type':'Place',name:details.serviceArea||row.city},offers:offer};
 const home={'@type':'Accommodation',name:row.title};
 if(Number.isInteger(details.areaM2)&&details.areaM2>0)home.floorSize={'@type':'QuantitativeValue',value:details.areaM2,unitCode:'MTK'};
 if(Number.isInteger(details.rooms)&&details.rooms>=0)home.numberOfRooms=details.rooms;
 return {...data,'@type':'RealEstateListing',about:home,datePosted:new Date(row.created_at).toISOString(),offers:{...offer,description:row.deal==='rent'?'Alquiler':'Venta'}};
}
function structuredData(row,url,images,categoryDef=null){
 const crumbs=[
  {'@type':'ListItem',position:1,name:'RedLibertad',item:ORIGIN+'/'},
  {'@type':'ListItem',position:2,name:'Marketplace',item:ORIGIN+'/marketplace/explorar'}
 ];
 if(categoryDef)crumbs.push({'@type':'ListItem',position:3,name:categoryDef.h1,item:ORIGIN+categoryDef.path});
 crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:row.title,item:url});
 return {'@context':'https://schema.org','@graph':[entitySchema(row,url,images),{'@type':'BreadcrumbList',itemListElement:crumbs}]};
}
const ogDefault=ORIGIN+'/assets/og-redlibertad.png';
function shell({title,description,canonical,body,ogImage=ogDefault,schema=null,robots='index,follow,max-image-preview:large',backHref='/marketplace/explorar',bodyClass=''}){
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
 '<title>'+esc(title)+'</title><meta name="description" content="'+esc(description)+'"><meta name="robots" content="'+esc(robots)+'">'+
 '<link rel="canonical" href="'+esc(canonical)+'"><meta property="og:site_name" content="RedLibertad"><meta property="og:type" content="website">'+
 '<meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'">'+
 '<meta property="og:url" content="'+esc(canonical)+'"><meta property="og:image" content="'+esc(ogImage)+'">'+
 '<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0d3e4a">'+
 '<link rel="icon" href="/marketplace/icon-192.png" type="image/png">'+
 '<link rel="apple-touch-icon" href="/marketplace/icon-192.png">'+
 '<link rel="stylesheet" href="/marketplace-v3250.css?v=3.2.75"><link rel="stylesheet" href="/marketplace-seo-v3251.css?v=3.2.77.8">'+
 '<link rel="stylesheet" href="/marketplace-landing-v32111.css?v=3.2.111">'+
 '<link rel="stylesheet" href="/marketplace-category-seo-v32112.css?v=3.2.112">'+
 '<link rel="stylesheet" href="/marketplace-category-links-v32113.css?v=3.2.113">'+
 (schema?'<script type="application/ld+json">'+jsonLd(schema)+'</script>':'')+'<script src="/marketplace-share-v3254.js?v=3.2.75" defer></script>'+
 '<script src="/marketplace-category-filter-v3274.js?v=3.2.75" defer></script><script src="/marketplace-pwa-retire-v3266.js?v=3.2.75" defer></script><script src="/marketplace-gallery-v3263.js?v=3.2.63.2" defer></script></head>'+
 '<body class="'+esc(bodyClass)+'"><header class="bar"><a class="back" href="'+esc(backHref)+'" aria-label="Volver">←</a><a class="brand" href="/marketplace/explorar">Marketplace</a><a class="headname" href="/app?view=explore&amp;marketReturn=1">RedLibertad</a></header>'+
 '<main>'+body+'</main><footer class="site-foot market-public-footer"><a href="/app?view=explore&amp;marketReturn=1">Volver a RedLibertad</a><a href="/marketplace?publicar=1">Publicar anuncio</a><span>RedLibertad no procesa pagos.</span></footer></body></html>';
}
async function publicListing(id){
 await ensureMarketplaceSchema();
 await ensureProfessionalSchema();
 const result=await db.query('SELECT l.id,l.title,l.description,l.category,l.city,l.kind,l.deal,l.price_cents,l.image_urls,l.details,l.status,l.moderation_status,l.created_at,l.updated_at,u.username AS seller_username,u.display_name AS seller_name,u.status AS seller_status,u.discoverable AS seller_discoverable,s.name AS professional_store_name,s.store_url AS store_url,s.status AS store_status,s.purchase_enabled AS purchase_enabled,x.product_url AS external_product_url,x.stock_status AS external_stock_status,x.source AS external_source,x.last_checked_at AS external_checked_at FROM marketplace_listings l JOIN users u ON u.id=l.seller_id LEFT JOIN marketplace_external_products x ON x.listing_id=l.id AND x.seller_id=l.seller_id LEFT JOIN marketplace_professional_stores s ON s.id=x.store_id AND s.seller_id=l.seller_id WHERE l.id=$1 LIMIT 1',[id]);
 return result.rows[0]||null;
}
function unavailable(res,gone=false){
 res.setHeader('X-Robots-Tag','noindex,nofollow');res.setHeader('Cache-Control','no-store');
 return res.status(gone?410:404).type('html').send(shell({title:'Anuncio no disponible · RedLibertad',description:'Este anuncio no está disponible.',canonical:ORIGIN+'/marketplace/explorar',robots:'noindex,nofollow',body:'<section class="hero"><div><h1>Anuncio no disponible</h1><p>Encuentra otros anuncios de la comunidad.</p></div><a class="primary" href="/marketplace/explorar">Explorar</a></section>'}));
}
function listingDescriptionHtml(row){
 const {preview,more}=descriptionParts(row.description);
 return '<section class="market-description-section"><h2>Descripción</h2><p class="market-seo-description">'+esc(preview)+'</p>'+
  (more?'<details class="market-description-expand"><summary>Leer descripción completa</summary><p class="market-seo-description">'+esc(more)+'</p></details>':'')+'</section>';
}
function listingHtml(row,related=[],categoryDef=null){
 const url=ORIGIN+listingPath(row),images=imagePaths(row);
 const gallery=images.length?'<div class="market-listing-gallery" data-market-gallery><section class="gallery" tabindex="0" aria-label="Fotografías del anuncio">'+images.map((image,i)=>'<img loading="'+(i?'lazy':'eager')+'" src="'+esc(image)+'" alt="'+esc('Fotografía '+(i+1)+' de '+row.title)+'"'+(i===0?' fetchpriority="high"':'')+'>').join('')+'</section>'+(images.length>1?'<nav class="market-gallery-controls" aria-label="Navegar fotografías"><button type="button" data-market-prev aria-label="Fotografía anterior" disabled>←</button><output aria-live="polite" data-market-counter>1 de '+images.length+'</output><button type="button" data-market-next aria-label="Fotografía siguiente">→</button></nav>':'')+'</div>':'';
 const date=new Date(row.created_at).toISOString(),updated=new Date(row.updated_at).toISOString();
 const location=locality(row),origin=originLocation(row),coverage=coverageLabel(row),sellerLink='/perfil/'+encodeURIComponent(row.seller_username);
 const isProductSale=row.kind==='product'&&row.deal==='sale';
 const verifiedPurchaseUrl=purchaseLink(row);
 const contactHref='/marketplace?contact='+encodeURIComponent(row.seller_username)+'&listing='+encodeURIComponent(row.id);
 const buyAnchor=verifiedPurchaseUrl?
  '<a class="primary market-product-buy-v32778" href="'+esc(verifiedPurchaseUrl)+'" target="_blank" rel="noopener noreferrer">Comprar en la tienda ↗</a>':'';
 const chatAnchor='<a class="'+(verifiedPurchaseUrl?'secondary market-product-contact market-product-chat-v32778':'primary market-product-contact')+'" href="'+esc(contactHref)+'">Consultar al vendedor →</a>';
 const offerActions=verifiedPurchaseUrl?
  '<div class="market-product-offer-actions-v32778">'+buyAnchor+chatAnchor+'</div>':chatAnchor;
 const purchaseNote=verifiedPurchaseUrl?
  'Comprarás y pagarás en la web del vendedor. RedLibertad no gestiona pagos ni envíos. Consulta las condiciones de envío y devolución de esa tienda antes de pagar; puedes preguntar por el chat.':
  'Contacto por el chat de RedLibertad. Para escribir necesitas iniciar sesión. RedLibertad no gestiona pagos ni envíos. Confirma con el vendedor las condiciones de entrega y devolución antes de acordar el pago.';
 const mobileAction=verifiedPurchaseUrl?
  '<a class="market-mobile-buy-v32778" href="'+esc(verifiedPurchaseUrl)+'" target="_blank" rel="noopener noreferrer">Comprar en la tienda ↗</a>':
  '<a href="'+esc(contactHref)+'">Consultar al vendedor →</a>';
 const contactText=row.deal==='buy'?'Contactar con quien busca':'Contactar con el anunciante';
 const otherAdsLink='/marketplace/vendedor/'+encodeURIComponent(row.seller_username);
 const shareLink=encodeURIComponent(url),shareTitle=encodeURIComponent('Mira este anuncio en RedLibertad: '+row.title+' '+url);
 const categoryBrowse=marketplaceDiscoveryV32130.categoryBrowse(row);
 const category=[row.category,row.details?.subcategory].filter(Boolean).join(' · ');
 const qualifiedCategory=marketplaceCategorySeoV32112.candidateCategories(row).includes(categoryDef)?categoryDef:null;
 const categoryCrumb=qualifiedCategory?'<a href="'+esc(qualifiedCategory.path)+'">'+esc(qualifiedCategory.h1)+'</a> › '+esc(row.title):esc(row.category);
 const categoryLink=qualifiedCategory?'<nav class="market-qualified-category-v32113" aria-label="Anuncios de la misma categoría"><a href="'+esc(qualifiedCategory.path)+'">Explorar '+esc(qualifiedCategory.h1)+' →</a></nav>':'';
 const body='<nav class="muted" aria-label="Ruta de navegación"><a href="/">Inicio</a> › <a href="/marketplace/explorar">Marketplace</a> › '+categoryCrumb+'</nav>'+
 '<article class="market-seo-item"><header><span class="chip market-deal-'+esc(row.deal)+'">'+esc(row.deal==='buy'?'BUSCO COMPRAR':row.deal==='sale'?'EN VENTA':row.deal==='rent'?'ALQUILER':row.kind==='service'?'SERVICIO':'PRODUCTO')+'</span>'+(recentListing(row)?'<span class="chip market-new-chip" title="Publicado recientemente">RECIENTE</span>':'')+'<h1>'+esc(row.title)+'</h1>'+
 '<p class="muted">'+esc(category)+' · '+esc(location)+' · <time datetime="'+esc(date)+'">'+esc(new Date(row.created_at).toLocaleDateString('es-ES'))+'</time></p></header>'+
 gallery+(isProductSale?'<section class="market-product-offer" aria-label="Precio y contacto"><div><span class="market-product-offer-label">Precio anunciado</span><p class="price">'+esc(displayPrice(row))+'</p></div>'+offerActions+'<p class="market-contact-note">'+purchaseNote+'</p></section>':'<p class="price">'+esc((row.deal==='buy'?'Presupuesto máximo: ':'')+displayPrice(row)+(row.deal==='rent'?' / mes':''))+'</p>')+
 listingDescriptionHtml(row)+
 '<section><h2>'+(coverage?'Origen y ámbito de venta':'Ubicación')+'</h2>'+(
   coverage?(origin?'<p><strong>Origen:</strong> '+esc(origin)+'</p>':'')+'<p><strong>Ámbito de venta:</strong> '+esc(coverage)+'</p>':'<p>'+esc(location)+'</p>')+'</section>'+
 (listingFacts(row).length?'<section class="market-fact-section"><h2>Datos del anuncio</h2><dl class="market-seo-facts">'+listingFacts(row).map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></section>':'')+
 '<section><h2>'+(row.deal==='buy'?'Persona que busca':'Vendedor o anunciante')+'</h2><p><a class="seller-profile-link" href="'+esc(sellerLink)+'">'+esc(row.seller_name||row.seller_username)+'</a></p><p><a class="market-seller-more" href="'+esc(otherAdsLink)+'">Ver otros anuncios de esta persona →</a></p></section>'+
 '<div class="market-seo-actions">'+(!isProductSale?'<a class="primary" href="'+esc(contactHref)+'">'+esc(contactText)+'</a>':'')+'<a class="secondary" href="/marketplace/explorar">Ver más anuncios</a></div>'+
 '<section class="market-share"><h2>Compartir anuncio</h2><div class="market-share-actions"><button type="button" class="market-native-share-v3272" data-market-native-share="'+esc(url)+'" data-market-share-title="'+esc(row.title)+'">Compartir desde el móvil ↗</button><a class="market-community-link-v3269" data-market-community-share-v3273 hidden href="/app?view=feed&amp;compartirAnuncio='+encodeURIComponent(row.id)+'">Publicar en RedLibertad</a><a href="https://api.whatsapp.com/send?text='+shareTitle+'" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u='+shareLink+'" target="_blank" rel="noopener noreferrer">Facebook</a><button type="button" data-copy-url="'+esc(url)+'">Copiar enlace</button><a href="/marketplace?report='+encodeURIComponent(row.id)+'">Denunciar anuncio</a></div><p id="marketCopyNotice" role="status" aria-live="polite"></p></section>'+
 '<p class="market-category-more-v3272"><a class="market-more-category-v3272" href="'+esc(categoryBrowse)+'">Ver más anuncios de '+esc(row.category)+' →</a></p>'+categoryLink+
 '<p class="muted">Consulta el perfil público del anunciante y confirma la información antes de acordar un pago o envío. RedLibertad no procesa pagos ni garantiza las transacciones.</p><small class="muted">Actualizado <time datetime="'+esc(updated)+'">'+esc(new Date(row.updated_at).toLocaleDateString('es-ES'))+'</time></small></article>'+
 (isProductSale?'<nav class="market-mobile-contact" aria-label="'+(verifiedPurchaseUrl?'Comprar en la tienda':'Consulta sobre el producto')+'" hidden><span>'+esc(displayPrice(row))+'</span>'+mobileAction+'</nav>':'')+
 (related.length?'<section class="market-related" aria-label="Anuncios relacionados"><h2>También te puede interesar</h2><p>Otros anuncios públicos de la misma operación y de una categoría o ubicación similar.</p><div class="cards market-public-grid">'+related.map(listingCard).join('')+'</div><p class="market-discovery-more-v32130"><a href="'+esc(categoryBrowse)+'">Explorar más anuncios de esta categoría →</a></p></section>':'');
 const improvedProductMeta=marketplaceProductMetaV32118.forListing(row,{externalPurchase:Boolean(verifiedPurchaseUrl)});
 return shell({title:improvedProductMeta?.title||((row.deal==='buy'?'Busco comprar: ':'')+row.title+(nationalSale(row)?' | Venta en toda España':' en '+location)+' | RedLibertad Marketplace').slice(0,155),
 description:improvedProductMeta?.description||((row.deal==='buy'?'Se busca comprar. Presupuesto '+displayPrice(row)+'. ':'')+seoDescription(row)).slice(0,155),
 canonical:url,ogImage:images[0]||ogDefault,body,schema:structuredData(row,url,images,qualifiedCategory)});
}

const MARKETPLACE_MANIFEST={"id":"/marketplace","name":"Marketplace · RedLibertad","short_name":"Marketplace","description":"Compra, vende y encuentra productos, servicios e inmuebles. Comparte tu cuenta con RedLibertad.","start_url":"/marketplace/explorar","scope":"/marketplace","display":"standalone","background_color":"#f7f4ee","theme_color":"#0d3e4a","lang":"es","icons":[{"src":"/marketplace/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"/marketplace/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]};
router.get('/marketplace/manifest.webmanifest',(_req,res)=>{
 res.setHeader('Cache-Control','public,max-age=3600');
 res.type('application/manifest+json').send(JSON.stringify(MARKETPLACE_MANIFEST));
});
router.get('/marketplace/icon-:size.png',(req,res)=>{
 const size=Number(req.params.size);
 if(![192,512].includes(size)||!/^(192|512)$/.test(req.params.size))return res.sendStatus(404);
 res.setHeader('Cache-Control','public,max-age=604800,immutable');
 res.type('image/png').send(marketplaceIcon(size));
});
// V3.2.120: private, read-only diagnostic. Never expose data in public routes
// and never represent this report as real Search Console index coverage.
router.get('/marketplace/seo/auditoria',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-seo-audit-v32120.html'));
});
router.get('/api/admin/marketplace/seo/auditoria',requireAdmin,async(_req,res,next)=>{
 try{
  await ensureMarketplaceSchema();
  const [metrics,sample,categoryCounts]=await Promise.all([
   db.query(marketplaceSeoAuditV32120.metricsSql),
   db.query(marketplaceSeoAuditV32120.sampleSql),
   db.query(marketplaceCategorySeoV32112.countQuery())
  ]);
  const audit=marketplaceSeoAuditV32120.report({
   metrics:metrics.rows[0]||{},
   rows:sample.rows,
   categoryCounts:categoryCounts.rows[0]||{},
   categories:marketplaceCategorySeoV32112.LANDINGS,
   isCategoryIndexable:marketplaceCategorySeoV32112.canIndex,
   listingPath
  });
  // Counts already originate from the strict public-only audit queries.
  // Do not imply these URLs were fetched or verified by Search Console.
  // V3.2.124: explain optional merchant metadata from the *same*
  // public, capped sample, not from unverified WooCommerce policies.
  audit.merchantStructuredAdvice=marketplaceMerchantV32124.merchantSample(sample.rows);
  audit.duplicateTitleCandidates=marketplaceDiscoveryV32130.duplicateTitleCandidates(sample.rows,{listingPath});
  audit.technicalSitemaps=marketplaceSitemapPlanV32122.summary(
   metrics.rows[0]||{},categoryCounts.rows[0]||{},marketplaceCategorySeoV32112.LANDINGS,marketplaceCategorySeoV32112.canIndex
  );
  // Configuration metadata only: does not contact Google or reveal secrets.
  audit.googleSearchConsole=marketplaceGscReadOnlyV32123.status();
  res.setHeader('Cache-Control','private,no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  return res.json(audit);
 }catch(error){next(error);}
});
router.get('/marketplace/mi-tienda',requireAuth,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-subscriptions-v3278.html'));
});
// V3.2.87: seller-only served HTML. Static JS/CSS do not include sensitive data.
router.get('/marketplace/contratacion',requireAuth,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-contract-preview-v3287.html'));
});
router.get('/marketplace/suscripciones/lanzamiento',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-launch-readiness-v3289.html'));
});
// V3.2.123: manual read-only Google Search Console requests are strictly
// separated from the original audit-only GET routes above.
router.use('/api/admin/marketplace/seo/gsc',require('./marketplace-gsc-v32123').createGscRouter({
 listingPath,ensureMarketplaceSchema
}));
router.get('/marketplace/suscripciones/comercial',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-commercial-v3281.html'));
});
router.get('/marketplace/suscripciones/laboratorio',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-stripe-test-v3280.html'));
});
router.get('/marketplace/suscripciones',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-subscription-admin-v3279.html'));
});
router.get('/marketplace/tiendas',requireAdmin,(_req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 res.type('html').sendFile(path.join(__dirname,'..','views','marketplace-professional-v3276.html'));
});
router.get('/marketplace/importar',(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.type('html').sendFile(path.join(__dirname,'..','..','public','marketplace-import-v3260.html'));
});
router.get('/marketplace/p/:id/:slug?',async(req,res,next)=>{
 try{
  if(!safeId(req.params.id))return unavailable(res);
  const row=await publicListing(req.params.id);
  if(!eligible(row))return unavailable(res,row?.status==='sold');
  if(req.path!==listingPath(row)){res.setHeader('Cache-Control','public,max-age=60');return res.redirect(301,listingPath(row));}
  res.setHeader('Cache-Control','public,max-age=60');
  // Relevant public links only: same type and same sale/buy/rent/offer.
  // Hidden or paused ads and private/inactive sellers are excluded in SQL.
  const related=await db.query(
   marketplaceDiscoveryV32130.PUBLIC_RELATED_SQL,
   marketplaceDiscoveryV32130.relatedArgs(row));
  // A public advert may link back to a qualified SEO category, but must not
  // advertise thin/noindex pages or classify new store goods as second-hand.
  let qualifiedCategory=null;
  if(marketplaceCategorySeoV32112.candidateCategories(row).length){
   try{
    const categories=await db.query(marketplaceCategorySeoV32112.countQuery());
    qualifiedCategory=marketplaceCategorySeoV32112.qualifiedCategoryForListing(row,categories.rows[0]||{});
   }catch(categoryError){
    // Category discovery is optional: never break a public product page when
    // the aggregate query is temporarily unavailable.
    console.warn('Marketplace SEO category backlink unavailable:',categoryError?.message);
   }
  }
  return res.status(200).type('html').send(listingHtml(row,related.rows,qualifiedCategory));
 }catch(error){next(error);}
});
router.get('/marketplace/imagen/:id/:index',async(req,res,next)=>{
 try{
  if(!safeId(req.params.id)||!/^[0-5]$/.test(req.params.index))return res.sendStatus(404);
  const row=await publicListing(req.params.id);
  if(!eligible(row))return res.sendStatus(404);
  const url=Array.isArray(row.image_urls)?row.image_urls[Number(req.params.index)]:null;
  if(!validImage(url))return res.sendStatus(404);
  const filename=path.basename(url);
  if(filename!==url.slice('/uploads/'.length))return res.sendStatus(404);
  res.setHeader('Cache-Control','public,max-age=3600');
  return res.sendFile(filename,{root:path.resolve(process.env.UPLOAD_DIR||path.join(__dirname,'..','..','uploads'))},error=>{if(error&&!res.headersSent)next(error);});
 }catch(error){next(error);}
});
function listingCard(row){
 const url=listingPath(row),image=imagePaths(row)[0];
 return '<article class="card"><a class="market-seo-cardlink" href="'+esc(url)+'">'+(image?'<div class="thumb"><img loading="lazy" src="'+esc(image)+'" alt="'+esc(row.title)+'"></div>':'<div class="thumb" aria-hidden="true">▣</div>')+'<div class="cardbody"><div class="market-card-labels"><span class="chip">'+esc(row.deal==='buy'?'BUSCO':row.deal==='sale'?'EN VENTA':row.deal==='rent'?'ALQUILER':'SERVICIO')+'</span>'+(recentListing(row)?'<span class="chip market-new-chip" title="Publicado recientemente">RECIENTE</span>':'')+'</div><h2>'+esc(row.title)+'</h2><p class="price">'+esc((row.deal==='buy'?'Presupuesto: ':'')+displayPrice(row))+'</p><p class="muted">'+esc(catalogLocation(row))+'</p><span class="market-card-cta" aria-hidden="true">Ver anuncio →</span></div></a></article>';
}
// Public seller collections must never expose hidden, inactive or non-discoverable content.
router.get('/marketplace/vendedor/:username',async(req,res,next)=>{
 try{
  const username=String(req.params.username||'');
  if(!/^[A-Za-z0-9_.-]{3,30}$/.test(username))return unavailable(res);
  const requested=Number(req.query.pagina||1);
  const page=Number.isSafeInteger(requested)&&requested>=1&&requested<=1000?requested:1;
  await ensureMarketplaceSchema();
  const result=await db.query(
   "SELECT l.id,l.title,l.kind,l.deal,l.city,l.details,l.price_cents,l.image_urls,u.username AS seller_username,u.display_name AS seller_name FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE lower(u.username)=lower($1) AND u.status='active' AND u.discoverable=true AND l.status='active' AND l.moderation_status='published' ORDER BY l.created_at DESC,l.id DESC LIMIT 25 OFFSET $2",
   [username,(page-1)*24]);
  if(!result.rowCount)return unavailable(res);
  const seller=result.rows[0];
  const sellerPath='/marketplace/vendedor/'+encodeURIComponent(seller.seller_username);
  const pageLink=p=>sellerPath+(p>1?'?pagina='+p:'');
  const cards=result.rows.slice(0,24).map(listingCard).join('');
  const body='<section class="hero"><div><small>ANUNCIOS PÚBLICOS DEL ANUNCIANTE</small><h1>Anuncios de '+esc(seller.seller_name||seller.seller_username)+'</h1><p>Solo se muestran sus anuncios activos y públicos.</p></div><a class="primary" href="/perfil/'+encodeURIComponent(seller.seller_username)+'">Ver perfil</a></section>'+
   '<p class="market-seller-intro"><a href="/marketplace/explorar">← Volver a todos los anuncios</a></p>'+
   '<section class="cards market-public-grid" aria-label="Anuncios públicos de este usuario">'+cards+'</section>'+
   '<nav class="market-seo-pagination" aria-label="Paginación">'+(page>1?'<a class="secondary" href="'+esc(pageLink(page-1))+'">← Anteriores</a>':'')+
   (result.rows.length>24?'<a class="secondary" href="'+esc(pageLink(page+1))+'">Siguientes →</a>':'')+'</nav>';
  res.setHeader('Cache-Control','public,max-age=60');
  return res.type('html').send(shell({title:'Anuncios de '+(seller.seller_name||seller.seller_username)+' | RedLibertad Marketplace',
   description:'Productos, servicios e inmuebles anunciados públicamente en RedLibertad.',canonical:ORIGIN+pageLink(page),
   robots:'noindex,follow',body,bodyClass:'market-public-catalog'}));
 }catch(error){next(error);}
});
// Accessible public discovery: all query values are bounded, and sorting is allowlisted.
router.get('/marketplace/explorar',async(req,res,next)=>{
 try{
  await ensureMarketplaceSchema();
  const input=Number(req.query.pagina||1),page=Number.isSafeInteger(input)&&input>=1&&input<=1000?input:1;
  const operation=['sale','buy'].includes(req.query.operacion)?req.query.operacion:null;
  const kind=['product','service','property'].includes(req.query.tipo)?req.query.tipo:null;
  const q=String(req.query.q||'').trim().slice(0,80);
  const city=String(req.query.ciudad||'').trim().slice(0,80);
  const category=String(req.query.categoria||'').trim().slice(0,65);
  const nationalOnly=req.query.nacional==='1';
  const maxInput=String(req.query.precio_max||'').trim().slice(0,18);
  const maxPrice=/^\d{1,7}(?:[.,]\d{1,2})?$/.test(maxInput)?Math.round(Number(maxInput.replace(',','.'))*100):null;
  const sorts={recent:'l.created_at DESC,l.id DESC',price_asc:'l.price_cents ASC,l.id DESC',price_desc:'l.price_cents DESC,l.id DESC'};
  const sort=Object.hasOwn(sorts,req.query.orden)?req.query.orden:'recent';
  const params=new URLSearchParams();
  if(operation)params.set('operacion',operation);
  if(kind)params.set('tipo',kind);
  if(q)params.set('q',q);
  if(city)params.set('ciudad',city);
  if(category)params.set('categoria',category);
  if(nationalOnly)params.set('nacional','1');
  if(maxPrice!==null)params.set('precio_max',maxInput);
  if(sort!=='recent')params.set('orden',sort);
  const pageLink=n=>{
   const values=new URLSearchParams(params);
   if(n>1)values.set('pagina',n);
   return '/marketplace/explorar'+(values.size?'?'+values.toString():'');
  };
  // Categories use only public, active ads, including categories imported from WooCommerce.
  // A category is only shown under its real listing type. Private, hidden, and inactive listings never contribute.
  const categoryResult=await db.query(
   "SELECT MIN(BTRIM(l.category)) AS category, l.kind AS kind FROM marketplace_listings l JOIN users u ON u.id=l.seller_id "+
   "WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true "+
   "AND LENGTH(BTRIM(l.category)) BETWEEN 2 AND 65 GROUP BY l.kind, LOWER(BTRIM(l.category)) ORDER BY LOWER(BTRIM(l.category)) LIMIT 150");
  const grouped={product:new Map(),service:new Map(),property:new Map(),other:new Map()};
  const normalizeCategory=value=>String(value||'').trim().toLocaleLowerCase('es');
  const addCategory=(group,value)=>{
    const label=String(value||'').trim().slice(0,65),key=normalizeCategory(label);
    if(key && !grouped[group].has(key))grouped[group].set(key,label);
  };
  for(const [group,values] of Object.entries(MARKET_CATEGORY_GROUPS_V3274))
    for(const name of values)addCategory(group,name);
  const publishedCategories=[];
  for(const row of categoryResult.rows||[]){
    const name=String(row.category||'').trim(),group=['product','service','property'].includes(row.kind)?row.kind:'other';
    if(!name)continue;
    publishedCategories.push(name);
    // Existing WooCommerce categories are never reclassified or renamed.
    const match=Object.keys(MARKET_CATEGORY_GROUPS_V3274).find(type=>grouped[type].has(normalizeCategory(name)));
    addCategory(match||group,name);
  }
  // Preserve previously shared category URLs even if no current public advert exists.
  if(category&&!Object.values(grouped).some(map=>map.has(normalizeCategory(category))))
    addCategory(kind||'other',category);
  const categoryGroupLabel={product:'Productos',service:'Servicios',property:'Inmobiliaria',other:'Otras categorías publicadas'};
  const categoryGroupsHtml=Object.entries(grouped).map(([group,values])=>{
    if(!values.size)return '';
    const options=[...values.values()].sort((a,b)=>a.localeCompare(b,'es')).map(value=>
      '<option value="'+esc(value)+'"'+(normalizeCategory(category)===normalizeCategory(value)?' selected':'')+'>'+esc(value)+'</option>').join('');
    return '<optgroup label="'+esc(categoryGroupLabel[group])+'" data-market-kind-v3274="'+esc(group)+'">'+options+'</optgroup>';
  }).join('');
  const args=[operation,kind,q?'%'+q+'%':null,city?'%'+city+'%':null,(page-1)*24,category||null,nationalOnly,maxPrice];
  const result=await db.query(
   "SELECT l.id,l.title,l.kind,l.deal,l.city,l.details,l.price_cents,l.image_urls,l.created_at FROM marketplace_listings l JOIN users u ON u.id=l.seller_id "+
   "WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true "+
   "AND ($1::text IS NULL OR l.deal=$1) AND ($2::text IS NULL OR l.kind=$2) "+
   "AND ($3::text IS NULL OR l.title ILIKE $3 OR l.description ILIKE $3 OR l.category ILIKE $3) "+
   "AND ($4::text IS NULL OR l.city ILIKE $4) "+
   "AND ($6::text IS NULL OR LOWER(BTRIM(l.category))=LOWER($6)) "+
   "AND (NOT $7::boolean OR (l.kind='product' AND l.deal='sale' AND ("+
   "l.details->>'saleScope'='national' OR (COALESCE(l.details->>'saleScope','')='' "+
   "AND LOWER(l.city) IN ('españa','espana') AND LOWER(COALESCE(l.details->>'province','')) IN ('españa','espana'))))) "+
   "AND ($8::bigint IS NULL OR l.price_cents<=$8) "+
   "ORDER BY "+sorts[sort]+" LIMIT 25 OFFSET $5",
   args);
  const cards=result.rows.slice(0,24).map(listingCard).join('');
  const advanced=Boolean(city||kind||category||maxPrice!==null||sort!=='recent');
  const quickLink=overrides=>{
   const filters=new URLSearchParams(params);
   for(const [key,value] of Object.entries(overrides)){
    if(value===null||value==='')filters.delete(key);
    else filters.set(key,String(value));
   }
   filters.delete('pagina');
   return '/marketplace/explorar'+(filters.size?'?'+filters.toString():'');
  };
  const quickNav='<nav class="market-public-quick" aria-label="Explorar por categoría">'+
   '<a href="/marketplace/explorar"'+(!params.size?' aria-current="page"':'')+'>Todos</a>'+
   '<a href="'+esc(quickLink({tipo:'product',nacional:null}))+'"'+(kind==='product'&&!nationalOnly?' aria-current="page"':'')+'>Productos</a>'+
   '<a href="'+esc(quickLink({tipo:'product',operacion:'sale',ciudad:null,nacional:'1'}))+'"'+(nationalOnly?' aria-current="page"':'')+'>Venta en toda España</a>'+
   publishedCategories.slice(0,5).map(value=>'<a href="'+esc(quickLink({categoria:value,nacional:null}))+'"'+(category.toLowerCase()===value.toLowerCase()?' aria-current="page"':'')+'>'+esc(value)+'</a>').join('')+
   '</nav>';
  const activeLabels=[q?'Búsqueda: '+q:'',category?'Categoría: '+category:'',nationalOnly?'Venta en toda España':'',maxPrice!==null?'Hasta '+maxInput+' €':''].filter(Boolean);
  const selectedSummary=activeLabels.length?'<div class="market-filter-summary" aria-label="Filtros activos">'+
   activeLabels.map(label=>'<span>'+esc(label)+'</span>').join('')+
   '<a href="/marketplace/explorar">Limpiar filtros</a></div>':'';
  const filterBox='<form id="marketBuscador" class="market-public-filters" action="/marketplace/explorar" method="get" role="search">'+
   (operation?'<input type="hidden" name="operacion" value="'+esc(operation)+'">':'')+
   (nationalOnly?'<input type="hidden" name="nacional" value="1">':'')+
   '<div class="market-public-search">'+
    '<label>Buscar productos o anuncios<input name="q" type="search" maxlength="80" value="'+esc(q)+'" placeholder="Producto, servicio o inmueble…"></label>'+
    '<button type="submit" class="primary">Buscar</button></div>'+
   '<details class="market-public-advanced"'+(advanced?' open':'')+'><summary>Más filtros</summary>'+
    '<div class="market-public-extra"><label>Ciudad<input name="ciudad" maxlength="80" value="'+esc(city)+'" placeholder="Ej. Valencia"></label>'+
    '<label>Tipo de anuncio<select name="tipo">'+
     [['','Todos'],['product','Productos'],['service','Servicios'],['property','Inmobiliaria']].map(([value,label])=>'<option value="'+value+'"'+(kind===value||(!kind&&!value)?' selected':'')+'>'+label+'</option>').join('')+
    '</select></label>'+
    '<label>Categoría<select name="categoria"><option value="">Todas las categorías</option>'+
     categoryGroupsHtml+
    '</select><small class="market-category-help-v3273">Algunas categorías todavía no tienen anuncios.</small></label>'+
    '<label>Precio máximo (€)<input name="precio_max" type="text" inputmode="decimal" maxlength="18" value="'+esc(maxPrice!==null?maxInput:'')+'" placeholder="Ej. 250"></label>'+
    '<label>Ordenar<select name="orden">'+
     [['recent','Más recientes'],['price_asc','Precio más bajo'],['price_desc','Precio más alto']].map(([value,label])=>'<option value="'+value+'"'+(sort===value?' selected':'')+'>'+label+'</option>').join('')+
    '</select></label>'+
    '<button type="submit" class="secondary">Aplicar filtros</button>'+
    '<a class="market-clear-filters" href="/marketplace/explorar">Limpiar</a></div></details></form>';
  // V3.2.111: upgrade only the existing indexable canonical landing.
  // Filtered searches remain noindex and pagination retains its existing URLs.
  const landingHome=page===1&&!params.size;
  const categoryCounts=landingHome?(await db.query(marketplaceCategorySeoV32112.countQuery())).rows[0]||{}:null;
  const body=(landingHome?marketplaceLandingV32111.hero():'<section class="hero"><div><small>ANUNCIOS PÚBLICOS</small><h1>Marketplace RedLibertad</h1><p>Productos, servicios e inmobiliaria de la comunidad.</p></div><a class="primary" href="/marketplace?publicar=1">Publicar anuncio</a></section>')+
   '<nav class="market-deals" aria-label="Tipo de anuncio"><a href="/marketplace/explorar">Todos</a><a href="/marketplace/explorar?operacion=sale">En venta</a><a href="/marketplace/explorar?operacion=buy">Compra · Busco</a></nav>'+
   filterBox+quickNav+selectedSummary+
   '<div class="market-seo-intro"><h2>'+(params.size?'Resultados de búsqueda':'Últimos anuncios')+'</h2><p>Consulta los anuncios sin iniciar sesión. Para contactar con anunciantes necesitas una cuenta.</p></div>'+
   '<section id="anuncios" class="cards market-public-grid" aria-label="Anuncios públicos">'+(cards||'<div class="market-empty"><h2>No hay anuncios con estos criterios</h2><p>Prueba otra búsqueda o cambia los filtros.</p><a href="/marketplace/explorar" class="primary">Ver todos los anuncios</a></div>')+'</section>'+
   '<nav class="market-seo-pagination" aria-label="Paginación">'+(page>1?'<a class="secondary" href="'+esc(pageLink(page-1))+'">← Anteriores</a>':'')+
   (result.rows.length>24?'<a class="secondary" href="'+esc(pageLink(page+1))+'">Siguientes →</a>':'')+'</nav>'+
   (landingHome?marketplaceLandingV32111.categories()+
    marketplaceCategorySeoV32112.navigation(categoryCounts)+marketplaceLandingV32111.ending():'');
  const searching=Boolean(q||city||kind||category||nationalOnly||maxPrice!==null||sort!=='recent');
  res.setHeader('Cache-Control','public,max-age=60');
  return res.type('html').send(shell({
   backHref:'/app?view=explore&marketReturn=1',
   title:landingHome?marketplaceLandingV32111.TITLE:'Marketplace: productos, servicios e inmobiliaria | RedLibertad',
   description:landingHome?marketplaceLandingV32111.DESCRIPTION:'Descubre productos, servicios e inmuebles publicados en RedLibertad.',
   schema:landingHome?marketplaceLandingV32111.structuredData():null,
   canonical:ORIGIN+(searching?'/marketplace/explorar':pageLink(page)),
   robots:searching?'noindex,follow':'index,follow,max-image-preview:large',body,bodyClass:'market-public-catalog'
  }));
 }catch(error){next(error);}
});
// V3.2.112: finite public category landing pages. Never index thin/empty stock.
for(const categoryDef of marketplaceCategorySeoV32112.LANDINGS){
 router.get(categoryDef.path,async(req,res,next)=>{
  try{
   // Reject synthetic, unbounded and duplicate paging links.
   const rawPage=req.query.pagina===undefined?'1':req.query.pagina;
   if(!marketplaceCategorySeoV32112.validPage(rawPage))return unavailable(res);
   const page=Number(rawPage);
   await ensureMarketplaceSchema();
   const countsResult=await db.query(marketplaceCategorySeoV32112.countQuery());
   const counts=countsResult.rows[0]||{};
   const total=marketplaceCategorySeoV32112.totalFor(counts,categoryDef);
   const lastPage=Math.max(1,Math.ceil(total/marketplaceCategorySeoV32112.CATEGORY_PAGE_SIZE));
   if(page>lastPage)return unavailable(res);
   const eligibleFromCounts=marketplaceCategorySeoV32112.canIndex(counts,categoryDef);
   const result=total?(await db.query(marketplaceCategorySeoV32112.listingQuery(categoryDef,{page}))).rows:[];
   const listings=result.slice(0,marketplaceCategorySeoV32112.CATEGORY_PAGE_SIZE);
   if(page>1&&!listings.length)return unavailable(res);
   const hasNext=page<marketplaceCategorySeoV32112.MAX_CATEGORY_PAGES&&result.length>marketplaceCategorySeoV32112.CATEGORY_PAGE_SIZE;
   // A moderation change between COUNT and SELECT may remove cards. Never
   // index an empty later page or an undersized first collection.
   const minOnPage=page===1?marketplaceCategorySeoV32112.MIN_PUBLIC_ADS:1;
   const indexable=eligibleFromCounts&&listings.length>=minOnPage;
   const categoryPath=marketplaceCategorySeoV32112.categoryPath(categoryDef,page);
   const body=marketplaceCategorySeoV32112.content(categoryDef,{
    count:total,indexable,cards:listings.map(listingCard).join(''),
    page,visibleCount:listings.length,hasNext,
    typeNav:(categoryDef.slug==='muebles'||categoryDef.specialistId)?
     marketplaceCategorySeoV32112.furnitureNavigation(counts,{current:categoryDef.slug}):'',
    navigationHtml:marketplaceCategorySeoV32112.navigation(counts,{current:categoryDef.slug})
   });
   res.setHeader('Cache-Control','public,max-age=60');
   if(!indexable)res.setHeader('X-Robots-Tag','noindex, follow');
   return res.type('html').send(shell({
    title:categoryDef.title+(page>1?' — Página '+page:''),
    description:categoryDef.description+(page>1?' Página '+page+' de los anuncios disponibles.':''),
    canonical:ORIGIN+categoryPath,
    robots:indexable?'index,follow,max-image-preview:large':'noindex,follow',
    schema:indexable?marketplaceCategorySeoV32112.structuredData(categoryDef,listings,{page}):null,
    body,bodyClass:'market-public-catalog market-public-category-seo'
   }));
  }catch(error){next(error);}
 });
}
router.get('/sitemap-marketplace-categorias.xml',async(_req,res,next)=>{
 try{
  await ensureMarketplaceSchema();
  const result=await db.query(marketplaceCategorySeoV32112.countQuery());
  res.setHeader('Cache-Control','public,max-age=300');
  return res.type('application/xml').send(marketplaceCategorySeoV32112.sitemapXml(result.rows[0]||{}));
 }catch(error){next(error);}
});
router.get('/sitemap-marketplace.xml',async(_req,res,next)=>{
 try{
  await ensureMarketplaceSchema();
  const count=await db.query("SELECT count(*)::integer AS total FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true");
  const pages=Math.max(1,Math.ceil(Number(count.rows[0]?.total||0)/PAGE_SIZE));
  const entries=Array.from({length:pages},(_v,i)=>'<sitemap><loc>'+esc(ORIGIN+'/sitemap-marketplace-'+(i+1)+'.xml')+'</loc></sitemap>').join('');
  res.setHeader('Cache-Control','public,max-age=300');
  return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries+'</sitemapindex>');
 }catch(error){next(error);}
});
const MARKETPLACE_KINDS={productos:'product',servicios:'service',inmuebles:'property'};
const MARKETPLACE_XML_WHERE=" FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true AND l.kind=$1";
for(const [label,kind] of Object.entries(MARKETPLACE_KINDS)){
 router.get('/sitemap-marketplace-'+label+'.xml',async(_req,res,next)=>{
  try{
   await ensureMarketplaceSchema();
   const count=await db.query('SELECT count(*)::integer AS total'+MARKETPLACE_XML_WHERE,[kind]);
   const pages=Math.max(1,Math.ceil(Number(count.rows[0]?.total||0)/PAGE_SIZE));
   const entries=Array.from({length:pages},(_v,i)=>'<sitemap><loc>'+esc(ORIGIN+'/sitemap-marketplace-'+label+'-'+(i+1)+'.xml')+'</loc></sitemap>').join('');
   res.setHeader('Cache-Control','public,max-age=300');
   return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries+'</sitemapindex>');
  }catch(error){next(error);}
 });
 router.get('/sitemap-marketplace-'+label+'-:page.xml',async(req,res,next)=>{
  try{
   const page=Number(req.params.page);
   if(!Number.isSafeInteger(page)||page<1||page>50000)return res.sendStatus(404);
   await ensureMarketplaceSchema();
   const listings=await db.query('SELECT l.id,l.title,l.image_urls,l.updated_at'+MARKETPLACE_XML_WHERE+' ORDER BY l.created_at DESC,l.id DESC LIMIT $2 OFFSET $3',[kind,PAGE_SIZE,(page-1)*PAGE_SIZE]);
   if(page>1&&!listings.rowCount)return res.sendStatus(404);
   const entries=listings.rows.map(sitemapListingEntry);
   res.setHeader('Cache-Control','public,max-age=300');
   return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+entries.join('')+'</urlset>');
  }catch(error){next(error);}
 });
}
router.get('/sitemap-marketplace-:page.xml',async(req,res,next)=>{
 try{
  const page=Number(req.params.page);
  if(!Number.isSafeInteger(page)||page<1||page>50000)return res.sendStatus(404);
  await ensureMarketplaceSchema();
  const r=await db.query("SELECT l.id,l.title,l.image_urls,l.updated_at FROM marketplace_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' AND l.moderation_status='published' AND u.status='active' AND u.discoverable=true ORDER BY l.created_at DESC,l.id DESC LIMIT $1 OFFSET $2",[PAGE_SIZE,(page-1)*PAGE_SIZE]);
  if(page>1&&!r.rowCount)return res.sendStatus(404);
  const urls=r.rows.map(sitemapListingEntry);
  if(page===1)urls.unshift('<url><loc>'+esc(ORIGIN+'/marketplace/explorar')+'</loc></url>');
  res.setHeader('Cache-Control','public,max-age=300');
  return res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+urls.join('')+'</urlset>');
 }catch(error){next(error);}
});
module.exports={router,slugify,listingPath,eligible,entitySchema,jsonLd,listingHtml,imagePaths,sitemapImagePaths,sitemapListingEntry,MARKETPLACE_XML_WHERE,seoDescription,locality};
