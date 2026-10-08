'use strict';

// Read-only diagnostics. A mount is evidence of an independent filesystem,
// NOT evidence of durability across rebuilds, retention or an offsite backup.
const fs=require('node:fs');
const path=require('node:path');
const {version}=require('../package.json');
const EXPECTED='/data/uploads';

function decodeMount(value){
  return String(value).replace(/\\([0-7]{3})/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
}
function parseMountInfo(contents){
  const entries=[];
  for(const line of String(contents).split(/\r?\n/)){
    const separator=line.indexOf(' - ');
    if(separator===-1)continue;
    const fields=line.slice(0,separator).split(' ');
    const tail=line.slice(separator+3).split(' ');
    if(fields.length<5||tail.length<2)continue;
    const mount=decodeMount(fields[4]);
    if(!path.isAbsolute(mount))continue;
    entries.push({mount:path.resolve(mount),type:tail[0]});
  }
  return entries;
}
function deepestMount(directory,mounts){
  const p=path.resolve(directory);
  return mounts.filter(m=>p===m.mount||p.startsWith(m.mount.endsWith('/')?m.mount:m.mount+'/'))
    .sort((a,b)=>b.mount.length-a.mount.length)[0]||null;
}
function inspectMediaStorage(env=process.env,{stat=fs.statSync,read=fs.readFileSync,real=fs.realpathSync}={}){
  const mode=String(env.MEDIA_STORAGE||'local');
  const configured=String(env.UPLOAD_DIR||'');
  const checks=[];
  const add=(key,status,explanation)=>checks.push({key,status,explanation});
  if(mode!=='local'){
    add('mode','review','El proveedor multimedia no es local: validar almacenamiento, accesibilidad y recuperación por separado.');
  }else{
    const absolute=path.isAbsolute(configured);
    add('absolute_path',absolute?'pass':'block','UPLOAD_DIR debe ser una ruta absoluta.');
    if(absolute){
      let exists=false,canonical='';
      try{
        exists=stat(configured).isDirectory();
        if(exists)canonical=real(configured);
      }catch(_){}
      add('directory_accessible',exists?'pass':'block','La ruta configurada debe existir y ser un directorio.');
      if(exists){
        let mounts;
        try{mounts=parseMountInfo(read('/proc/self/mountinfo','utf8'));}
        catch(_){mounts=null;}
        if(mounts===null){
          add('mount_evidence','review','No se pudo leer mountinfo: comprobar Persistent Storage en Coolify manualmente.');
        }else{
          const found=deepestMount(canonical,mounts);
          if(!found||found.mount==='/'){
            add('mount_evidence','block','Solo se detecta el sistema raíz del contenedor; no hay evidencia de un volumen multimedia separado.');
          }else if(['tmpfs','ramfs'].includes(found.type)){
            add('mount_evidence','block','La ruta está sobre memoria temporal y no acredita persistencia.');
          }else{
            add('mount_evidence','review','Hay un punto de montaje independiente. Confirma que es un volumen persistente configurado en Coolify.');
          }
        }
      }
    }
    add('mount_path_convention',configured===EXPECTED?'pass':'review',
      'La ruta documentada es /data/uploads. Si usas otra, debe coincidir con Coolify y la aplicación.');
  }
  const blocked=checks.filter(x=>x.status==='block').length;
  const warnings=checks.filter(x=>x.status==='review').length;
  return {
    version,scope:'running_container',
    status:blocked?'blocked':warnings?'review':'pass',
    blocked,warnings,checks,
    backupVerified:false,restoreTested:false,persistenceAcrossDeployVerified:false,
    nextActions:[
      'En Coolify → aplicación RedLibertad → Persistent Storage, confirmar el destino de volumen y el origen.',
      'Comprobar que PostgreSQL y el directorio de fotos y vídeos tienen copias externas recientes.',
      'Restaurar una copia de prueba en un entorno aislado sin tocar la base real.',
      'Subir una foto de prueba y confirmar su disponibilidad tras un redespliegue controlado, sin borrar archivos actuales.'
    ]
  };
}
if(require.main===module){
  const report=inspectMediaStorage(process.env);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(report.status==='blocked')process.exitCode=1;
}
module.exports={inspectMediaStorage,decodeMount,parseMountInfo,deepestMount,EXPECTED};
