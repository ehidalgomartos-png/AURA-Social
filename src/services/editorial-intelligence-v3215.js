'use strict';
// V3.2.15 — Explainable, deterministic editorial decision SUPPORT.
// Uses RSS metadata only. Never verifies facts, claims rights, approves,
// alters source content, or publishes automatically. No third-party requests.
const CATEGORIES=['actualidad','tecnologia','cultura','deportes','sociedad','entretenimiento'];
const RULES={
  tecnologia:[
    [/\b(ciberseguridad|hacke[oa]|phishing|malware|ransomware|inteligencia artificial|chatgpt|software|procesadores?|microchips?|inform[aá]tica|telefon[ií]a|smartphones?|ordenadores?|robot[s]?|programaci[oó]n|criptograf[ií]a)\b/iu,7,'tecnología informática'],
    [/\b(apple|android|google|microsoft|iphone|ipad|macbook|samsung|openai|internet|redes sociales|ciberataques?)\b/iu,5,'plataforma o dispositivo digital']
  ],
  deportes:[
    [/\b(f[uú]tbol|baloncesto|tenis|ciclismo|f[oó]rmula 1|grand slam|marat[oó]n|liga de campeones|mundial de clubes|nba|champions league|motogp)\b/iu,7,'competición deportiva'],
    [/\b(partidos?|entrenadores?|futbolistas?|atletas?|selecci[oó]n espa[nñ]ola)\b/iu,4,'actividad deportiva']
  ],
  cultura:[
    [/\b(literatura|novelas?|escritores?|poes[ií]a|museos?|exposiciones?|pintura|esculturas?|patrimonio cultural|bibliotecas?|teatro|arquitectura|artistas? pl[aá]sticos)\b/iu,6,'arte o cultura'],
    [/\b(libros?|autores?|festivales? literarios?|historia del arte)\b/iu,5,'actividad cultural']
  ],
  entretenimiento:[
    [/\b(series? de televisi[oó]n|pel[ií]culas?|estrenos? cinematogr[aá]ficos?|netflix|hbo|disney\+?|streaming|videojuegos?|actores?|actrices|cantantes?|influencers?|celebridades?|programas? de televisi[oó]n)\b/iu,6,'cine, televisión u ocio'],
    [/\b(conciertos?|m[uú]sica pop|entretenimiento|espect[aá]culos?|moda|zara|look[s]?|tendencias? de moda)\b/iu,5,'espectáculo o moda']
  ],
  sociedad:[
    [/\b(educaci[oó]n|escuelas?|alumnos?|colegios?|universidades?|salud p[uú]blica|hospitales?|sanidad|viviendas?|alquileres?|familias?|igualdad|derechos humanos|migraci[oó]n|violencia machista|estafas?|fraudes?)\b/iu,6,'impacto social'],
    [/\b(consumidores?|ciudadanos?|barrios?|salud mental|bienestar|empleo juvenil)\b/iu,4,'vida cotidiana o sociedad']
  ],
  actualidad:[
    [/\b(congreso de los diputados|gobierno|ministros?|parlamento|elecciones?|presupuestos generales|tribunal supremo|presidente del gobierno|diputados?|pol[ií]tica internacional|aranceles?|diplomacia)\b/iu,7,'política y actualidad'],
    [/\b(econom[ií]a|inflaci[oó]n|impuestos?|bolsa de valores|tipos de inter[eé]s|bancos? centrales?|ministerio)\b/iu,5,'economía y actualidad']
  ]
};
const STOP=new Set(('a al algo algunos ante antes asi aun aunque bajo bien cada casi como con contra cual cuales cuando de del desde donde dos el ella ellos en entre era es esta estas este estos fue ha han hasta hay la las le les lo los mas me mi mis mucho muy ni no nos o para pero por porque que quien quienes se sea ser si sin sobre solo son su sus tal tan te tiene toda todos tras tu un una unas uno unos y ya').split(' '));
function clean(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9ñ\s]/g,' ').replace(/\s+/g,' ').trim();}
function tokens(input){
  return [...new Set(clean(input).split(' ').filter(x=>x.length>=4&&!STOP.has(x)))];
}
function categoryAdvice(item){
  const title=String(item.source_title||'');
  const excerpt=String(item.source_excerpt||'').slice(0,400);
  const scores={};const why={};
  for(const [category,patterns] of Object.entries(RULES)){
    scores[category]=0;why[category]=[];
    for(const [expression,points,reason] of patterns){
      // For ambiguous cases, a headline match is more persuasive than an excerpt.
      if(expression.test(title)){scores[category]+=points;why[category].push(reason);}
      else if(expression.test(excerpt)){scores[category]+=Math.floor(points/2);why[category].push(reason+' (extracto)');}
    }
  }
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const first=ranked[0],next=ranked[1],current=CATEGORIES.includes(item.category)?item.category:'actualidad';
  if(!first||first[1]<5||first[1]-(next?.[1]||0)<2)return {category:current,confidence:'low',reason:'Datos RSS insuficientes o temática ambigua',changeSuggested:false};
  return {category:first[0],confidence:first[1]>=10?'high':'medium',reason:why[first[0]].join('; ').slice(0,130),changeSuggested:first[0]!==current};
}
function possibleDuplicates(item,pool=[],limit=3){
  const base=tokens(item.source_title);
  if(base.length<4)return [];
  const matches=[];
  for(const other of pool){
    if(String(other.id)===String(item.id)||String(other.source_id||'')===String(item.source_id||''))continue;
    const their=tokens(other.source_title);
    if(their.length<4)continue;
    const days=Math.abs(new Date(item.published_at||item.fetched_at).getTime()-new Date(other.published_at||other.fetched_at).getTime())/86400000;
    if(!Number.isFinite(days)||days>14)continue;
    const shared=base.filter(x=>their.includes(x)).length;
    const union=new Set([...base,...their]).size;
    const similarity=union?shared/union:0;
    if(shared>=3&&similarity>=0.48){
      matches.push({id:other.id,source_name:String(other.source_name||'Medio distinto'),title:String(other.source_title||'').slice(0,240),similarity:Math.round(similarity*100),status:other.status});
    }
  }
  return matches.sort((a,b)=>b.similarity-a.similarity).slice(0,limit);
}
function advise(item,pool=[],now=new Date()){
  const cat=categoryAdvice(item),similar=possibleDuplicates(item,pool);
  const date=new Date(item.published_at||item.fetched_at);
  const age=Number.isFinite(date.getTime())?Math.max(0,(now.getTime()-date.getTime())/86400000):365;
  let score=age<=1?75:age<=3?58:age<=7?37:age<=14?22:8;
  const reasons=[];
  if(age<=3)reasons.push('noticia reciente');
  if(age>7)reasons.push('fecha de origen antigua: revisarla');
  if(cat.changeSuggested){score-=8;reasons.push('comprobar clasificación');}
  if(similar.length){score-=Math.min(35,15+5*similar.length);reasons.push('posible tema ya cubierto por otro medio');}
  if(!item.source_excerpt||String(item.source_excerpt).trim().length<50){score-=7;reasons.push('extracto RSS escaso');}
  if(item.editorial_title&&item.editorial_summary){score+=5;reasons.push('borrador disponible');}
  return {
    category_suggestion:cat,
    possible_duplicates:similar,
    priority_score:Math.max(0,Math.min(100,score)),
    priority_label:score>=60?'alta':score>=35?'media':'baja',
    reasons,
    provisional:true
  };
}
function enrich(items,pool,now=new Date()){
  const remaining=items.map(row=>({...row,advice:advise(row,pool,now)}));
  const ranked=[],selectedCategories={},selectedSources={};
  while(remaining.length){
    let bestIndex=0,best=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const row=remaining[i];
      const cat=row.advice.category_suggestion.category;
      // The first few positions should not be occupied solely by one RSS feed.
      const adjusted=row.advice.priority_score-
        Math.min(26,(selectedCategories[cat]||0)*7)-
        Math.min(21,(selectedSources[String(row.source_id)]||0)*9);
      if(adjusted>best){best=adjusted;bestIndex=i;}
    }
    const [row]=remaining.splice(bestIndex,1);
    const cat=row.advice.category_suggestion.category;
    const source=String(row.source_id);
    const seen=selectedCategories[cat]||0;
    selectedCategories[cat]=seen+1;
    selectedSources[source]=(selectedSources[source]||0)+1;
    ranked.push({...row,advice:{...row.advice,diversity_note:seen>=3?'varias noticias de esta categoría':'selección temática variada'}});
  }
  return ranked;
}
module.exports={CATEGORIES,categoryAdvice,possibleDuplicates,advise,enrich,tokens};
