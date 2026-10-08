'use strict';

// Fixed loopback-only checks: no caller-controlled URLs, ports or paths.
const CHECK_TIMEOUT_MS=2500;
const CACHE_MS=30000;
const CHECKS=Object.freeze([
  {key:'health',label:'Versión de la aplicación',path:'/api/health',method:'GET',critical:true},
  {key:'ready',label:'Conexión PostgreSQL',path:'/api/ready',method:'GET',critical:true},
  {key:'app',label:'Página de la aplicación',path:'/app',method:'HEAD'},
  {key:'manifest',label:'Manifiesto PWA',path:'/manifest.webmanifest',method:'HEAD'},
  {key:'worker',label:'Service worker',path:'/sw.js',method:'HEAD'},
  {key:'robots',label:'Robots para Google',path:'/robots.txt',method:'HEAD'},
  {key:'sitemap',label:'Índice de sitemaps',path:'/sitemap-index.xml',method:'HEAD'}
]);

function checkAdvice(key,status){
  if(status==='ok')return 'Respuesta correcta.';
  return ({
    health:'Comprobar el despliegue de la versión esperada en Coolify.',
    ready:'Revisar PostgreSQL, variables y /api/ready en Coolify.',
    app:'Comprobar la ruta /app y los logs del servidor.',
    manifest:'Revisar el manifiesto y los archivos PWA.',
    worker:'Revisar la entrega de /sw.js y el registro PWA.',
    robots:'Revisar robots.txt y las rutas de indexación pública.',
    sitemap:'Revisar el índice de sitemaps y los logs SEO.'
  })[key]||'Consultar los registros de Coolify.';
}

function validatePort(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>65535)throw new TypeError('Invalid local port');
  return n;
}

function createReleaseVerifier({
  port=process.env.PORT||3000,
  version,
  fetchFn=globalThis.fetch,
  now=()=>Date.now(),
  timeoutMs=CHECK_TIMEOUT_MS,
  cacheMs=CACHE_MS
}={}){
  const localPort=validatePort(port);
  if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(version||'')))throw new TypeError('Expected release version is required');
  if(typeof fetchFn!=='function')throw new TypeError('Fetch required');
  let cached=null,expiresAt=0,inFlight=null;

  async function check(item){
    const started=now();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchFn('http://127.0.0.1:'+localPort+item.path,{
        method:item.method,
        headers:{'Accept':item.method==='GET'?'application/json':'*/*'},
        signal:controller.signal,
        redirect:'manual'
      });
      const httpStatus=Number(response.status)||0;
      let ok=response.ok;
      let reason=null;
      if(item.key==='health'||item.key==='ready'){
        let body=null;
        try{body=await response.json();}catch(_){ok=false;reason='invalid_json';}
        if(body){
          if(body.ok!==true){ok=false;reason='not_ready';}
          if(body.version!==version){ok=false;reason='wrong_version';}
          if(item.key==='ready' && body.database!=='ready'){ok=false;reason='database_unavailable';}
        }
      }
      const status=ok?'ok':item.critical?'critical':'warning';
      return {
        key:item.key,label:item.label,status,httpStatus,
        elapsedMs:Math.max(0,Math.round(now()-started)),
        ...(reason?{reason}:{}),
        advice:checkAdvice(item.key,status)
      };
    }catch(error){
      return {
        key:item.key,label:item.label,status:item.critical?'critical':'warning',httpStatus:null,
        elapsedMs:Math.max(0,Math.round(now()-started)),
        reason:error?.name==='AbortError'?'timeout':'unreachable',
        advice:checkAdvice(item.key,'warning')
      };
    }finally{
      clearTimeout(timeout);
    }
  }
  async function run(){
    const checks=await Promise.all(CHECKS.map(check));
    const critical=checks.some(x=>x.status==='critical');
    const warning=checks.some(x=>x.status==='warning');
    return {
      checkedAt:new Date(now()).toISOString(),
      expectedVersion:version,
      scope:'local_instance',
      externalProductionVerified:false,
      changesMade:false,
      level:critical?'critical':warning?'warning':'ok',
      passed:checks.filter(x=>x.status==='ok').length,
      total:checks.length,
      checks
    };
  }
  async function snapshot({refresh=false}={}){
    if(inFlight)return inFlight;
    if(!refresh && cached && now()<expiresAt)return cached;
    inFlight=run().then(result=>{
      cached=result;
      expiresAt=now()+cacheMs;
      return result;
    }).finally(()=>{inFlight=null;});
    return inFlight;
  }
  return {snapshot};
}

module.exports={createReleaseVerifier,CHECKS,checkAdvice,validatePort,CHECK_TIMEOUT_MS,CACHE_MS};
