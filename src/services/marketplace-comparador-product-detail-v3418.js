'use strict';
// V3.4.1.8: ficha de producto a partir de datos comprobables, sin inventar atributos.
const provider=require('./marketplace-comparador-provider-v32133');
const {validOfferPhoto}=require('./marketplace-comparador-image-confidence-v3433');
const {recentFallback}=require('./marketplace-comparador-recent-images-v3432');
const colorWords=['blanco','blanca','negro','negra','gris','morado','morada','violeta','azul','verde','rojo','roja','beige','dorado','dorada','plateado','plateada','marrón','marron','rosa','amarillo','amarilla','natural','roble','antracita'];
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=cents=>(Number(cents)/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
function facts(query,offer){
 const text=String(offer?.title||query||'').slice(0,300);
 const q=String(query||'');
 const result=[];
 const push=(label,value)=>{if(value&&!result.some(x=>x.label===label))result.push({label,value});};
 const storage=(q.match(/\b(32|64|128|256|512|1024)\s*(GB|TB)\b/i)||text.match(/\b(32|64|128|256|512|1024)\s*(GB|TB)\b/i));
 if(storage)push('Capacidad',storage[1]+' '+storage[2].toUpperCase());
 const dims=text.match(/\b(\d{2,3}(?:[,.]\d+)?)\s*[x×]\s*(\d{2,3}(?:[,.]\d+)?)\s*[x×]\s*(\d{1,3}(?:[,.]\d+)?)\s*cm\b/i);
 if(dims)push('Dimensiones',dims.slice(1,4).join(' × ')+' cm');
 const colorPattern=new RegExp('\\b('+colorWords.join('|')+')\\b','i');
 const color=text.match(colorPattern);
 if(color)push('Color',color[1].charAt(0).toUpperCase()+color[1].slice(1).toLowerCase());
 const doors=text.match(/\b(\d{1,2})\s*puertas?\b/i);
 if(doors)push('Puertas',doors[1]);
 const shelves=text.match(/\b(\d{1,2})\s*(?:estantes?|baldas?)\b/i);
 if(shelves)push('Estantes',shelves[1]);
 const rawState=String(offer?.condition||'').trim();
 if(rawState&&rawState.length<48&&!/^(no indicado|consultar estado|estado sin confirmar)$/i.test(rawState))
  push('Estado',rawState);
 // El GTIN solo procede de un campo facilitado por la fuente de oferta.
 const gtin=String(offer?.gtin||offer?.ean||'').trim();
 if(/^\d{13}$/.test(gtin)){
  const digits=gtin.split('').map(Number);
  const sum=digits.slice(0,12).reduce((a,d,i)=>a+d*(i%2?3:1),0);
  if((10-sum%10)%10===digits[12])push('EAN / GTIN',gtin);
 }
 return result.slice(0,7);
}
function representativeOffer(offers){
 // Escoger foto por calidad de fuente y estado, NUNCA por precio mínimo.
 const rank=o=>{
  let n=0;
  if(o?.internal)n+=18;
  const link=o?.internal?{destination:'internal'}:provider.resolveOfferLink(o);
  if(link?.destination==='store'||link?.destination==='internal')n+=28;
  if(/\b(?:reacondicionado|refurbished|renewed)\b/i.test(String(o?.condition||'')+' '+String(o?.title||'')))n+=25;
  if(/\b(?:nuevo|precintado)\b/i.test(String(o?.condition||'')))n+=25;
  if(!o?.internal&&provider.safeImage(o.image))n+=18;
  if(o?.internal&&/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||''))n+=18;
  return n;
 };
 // Nunca mostrar un bloque vacío si otra oferta del mismo modelo tiene una foto segura.
 const withPhoto=offers.filter(o=>o?.internal?/^\/marketplace\/imagen\/\d+\/0$/.test(o.image||''):Boolean(provider.safeImage(o?.image)));
 return [...(withPhoto.length?withPhoto:offers)].sort((a,b)=>rank(b)-rank(a))[0]||null;
}
function commonFacts(query,offers){
 if(!Array.isArray(offers)||!offers.length)return [];
 if(offers.length===1)return facts(query,offers[0]);
 const sets=offers.map(o=>facts(query,o));
 const first=sets[0];
 return first.filter(f=>sets.every(list=>list.some(x=>x.label===f.label&&x.value.toLowerCase()===f.value.toLowerCase())));
}
function heroMarkup(query,offers,lastCheckedAt,isStale=false,repairCount=0,reviewedPhoto=null){
 if(!Array.isArray(offers)||!offers.length)return '';
 const item=representativeOffer(offers);
 const photoCandidates=offers.filter(o=>Boolean(validOfferPhoto(query,o)));
 const photoItem=photoCandidates.length?representativeOffer(photoCandidates):null;
 const title=(offers.length===1?String(item.title||query):String(query)).slice(0,250);
 const photoTitle=String(reviewedPhoto?.title||photoItem?.title||query).slice(0,250);
 const image=reviewedPhoto?.image|| (photoItem?validOfferPhoto(query,photoItem):null);
 const lowest=offers[0],price=Number.isSafeInteger(lowest.price_cents)&&lowest.price_cents>0?eur(lowest.price_cents):null;
 const condition=String(lowest.condition||'').toLowerCase();
 const count=offers.length;
 const sellers=new Set(offers.map(x=>String(x.shop||'').toLocaleLowerCase('es-ES'))).size;
 const chips=commonFacts(query,offers).filter(f=>f.label!=='Estado').slice(0,4);
 const imageBlock=image?'<img class="cmp-detail-photo" src="'+safe(image)+'" data-compare-fallback="'+safe(recentFallback(query))+'" alt="'+safe(photoTitle)+'" loading="eager" decoding="async" referrerpolicy="no-referrer">':
  '<div class="cmp-detail-noimage"><img class="cmp-illustration" src="'+safe(recentFallback(query))+'" alt="" width="140" height="140"><small>Fotografía no verificada · Ilustración de la categoría</small></div>';
 return '<section class="cmp-detail-hero" aria-labelledby="cmp-detail-name">'+
  '<div class="cmp-detail-image'+(image?'':' cmp-detail-image-placeholder')+'">'+imageBlock+(image?'<small class="cmp-detail-photo-source">'+(reviewedPhoto?'Fotografía revisada por RedLibertad':'Fotografía de una oferta')+'</small>':'')+'</div>'+
  '<div class="cmp-detail-copy"><p class="cmp-detail-eyebrow">Ficha del producto · RedLibertad</p>'+
  '<h2 id="cmp-detail-name">'+safe(title)+'</h2>'+
  (chips.length?'<ul class="cmp-detail-chips">'+chips.map(c=>'<li>'+safe(c.label)+': '+safe(c.value)+'</li>').join('')+'</ul>':'')+
  (price?'<p class="cmp-detail-price"><span>'+(isStale&&!lowest.internal?'Último precio registrado':'Precio '+(count>1?'desde':'registrado'))+'</span><strong>'+price+'</strong></p>':'')+
  (count>1?'<p class="cmp-detail-condition">Oferta más económica: '+safe(condition||'estado sin confirmar')+'. Comprueba su funcionamiento y estado.</p>':'')+
  '<p class="cmp-detail-merchant">'+count+' '+(count===1?'oferta':'ofertas')+' · '+sellers+' '+(sellers===1?'vendedor':'vendedores')+'</p>'+
  (repairCount?'<p class="cmp-detail-repair-note">'+repairCount+' '+(repairCount===1?'anuncio aparte':'anuncios aparte')+' con avería declarada o para piezas, sin mezclar sus precios.</p>':'')+
  '<a class="cmp-detail-action" href="#precios-y-tiendas">Ver '+(count===1?'la oferta':'las ofertas')+'</a>'+
  '<p class="cmp-detail-disclaimer">Precios orientativos. Consulta disponibilidad, funcionamiento, estado y envío en la tienda.</p></div></section>';
}
// Búsquedas como "armario" o "mesa" no identifican un artículo exacto.
// No se les atribuyen imagen, capacidad, dimensiones ni estado general.
function broadResultsMarkup(query,offers,isStale=false){
 if(!Array.isArray(offers)||!offers.length)return '';
 const lowest=offers[0];
 const sellers=new Set(offers.map(o=>String(o.shop||'').trim().toLowerCase()).filter(Boolean)).size;
 const count=offers.length;
 const price=Number.isSafeInteger(lowest.price_cents)&&lowest.price_cents>0?eur(lowest.price_cents):null;
 return '<section class="cmp-broad-results" aria-labelledby="cmp-detail-name">'+
  '<div class="cmp-broad-copy"><span class="cmp-detail-eyebrow">Búsqueda general · RedLibertad</span>'+
  '<h2 id="cmp-detail-name">Resultados para «'+safe(query)+'»</h2>'+
  '<p>Estas ofertas pueden corresponder a productos, medidas y modelos diferentes. No son necesariamente equivalentes.</p>'+
  '<p class="cmp-detail-merchant">'+count+' '+(count===1?'oferta':'ofertas')+' · '+sellers+' '+(sellers===1?'vendedor':'vendedores')+'</p></div>'+
  '<div class="cmp-broad-action">'+
  (price?'<span>'+(isStale?'Último mínimo de una oferta':'Mínimo de una oferta')+'</span>'+
   '<strong>'+price+'</strong>':'')+
  '<small>El precio más bajo no representa a toda la categoría.</small>'+
  '<a class="cmp-detail-action" href="#precios-y-tiendas">Ver productos y precios</a></div>'+
  '</section>';
}
function specificationsMarkup(query,offers){
 if(!Array.isArray(offers)||!offers.length)return '';
 const list=commonFacts(query,offers);
 if(!list.length)return '';
 return '<section class="cmp-detail-specifications" aria-labelledby="cmp-specs-title">'+
  '<div class="cmp-detail-section-head"><h2 id="cmp-specs-title">Características del producto</h2><p>Datos compartidos por las ofertas consultadas</p></div>'+
  '<dl>'+list.map(f=>'<div><dt>'+safe(f.label)+'</dt><dd>'+safe(f.value)+'</dd></div>').join('')+'</dl>'+
  '<small>Comprueba las especificaciones definitivas en la tienda antes de comprar.</small></section>';
}
function relatedMarkup(rows,currentSlug){
 const items=(Array.isArray(rows)?rows:[]).filter(x=>x&&/^[a-z0-9-]{4,120}$/.test(String(x.slug))&&x.slug!==currentSlug&&
  typeof x.query_text==='string'&&x.query_text.trim().length>=3).slice(0,6);
 if(!items.length)return '';
 return '<section class="cmp-detail-related" aria-labelledby="cmp-related-title">'+
  '<div class="cmp-detail-section-head"><h2 id="cmp-related-title">Otras comparaciones</h2><p>Productos y búsquedas diferentes</p></div>'+
  '<ul>'+items.map(x=>'<li><a href="/comparar/'+safe(x.slug)+'">'+safe(x.query_text)+'</a></li>').join('')+'</ul>'+
  '<small>Estas fichas pueden corresponder a otras variantes o modelos.</small></section>';
}
module.exports={facts,representativeOffer,commonFacts,heroMarkup,broadResultsMarkup,specificationsMarkup,relatedMarkup};
