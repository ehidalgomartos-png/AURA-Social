'use strict';

const fs=require('node:fs');
const fsPromises=require('node:fs/promises');

const CHECK_CACHE_MS=15000;
const DB_TIMEOUT_MS=2000;

function finiteNonNegative(n){
  return Number.isFinite(Number(n)) ? Math.max(0,Number(n)) : 0;
}

function diskAssessment(bytes,percentFree){
  if(bytes<128*1048576 || percentFree<3)return 'critical';
  if(bytes<512*1048576 || percentFree<10)return 'warning';
  return 'ok';
}
function statusRank(status){
  return ({ok:0,disabled:0,warning:1,critical:2})[status]??2;
}

function withDeadline(task,ms){
  let timer;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('check_deadline')),ms);})
  ]).finally(()=>clearTimeout(timer));
}

function createDependencyInspector({
  db,
  pool=db?.pool,
  uploadsDir,
  mediaMode='local',
  pushConfigured=()=>false,
  disk=fsPromises,
  now=()=>Date.now(),
  cacheMs=CHECK_CACHE_MS,
  timeoutMs=DB_TIMEOUT_MS
}={}){
  if(!db || typeof db.query!=='function')throw new TypeError('database query required');
  if(mediaMode==='local' && !uploadsDir)throw new TypeError('uploadsDir required for local storage');
  let cached=null,expiresAt=0,inFlight=null;

  async function databaseCheck(){
    const started=now();
    const waiting=finiteNonNegative(pool?.waitingCount);
    const total=finiteNonNegative(pool?.totalCount);
    const idle=finiteNonNegative(pool?.idleCount);
    try{
      await withDeadline(()=>db.query({text:'SELECT 1',query_timeout:timeoutMs}),timeoutMs);
      const level=waiting>=3?'warning':'ok';
      return {
        key:'database',status:level,label:'PostgreSQL',
        latencyMs:Math.round(Math.max(0,now()-started)),
        waitingConnections:waiting,totalConnections:total,idleConnections:idle,
        advice:level==='warning'?'Revisar saturación del pool y consultas lentas.':'Base de datos accesible.'
      };
    }catch(_){
      return {
        key:'database',status:'critical',label:'PostgreSQL',latencyMs:null,
        waitingConnections:waiting,totalConnections:total,idleConnections:idle,
        advice:'Revisar el servicio de PostgreSQL, la conexión interna y los registros de Coolify.'
      };
    }
  }

  async function mediaCheck(){
    if(mediaMode!=='local'){
      return {key:'media',status:'disabled',label:'Almacenamiento local',
        advice:'El almacenamiento local no está habilitado; comprobar el proveedor multimedia configurado.'};
    }
    try{
      const stats=await withDeadline(()=>disk.stat(uploadsDir),timeoutMs);
      if(!stats.isDirectory())throw Error('not_directory');
      await withDeadline(()=>disk.access(uploadsDir,fs.constants.W_OK),timeoutMs);
      let freeMB=null,freePercent=null,status='ok';
      if(typeof disk.statfs==='function'){
        try{
          const vol=await withDeadline(()=>disk.statfs(uploadsDir),timeoutMs);
          const total=Number(vol.blocks)*Number(vol.bsize);
          const available=Number(vol.bavail)*Number(vol.bsize);
          if(Number.isFinite(total)&&total>0&&Number.isFinite(available)&&available>=0){
            freeMB=Math.round(available/1048576);
            freePercent=Math.round(1000*available/total)/10;
            status=diskAssessment(available,freePercent);
          }
        }catch(_){/* Unavailable volume metrics are not a failed write-permission check. */}
      }
      const advice=status==='critical'?'Espacio muy bajo: liberar espacio o ampliar el volumen persistente antes de nuevas subidas.':
        status==='warning'?'Espacio bajo: revisar el volumen persistente y las copias de seguridad.':
        'Carpeta de multimedia accesible para escritura (sin realizar cambios).';
      return {key:'media',status,label:'Volumen multimedia',
        freeMB,freePercent,advice};
    }catch(_){
      return {key:'media',status:'critical',label:'Volumen multimedia',
        freeMB:null,freePercent:null,
        advice:'Revisar que el volumen persistente esté montado y permita escribir en Coolify.'};
    }
  }

  async function runCheck(){
    const [database,media]=await Promise.all([databaseCheck(),mediaCheck()]);
    const push=Boolean(pushConfigured());
    const notifications={
      key:'push',status:push?'ok':'disabled',label:'Notificaciones push',
      advice:push?'Credenciales push configuradas. No verifica entregas externas.':
        'Notificaciones push opcionales deshabilitadas; no impide usar la red social.'
    };
    const services=[database,media,notifications];
    const max=Math.max(...services.map(s=>statusRank(s.status)));
    return {
      level:max===2?'critical':max===1?'warning':'ok',
      services,
      checkedAt:new Date(now()).toISOString(),
      scope:'current_instance',
      activeChecks:['database','media'],
      changesMade:false
    };
  }

  async function snapshot({force=false}={}){
    if(inFlight)return inFlight;
    const current=now();
    if(!force && cached && current<expiresAt)return cached;
    inFlight=runCheck().then(result=>{
      cached=result;
      expiresAt=now()+cacheMs;
      return result;
    }).finally(()=>{inFlight=null;});
    return inFlight;
  }

  return {snapshot};
}

module.exports={createDependencyInspector,diskAssessment,withDeadline,CHECK_CACHE_MS,DB_TIMEOUT_MS};
