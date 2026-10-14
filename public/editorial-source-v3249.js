'use strict';
// V3.2.49: Attribution display fallback, no database mutations.
const GENERIC=new Set(['actualidad','deportes','tecnologia','cultura','sociedad','entretenimiento',
  'noticias','noticia','news','rss','rss feed','fuente','fuente original','medio','sin nombre',
  'redlibertad deportes','redlibertad actualidad','redlibertad tecnologia','redlibertad cultura',
  'redlibertad sociedad','redlibertad entretenimiento']);
function normalized(name){return String(name||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');}
function sourceLabel(name,url){
  const original=String(name||'').trim().slice(0,100);
  if(original&&!GENERIC.has(normalized(original)))return original;
  try{
    const u=new URL(String(url||''));
    if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')){
      return u.hostname.toLowerCase().replace(/^www\./,'').slice(0,100);
    }
  }catch(_){}
  return 'Fuente original';
}
module.exports={sourceLabel};