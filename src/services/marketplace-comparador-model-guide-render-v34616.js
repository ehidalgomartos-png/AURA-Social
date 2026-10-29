'use strict';
// V3.4.6.16: HTML y datos estructurados de guías revisadas manualmente.
const guides=require('./marketplace-comparador-model-guides-v34616');
const categories=require('./marketplace-comparador-landing-pages-v34613');
const ORIGIN='https://redlibertad.com';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cards(items){
 return '<ul class="cmp-model-guide-cards">'+items.map(g=>
  '<li><a href="'+guides.pathFor(g.slug)+'"><strong>'+e(g.title)+
  '</strong><span>Leer las diferencias y preparar una comparación</span></a></li>').join('')+'</ul>';
}
function hub(){
 return '<div class="cmp-landings cmp-model-guides">'+
 '<p class="crumb"><a href="/comparar">Comparador</a> / Guías de modelos</p>'+
 '<header class="cmp-landings-hero"><span class="cmp-landing-eyebrow">Guías de compra · RedLibertad</span>'+
 '<h1>Guías para comparar marcas y modelos</h1>'+
 '<p>Antes de comparar importes, identifica la versión de producto que buscas. Cada guía explica diferencias que suelen cambiar el precio y el contenido de una oferta.</p></header>'+
 '<section class="cmp-model-guide-section"><h2>Guías de modelos específicos</h2>'+cards(guides.GUIDES)+'</section>'+
 '<section class="cmp-model-guide-section"><h2>Cómo comparar de forma fiable</h2>'+
 '<ol><li>Identifica modelo y variante sin asumir que todos los anuncios coinciden.</li>'+
 '<li>Compara compras con compras: una cuota de alquiler no es el precio del producto.</li>'+
 '<li>Comprueba fecha, vendedor y estado de cada oferta.</li>'+
 '<li>Confirma el precio final y la disponibilidad en la tienda antes de pagar.</li></ol>'+
 '<p>Las fichas de comparación solo se enlazan cuando pasan los filtros de calidad de RedLibertad.</p>'+
 '<p><a href="'+categories.HUB+'">Explorar categorías del comparador</a></p></section></div>';
}
function detail(g,offers){
 const list=rows=>rows.map(([name,desc])=>'<li><h3>'+e(name)+'</h3><p>'+e(desc)+'</p></li>').join('');
 const qs=g.searches.map(q=>'<li><a class="cmp-landing-search-link" href="/comparar?q='+
  encodeURIComponent(q)+'#compareQ"><span class="cmp-landing-search-name">'+e(q)+
  '</span><span class="cmp-landing-search-cta">Preparar comparación <span aria-hidden="true">→</span></span></a></li>').join('');
 const faqs=g.faq.map(([q,a])=>'<details><summary>'+e(q)+'</summary><p>'+e(a)+'</p></details>').join('');
 const vetted=offers.length?
  '<section class="cmp-landing-vetted"><h2>Comparaciones disponibles del modelo</h2><p>Estas fichas guardadas cumplen actualmente los criterios del comparador. Los precios pueden variar; confírmalos en la tienda.</p><ul>'+
  offers.map(p=>'<li><a href="/comparar/'+e(p.slug)+'">'+e(p.query_text)+'</a></li>').join('')+'</ul></section>':
  '<section class="cmp-landing-vetted"><h2>Comparaciones disponibles del modelo</h2>'+
  '<p>No encontramos fichas de este modelo con suficientes ofertas recientes para recomendarlas aquí. Puedes preparar una búsqueda sin consultar automáticamente precios.</p></section>';
 return '<div class="cmp-landings cmp-model-guides">'+
  '<p class="crumb"><a href="/comparar">Comparador</a> / <a href="'+guides.HUB+'">Guías de modelos</a> / '+e(g.key)+'</p>'+
  '<header class="cmp-landings-hero"><span class="cmp-landing-eyebrow">Guía de compra · '+e(g.key)+'</span>'+
  '<h1>'+e(g.title)+'</h1><p>'+e(g.intro)+'</p></header>'+
  '<section class="cmp-landing-method"><h2>Versiones y diferencias importantes</h2>'+
  '<ol class="cmp-landing-checks">'+list(g.variants)+'</ol></section>'+
  '<section class="cmp-landing-method"><h2>Qué comprobar antes de comprar</h2>'+
  '<ol class="cmp-landing-checks">'+list(g.checks)+'</ol></section>'+
  vetted+
  '<section class="cmp-landing-searches"><h2>Preparar una comparación específica</h2>'+
  '<p>Estas sugerencias rellenan el buscador. Abrirlas no consulta precios ni consume cuota; la búsqueda se ejecuta únicamente cuando la envías.</p>'+
  '<ul class="cmp-landing-search-grid">'+qs+'</ul></section>'+
  '<section class="cmp-landing-faq"><h2>Preguntas frecuentes</h2>'+faqs+'</section>'+
  '<section class="cmp-model-guide-section"><h2>Otras guías</h2>'+
  cards(guides.GUIDES.filter(x=>x.slug!==g.slug))+
  '<p><a href="'+categories.pathFor(g.category)+'">Volver a la categoría de este producto</a></p></section>'+
  '<p class="cmp-landing-disclosure">Información orientativa, no una prueba práctica ni una verificación de existencias. RedLibertad no vende estos artículos ni garantiza precios o estados. Confirma condiciones con cada comercio.</p></div>';
}
function schema(path,title,description,offers=[]){
 const url=ORIGIN+path;
 const crumbs=[{name:'RedLibertad',url:ORIGIN+'/'},
  {name:'Comparador',url:ORIGIN+'/comparar'},
  {name:'Guías de modelos',url:ORIGIN+guides.HUB}];
 if(path!==guides.HUB)crumbs.push({name:title,url});
 const graph=[
  {'@type':path===guides.HUB?'CollectionPage':'WebPage','@id':url+'#page',
   url,name:title,description,inLanguage:'es-ES',breadcrumb:{'@id':url+'#breadcrumb'}},
  {'@type':'BreadcrumbList','@id':url+'#breadcrumb',
   itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,name:c.name,item:c.url}))}
 ];
 const filtered=offers.filter(p=>/^[a-z0-9-]{4,120}$/.test(p.slug||''));
 if(filtered.length)graph.push({'@type':'ItemList','@id':url+'#comparaciones',
  itemListElement:filtered.map((p,i)=>({'@type':'ListItem',position:i+1,
   name:p.query_text,url:ORIGIN+'/comparar/'+p.slug}))});
 return {'@context':'https://schema.org','@graph':graph};
}
module.exports={hub,detail,schema,cards};
