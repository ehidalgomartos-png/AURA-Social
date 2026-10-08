'use strict';

const path=require('node:path');
const fs=require('node:fs');

const PUBLIC_ORIGIN='https://redlibertad.com';

function checkLaunchConfiguration(env,{stat=fs.statSync}={}){
  const checks=[];
  const add=(key,passed,explanation)=>checks.push({key,status:passed?'pass':'block',explanation});
  const warn=(key,passed,explanation)=>checks.push({key,status:passed?'pass':'warning',explanation});
  const e=env||{};

  add('node_environment',e.NODE_ENV==='production','NODE_ENV debe ser production.');
  add('canonical_origin',e.APP_ORIGIN===PUBLIC_ORIGIN,'APP_ORIGIN debe ser https://redlibertad.com.');
  add('secure_cookies',String(e.COOKIE_SECURE).toLowerCase()==='true','COOKIE_SECURE debe ser true.');
  add('database_config',Boolean(String(e.DATABASE_URL||'').trim()),'DATABASE_URL debe estar configurada.');
  const secret=String(e.JWT_SECRET||'');
  add('session_secret',secret.length>=32 && !/^(change.?me|secret|password|example)/i.test(secret),
    'JWT_SECRET debe tener al menos 32 caracteres y no ser una clave de ejemplo.');
  const mode=String(e.MEDIA_STORAGE||'local');
  warn('local_media',mode==='local','Revisar modo multimedia; este lanzamiento espera almacenamiento local persistente.');
  const uploadDir=String(e.UPLOAD_DIR||'');
  add('media_upload_directory',mode!=='local'||(path.isAbsolute(uploadDir)&&uploadDir!==path.join(process.cwd(),'uploads')),
    'UPLOAD_DIR debe apuntar a una ruta absoluta fuera del directorio de la aplicación.');
  if(mode==='local'){
    let dirOk=false;
    if(path.isAbsolute(uploadDir)){
      try{dirOk=stat(uploadDir).isDirectory();}catch(_){}
    }
    add('media_volume_access',dirOk,'El directorio UPLOAD_DIR debe existir y ser accesible; verificar montaje persistente en Coolify.');
    warn('media_mount_convention',uploadDir==='/data/uploads','La ruta recomendada del volumen Coolify es /data/uploads.');
  }
  const blocked=checks.filter(c=>c.status==='block').length;
  const warnings=checks.filter(c=>c.status==='warning').length;
  return {
    version:require('../package.json').version,
    scope:'local_configuration',
    status:blocked?'blocked':warnings?'review':'pass',
    blocked,warnings,checks,
    automaticBackupVerification:false,
    coolifyDeploymentVerified:false,
    manualGates:[
      'Comprobar commit y despliegue de Coolify.',
      'Verificar copia reciente de PostgreSQL fuera del VPS y una restauración de prueba.',
      'Verificar copia reciente del volumen multimedia fuera del VPS y recuperación de un archivo de prueba.',
      'Comprobar el montaje persistente y una subida/lectura autorizada de prueba.',
      'Comprobar alertas externas para caída total del proceso y de PostgreSQL.',
      'Realizar recorrido de registro, feed, chat, Stories, Reels y controles +18 desde móvil.'
    ]
  };
}
if(require.main===module){
  const result=checkLaunchConfiguration(process.env);
  console.log(JSON.stringify(result,null,2));
  if(result.status==='blocked')process.exitCode=1;
}
module.exports={checkLaunchConfiguration,PUBLIC_ORIGIN};
