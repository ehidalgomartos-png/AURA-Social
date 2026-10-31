'use strict';
// V3.6.29 — comprobación bajo demanda, con rutas fijas del propio sitio.
// No consulta Search Console ni confirma la indexación por buscadores.
(()=>{
 const ORIGIN='https://redlibertad.com';
 const TOPICS=Object.freeze(['hogar','tecnologia','tramites','estudios','vida-cotidiana']);
 const GUIDE_PATHS=Object.freeze([
  '/resuelve/como-funciona','/resuelve/guia-pedir-ayuda','/resuelve/guia-ayudar-personas'
 ]);
 const TARGETS=Object.freeze([
  {path:'/resuelve/como-funciona',label:'Cómo funciona',type:'html'},
  {path:'/resuelve/guia-pedir-ayuda',label:'Guía para pedir ayuda',type:'html'},
  {path:'/resuelve/guia-ayudar-personas',label:'Guía para ayudar',type:'html'},
  {path:'/sitemap-resuelve.xml',label:'Sitemap de soluciones',type:'xml',kind:'solutions'},
  {path:'/sitemap-resuelve-temas.xml',label:'Sitemap de temas',type:'xml',kind:'topics'},
  {path:'/sitemap-resuelve-presentacion.xml',label:'Sitemap de guías',type:'xml',kind:'editorial'}
 ]);
 const MAX_BYTES=1500000;
 function classify(issues,warnings){
  return issues.length?'error':warnings.length?'warning':'ok';
 }
 function inspectHtml(text,target,{Parser,headerRobots='' }={}){
  const issues=[],warnings=[];
  if(typeof text!=='string'||!Parser)throw Error('analizador_html_no_disponible');
  const doc=new Parser().parseFromString(text,'text/html');
  const head=doc.head;
  const find=selector=>head?.querySelector(selector)?.getAttribute('content')?.trim()||'';
  const canonical=head?.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim()||'';
  const expected=ORIGIN+target.path;
  const title=String(doc.title||'').trim();
  const description=find('meta[name="description"]');
  const robots=find('meta[name="robots"]').toLowerCase();
  const header=String(headerRobots||'').toLowerCase();
  const ogUrl=find('meta[property="og:url"]');
  if(title.length<12)issues.push('Falta un título SEO suficiente.');
  if(description.length<50)issues.push('Falta una descripción útil.');
  if(canonical!==expected)issues.push('Canonical ausente o diferente de la URL pública.');
  if(!robots||!/(?:^|[,\s])index(?:$|[,\s])/.test(robots))issues.push('No declara index,follow en robots meta.');
  if(/noindex|none/.test(robots+' '+header))issues.push('La página declara noindex.');
  if(!ogUrl||ogUrl!==expected)warnings.push('Open Graph URL ausente o diferente.');
  if(!doc.querySelector('main h1'))issues.push('Falta el título principal de la guía.');
  if(!/^es(?:-|$)/i.test(doc.documentElement?.getAttribute('lang')||''))warnings.push('No indica idioma español.');
  return {status:classify(issues,warnings),issues,warnings,details:title,entries:null};
 }
 function allowedLocation(kind,uri){
  let url;
  try{url=new URL(uri);}catch(_){return false;}
  if(url.origin!==ORIGIN||url.search||url.hash||url.username||url.password)return false;
  if(kind==='editorial')return GUIDE_PATHS.includes(url.pathname);
  if(kind==='solutions')return /^\/resuelve\/solucion\/[1-9]\d{0,15}$/.test(url.pathname);
  if(kind==='topics')return TOPICS.some(topic=>url.pathname==='/resuelve/temas/'+topic);
  return false;
 }
 function inspectSitemap(text,target,{Parser,headerRobots=''}={}){
  if(typeof text!=='string'||!Parser)throw Error('analizador_xml_no_disponible');
  const doc=new Parser().parseFromString(text,'application/xml');
  const issues=[],warnings=[];
  if(/(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(String(headerRobots||'')))
   issues.push('El servidor bloquea la indexación del sitemap con X-Robots-Tag.');
  if(doc.getElementsByTagName('parsererror').length||
   doc.documentElement?.localName!=='urlset'){
   return {status:'error',issues:['El documento no contiene un sitemap XML urlset válido.'],
    warnings,details:'XML inválido',entries:null};
  }
  const nodes=Array.from(doc.getElementsByTagName('url'));
  if(nodes.length>2000)warnings.push('Más de 2.000 URL en un sitemap; revisar los límites.');
  const urls=nodes.map(item=>{
   const loc=item.getElementsByTagName('loc')[0];
   return loc?.textContent?.trim()||'';
  });
  if(urls.some(loc=>!allowedLocation(target.kind,loc)))
   issues.push('Contiene una URL inesperada o fuera de las rutas públicas permitidas.');
  if(new Set(urls).size!==urls.length)warnings.push('Hay URL duplicadas.');
  if(target.kind==='editorial'){
   if(urls.length!==GUIDE_PATHS.length||
     GUIDE_PATHS.some(path=>!urls.includes(ORIGIN+path)))
    issues.push('Falta alguna de las tres páginas editoriales.');
  }else if(urls.length===0){
   warnings.push('Sitemap válido pero vacío: todavía no hay fichas aptas de este tipo.');
  }
  return {status:classify(issues,warnings),issues,warnings,
   details:urls.length+' URL públicas declaradas (sin comprobación de indexación).',
   entries:urls.length};
 }
 async function checkTarget(target,{fetchImpl,Parser,timers}={}){
  const fixed=TARGETS.find(item=>item.path===target?.path&&item.type===target.type);
  if(!fixed)throw Error('ruta_fuera_de_la_lista');
  target=fixed;
  const send=fetchImpl||(typeof fetch==='function'?fetch:null);
  const DOMParserClass=Parser||(typeof DOMParser!=='undefined'?DOMParser:null);
  const clocks=timers||{after:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)};
  if(typeof send!=='function')throw Error('fetch_no_disponible');
  const controller=new AbortController();
  const timeout=clocks.after(()=>controller.abort(),8000);
  try{
   const response=await send(target.path,{
    method:'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',
    headers:{Accept:target.type==='html'?'text/html':'application/xml,text/xml'},
    signal:controller.signal
   });
   if(!response||response.status!==200||response.type==='opaqueredirect'||
      response.redirected===true||
      (response.url&&response.url!==ORIGIN+target.path))
    return {path:target.path,label:target.label,status:'error',
     httpStatus:response?.status||null,issues:['No devuelve HTTP 200 sin redirecciones.'],
     warnings:[],details:'Revisar respuesta o destino del enlace.',entries:null};
   const media=String(response.headers?.get('content-type')||'').toLowerCase();
   const declaredSize=Number(response.headers?.get('content-length')||0);
   if(declaredSize>MAX_BYTES)
    return {path:target.path,label:target.label,status:'error',httpStatus:200,
     issues:['Respuesta demasiado grande para esta comprobación.'],warnings:[],
     details:'Comprobar el archivo manualmente.',entries:null};
   if(target.type==='html'&&!media.includes('text/html')||
      target.type==='xml'&&!/(?:application|text)\/xml/.test(media))
    return {path:target.path,label:target.label,status:'error',httpStatus:200,
     issues:['El tipo de contenido no coincide con el esperado.'],warnings:[],
     details:'Tipo recibido: '+(media||'no declarado').slice(0,80),entries:null};
   const body=await response.text();
   if(body.length>MAX_BYTES)
    return {path:target.path,label:target.label,status:'error',httpStatus:200,
     issues:['Respuesta demasiado grande para analizarla.'],warnings:[],
     details:'Comprobar el archivo manualmente.',entries:null};
   const report=target.type==='html'?
    inspectHtml(body,target,{Parser:DOMParserClass,headerRobots:response.headers?.get('x-robots-tag')}):
    inspectSitemap(body,target,{Parser:DOMParserClass,headerRobots:response.headers?.get('x-robots-tag')});
   return {path:target.path,label:target.label,httpStatus:200,...report};
  }catch(_){
   return {path:target.path,label:target.label,status:'error',httpStatus:null,
    issues:['No se pudo completar la comprobación (conexión o tiempo de espera).'],
    warnings:[],details:'Revisar el enlace manualmente.',entries:null};
  }finally{clocks.clear(timeout);}
 }
 const api=Object.freeze({TARGETS,GUIDE_PATHS,allowedLocation,inspectHtml,inspectSitemap,checkTarget});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof window!=='undefined')window.ResuelveSeoLiveChecks=api;
})();
