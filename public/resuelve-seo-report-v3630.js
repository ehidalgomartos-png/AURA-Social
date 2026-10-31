'use strict';
// V3.6.30 — informe técnico local de la auditoría, sin datos privados ni Google API.
(()=>{
 const LIMIT=6;
 const normalize=value=>String(value??'').replace(/[\r\n\t\u0000-\u001f<>]/g,' ').trim().slice(0,175);
 function recommendation(target,result){
  if(result?.status==='ok')return 'Sin incidencias técnicas detectadas en esta URL.';
  const notes=[...(result?.issues||[]),...(result?.warnings||[])].join(' ').toLowerCase();
  if(result?.httpStatus==null)return 'Comprobar disponibilidad, conexión, HTTPS y despliegue de esta ruta.';
  if(result.httpStatus!==200)return 'Revisar la ruta en el servidor: debe responder HTTP 200 sin redirección.';
  if(/noindex|robots|index,follow/.test(notes))
   return 'Revisar meta robots y X-Robots-Tag; indexar solo contenidos públicos con consentimiento y revisión.';
  if(/canonical|open graph/.test(notes))
   return 'Alinear las URL canonical y Open Graph con la dirección pública final.';
  if(/descripci[oó]n|t[ií]tulo/.test(notes))
   return 'Mejorar título y descripción con información útil, sin palabras clave repetitivas.';
  if(target?.type==='xml'){
   if(/vac[ií]o|vac[ií]a/.test(notes))return 'Sin fichas aptas todavía: no crear URLs ficticias para llenar el sitemap.';
   return 'Revisar estructura XML y permitir únicamente las URLs públicas autorizadas.';
  }
  return 'Abrir esta URL y comprobar contenido, etiquetas y presentación en móvil y ordenador.';
 }
 function makeReport(results,targets,date){
  if(!Array.isArray(results)||!Array.isArray(targets))return '';
  const allowed=targets.slice(0,LIMIT).filter(t=>/^\/(?:resuelve\/|sitemap-resuelve)/.test(t.path||''));
  const records=allowed.map(t=>({target:t,result:results.find(r=>r?.path===t.path)}));
  const counts={ok:0,warning:0,error:0};
  for(const {result} of records)counts[result?.status==='ok'?'ok':result?.status==='warning'?'warning':'error']++;
  const stamp=date instanceof Date&&!Number.isNaN(date.valueOf())?date.toLocaleString('es-ES'):'Fecha no disponible';
  const lines=[
   'RESUELVE · INFORME SEO TÉCNICO (COMPROBACIÓN MANUAL)',
   'Fecha: '+stamp,
   'Resultados: '+counts.error+' errores, '+counts.warning+' advertencias, '+counts.ok+' correctas.',
   'Solo verifica respuestas técnicas observadas desde el navegador.',
   'NO confirma rastreo ni indexación en Google. Para ello, consultar Search Console.',
   ''
  ];
  for(const {target,result} of records){
   const state=result?.status==='ok'?'Correcta':result?.status==='warning'?'Revisar':'Error técnico';
   lines.push('['+state+'] '+normalize(target.label)+' — '+normalize(target.path));
   lines.push('HTTP: '+(Number.isInteger(result?.httpStatus)?result.httpStatus:'sin respuesta'));
   const messages=[...(Array.isArray(result?.issues)?result.issues:[]),
    ...(Array.isArray(result?.warnings)?result.warnings:[])].slice(0,6);
   for(const msg of messages)lines.push('• '+normalize(msg));
   lines.push('Acción: '+recommendation(target,result),'');
  }
  return lines.join('\n').slice(0,7000);
 }
 const api=Object.freeze({recommendation,makeReport});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof window!=='undefined')window.ResuelveSeoReport=api;
})();