'use strict';
// Low-cost and transparent fallback for an initial editorial suggestion.
// It does NOT rewrite a complete article or verify any statement.
// Human review and editing are mandatory before internal approval.
function editorialDraftV3213(item={}){
  const source=String(item.source_name||'el medio original').replace(/\s+/g,' ').trim().slice(0,80);
  const rawTitle=String(item.source_title||'').replace(/\s+/g,' ').trim();
  const topic=rawTitle.replace(/[.!?\s]+$/g,'').slice(0,173);
  if(topic.length<8)return {title:'',summary:'',note:'',provisional:true};
  const safeTopic=topic.charAt(0).toLowerCase()+topic.slice(1);
  const title=('Qué explica '+source+' sobre '+safeTopic).slice(0,220);
  const categoryLabels={
    actualidad:'actualidad',tecnologia:'tecnología',cultura:'cultura',
    deportes:'deportes',sociedad:'sociedad',entretenimiento:'entretenimiento'
  };
  const category=categoryLabels[item.category]||'actualidad';
  const summary=(
    source+' ha publicado una noticia relacionada con «'+topic+'». '+
    'Este contenido se ha detectado mediante una fuente RSS clasificada en '+category+'. '+
    'Para ofrecer una síntesis rigurosa es necesario leer el artículo completo, '+
    'verificar sus afirmaciones y fecha, y redactar el contexto con palabras propias. '+
    'La propuesta es orientativa y no representa una comprobación de los hechos.'
  ).slice(0,1100);
  const note='Propuesta automática basada en metadatos RSS, no revisada. Deben comprobarse la fuente, hechos, contexto y derechos antes de aprobar.';
  return {title,summary,note,provisional:true};
}
if(typeof module!=='undefined'&&module.exports)module.exports={editorialDraftV3213};
if(typeof window!=='undefined')window.editorialDraftV3213=editorialDraftV3213;
