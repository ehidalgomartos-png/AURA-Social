'use strict';
// V3.2.48 — bounded, publicly safe news discovery. Never reads drafts,
// private profiles, imported thumbnails, user accounts or reaction data.
const {categoryLabel,LABELS}=require('./editorial-category-v3247');
const categories=Object.freeze(['actualidad','deportes','tecnologia','cultura','sociedad','entretenimiento']);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);
const validId=id=>/^[1-9][0-9]{0,14}$/.test(String(id||''));
function filter(raw){
  if(raw===undefined)return {valid:true,category:''};
  if(typeof raw!=='string'||!categories.includes(raw))return {valid:false,category:''};
  return {valid:true,category:raw};
}
function categoryTabs(active=''){
  const opts=[['','Todas'],...categories.map(id=>[id,categoryLabel(id)])];
  return '<nav class="ed-discovery-tabs-v3248" aria-label="Filtrar noticias por categoría">'+
    opts.map(([id,label])=>'<a href="/noticias'+(id?'?categoria='+id:'')+'"'+
      (id===active?' aria-current="page"':'')+'>'+esc(label)+'</a>').join('')+'</nav>';
}
function relatedNews(rows,category,{safeImage=()=>false}={}){
  const safe=Array.isArray(rows)?rows.filter(x=>validId(x?.id)).slice(0,3):[];
  if(!safe.length)return '';
  return '<section class="ed-related-v3248" aria-labelledby="ed-related-title-v3248">'+
    '<div class="ed-related-head-v3248"><div><span>SEGUIR DESCUBRIENDO</span>'+
    '<h2 id="ed-related-title-v3248">Más noticias de '+esc(categoryLabel(category))+'</h2></div>'+
    '<a href="/noticias?categoria='+encodeURIComponent(categories.includes(category)?category:'actualidad')+'">Ver sección ↗</a></div>'+
    '<div class="ed-related-grid-v3248">'+safe.map(row=>{
      const path='/noticias/p/'+encodeURIComponent(row.id);
      const image=typeof safeImage==='function'&&safeImage(row.image_url)
        ?'<a class="ed-related-photo-v3249" href="'+path+'"><img src="'+esc(row.image_url)+'" alt="" loading="lazy" decoding="async">'+
          (row.image_origin==='ai'?'<span>Ilustración IA</span>':'')+'</a>':'';
      return '<article class="ed-related-card-v3248">'+image+
        '<div class="ed-related-content-v3249"><span class="ed-related-topic-v3249">'+esc(categoryLabel(category))+'</span>'+
        '<a class="ed-related-title-v3249" href="'+path+'">'+esc(String(row.title||'Noticia'))+'</a>'+
        '<p>'+esc(String(row.summary||'').slice(0,185))+'</p>'+
        '<a class="ed-related-read-v3249" href="'+path+'" aria-label="Leer noticia: '+esc(String(row.title||'Noticia'))+'">Leer noticia →</a></div></article>';
    }).join('')+'</div></section>';
}
module.exports={filter,categoryTabs,relatedNews,categories,validId,esc};
