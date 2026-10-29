'use strict';
// V3.4.5.7.2 — códigos de diagnóstico sin mensajes ni datos del proveedor.
// Nunca registrar URLs de SerpApi, credenciales, parámetros ni cuerpos de error.
const MESSAGES=Object.freeze({
 local_budget:['Presupuesto interno pausado','Esperar al restablecimiento del límite diario o mensual configurado.'],
 provider_remote_quota:['Límite del proveedor externo','Comprobar el plan y saldo de SerpApi en su panel. No aumentar presupuesto sin autorización.'],
 provider_invalid_key:['Autorización del proveedor rechazada','Comprobar la variable de clave SerpApi en Coolify, sin copiarla en el diagnóstico.'],
 provider_rate_limit:['Demasiadas solicitudes al proveedor','Revisar límites y tiempos del proveedor; no repetir consultas de pago automáticamente.'],
 provider_timeout:['Consulta externa agotó el tiempo','Revisar conectividad y tiempos de respuesta de SerpApi desde el servidor.'],
 provider_network:['Problema de conexión externa','Revisar conexión de salida desde Coolify y disponibilidad del proveedor.'],
 provider_http_4xx:['Petición rechazada por el proveedor','Comprobar configuración y parámetros del servicio externo.'],
 provider_http_5xx:['Error temporal del proveedor','Revisar el estado del proveedor y sus registros de servicio.'],
 provider_missing_results:['Respuesta externa incompleta','Revisar cambios en el formato de resultados de Google Shopping.'],
 provider_error:['El proveedor devolvió un error','Comprobar el incidente en SerpApi sin exponer su respuesta ni credenciales.'],
 provider_unknown:['No se pudo clasificar el fallo','Consultar los registros técnicos del servidor, sin compartir claves.']
});
function category(error){
 const name=String(error?.name||'');
 const message=String(error?.message||'');
 if(name==='TimeoutError'||name==='AbortError'||/timeout|timed? out|abort/i.test(message))return 'provider_timeout';
 if(message==='provider_remote_quota'||message==='provider_invalid_key'||message==='provider_rate_limit')return message;
 if(message==='provider_missing_results')return 'provider_missing_results';
 if(message==='provider_error')return 'provider_error';
 if(/^provider_http_(401|403)$/.test(message))return 'provider_invalid_key';
 if(/^provider_http_429$/.test(message))return 'provider_rate_limit';
 if(/^provider_http_(402)$/.test(message))return 'provider_remote_quota';
 if(/^provider_http_5\d\d$/.test(message))return 'provider_http_5xx';
 if(/^provider_http_4\d\d$/.test(message))return 'provider_http_4xx';
 if(/^(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT)/.test(message)||
    name==='TypeError'&&/fetch failed/i.test(message))return 'provider_network';
 return 'provider_unknown';
}
function explain(code){
 const safe=Object.hasOwn(MESSAGES,code)?code:'provider_unknown';
 const [label,action]=MESSAGES[safe];
 return {code:safe,label,action};
}
module.exports={category,explain};
