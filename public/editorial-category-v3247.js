'use strict';
// V3.2.47 — lightweight, explainable *suggestions*, never editorial approval.
// No network calls, no browser storage, no AI credits and no data persisted.
(function(root){
  const LABELS=Object.freeze({
    actualidad:'Actualidad',deportes:'Deportes',tecnologia:'Tecnología',
    cultura:'Cultura',sociedad:'Sociedad',entretenimiento:'Entretenimiento'
  });
  const RULES=[
    {key:'deportes',paths:/\/(?:deportes?|futbol|fútbol|baloncesto|tenis|motor|formula-?1|champions)(?:\/|$)/i,
      words:/\b(?:futbol|champions|liga de campeones|partido|goles?|marcador|atl[eé]tico|real madrid|manchester united|baloncesto|tenis|grand slam|mundial de clubes|liga deportiva)\b/i},
    {key:'tecnologia',paths:/\/(?:tecnologia|tecnología|tecnologia-y-ciencia|informatica|tecnicas|innovacion|ciencia|digital)(?:\/|$)/i,
      words:/\b(?:tecnolog[ií]a|inteligencia artificial|chips?|microprocesadores?|ciberseguridad|software|inform[aá]tica|computaci[oó]n|telescopio espacial|rob[oó]tica)\b/i},
    {key:'cultura',paths:/\/(?:cultura|arte|literatura|libros|museos|cine)(?:\/|$)/i,
      words:/\b(?:museo|exposici[oó]n|novela|libro|literatura|patrimonio cultural|teatro|biblioteca|festival de cine|premio literario)\b/i},
    {key:'entretenimiento',paths:/\/(?:entretenimiento|television|televisi[oó]n|corazon|series|famosos)(?:\/|$)/i,
      words:/\b(?:reality|concurso televisivo|serie de televisi[oó]n|programa de televisi[oó]n|alfombra roja|celebridades|estreno televisivo)\b/i},
    {key:'sociedad',paths:/\/(?:sociedad|educacion|educaci[oó]n|salud|vivienda)(?:\/|$)/i,
      words:/\b(?:educaci[oó]n|colegios?|sanidad|vivienda|salud p[uú]blica|comunidad vecinal|alumnado|igualdad social)\b/i},
    {key:'actualidad',paths:/\/(?:actualidad|politica|pol[ií]tica|economia|econom[ií]a|internacional)(?:\/|$)/i,
      words:/\b(?:gobierno|parlamento|elecciones|presupuestos generales|pol[ií]tica|inflaci[oó]n|econom[ií]a|diplomacia)\b/i}
  ];
  const STYLES=Object.freeze({
    actualidad:'Actualidad: separa los hechos contrastados de las declaraciones atribuidas a personas u organismos. No añadas contexto político, causas o fechas no presentes.',
    deportes:'Deportes: solo cita resultados, marcadores, competiciones, fechas, alineaciones, goleadores y reacciones si aparecen expresamente en los datos disponibles. Nunca inventes jugadas ni atribuyas sensaciones a una afición.',
    tecnologia:'Tecnología: distingue anuncio, demostración y disponibilidad real; no atribuyas prestaciones, precios, fechas de lanzamiento ni evaluaciones sin base factual.',
    cultura:'Cultura: diferencia inauguración, programación y crítica; cita lugares, obras, fechas y nombres solo cuando consten en la información facilitada.',
    sociedad:'Sociedad: trata temas personales y de salud con cautela y sin generalizaciones. No inventes cifras de población, testimonios, diagnósticos ni responsabilidades.',
    entretenimiento:'Entretenimiento: evita rumores, insinuaciones sobre personas y lenguaje promocional; distingue anuncios oficiales de opiniones o especulaciones.'
  });
  const keys=Object.keys(LABELS);
  function categoryLabel(value){return LABELS[value]||'Noticias';}
  function editorialStyle(value){return STYLES[value]||STYLES.actualidad;}
  function suggest({canonical_url='',source_title='',source_excerpt=''}={}){
    const title=String(source_title||'').slice(0,240);
    const excerpt=String(source_excerpt||'').slice(0,400);
    let pathname='';
    try{
      const url=new URL(String(canonical_url||''));
      if(url.protocol==='https:'&&!url.username&&!url.password)pathname=url.pathname.slice(0,1500);
    }catch(_){}
    const scores=RULES.map(rule=>{
      const fromPath=rule.paths.test(pathname);
      const fromTitle=rule.words.test(title);
      const fromExcerpt=rule.words.test(excerpt);
      return {key:rule.key,score:(fromPath?5:0)+(fromTitle?3:0)+(fromExcerpt?1:0),
        cues:[...(fromPath?['sección del medio']:[]),...(fromTitle?['titular']:[]),...(fromExcerpt?['descripción']:[])]};
    }).sort((a,b)=>b.score-a.score);
    const winner=scores[0],second=scores[1];
    // Avoid defaulting to an inaccurate category with weak/ambiguous evidence.
    if(!winner||winner.score<4||winner.score-second.score<2){
      return {category:null,confidence:'insuficiente',explanation:'No hay una categoría clara. Selección manual necesaria.',advisoryOnly:true};
    }
    return {category:winner.key,confidence:winner.score>=7?'alta':'media',
      explanation:'Sugerencia basada en '+winner.cues.join(' y ')+'. Comprueba la categoría antes de publicar.',
      advisoryOnly:true};
  }
  const api={suggest,categoryLabel,editorialStyle,LABELS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.editorialCategoryV3247=api;
})(typeof globalThis!=='undefined'?globalThis:null);
