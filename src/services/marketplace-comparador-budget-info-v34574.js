'use strict';
// V3.4.5.7.4 — interpretación privada del presupuesto interno.
// Solo usa contadores locales, no consulta SerpApi.
const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
function describe(quota){
 if(!quota)return {message:'No se ha podido consultar el presupuesto interno.',remainingToday:null,remainingMonth:null,paused:true};
 const daily=count(quota.daily),monthly=count(quota.monthly);
 const ready=Number.isFinite(Number(quota.dailyUsed))&&Number.isFinite(Number(quota.monthlyUsed));
 const remainingToday=ready?Math.max(0,daily-count(quota.dailyUsed)):null;
 const remainingMonth=ready?Math.max(0,monthly-count(quota.monthlyUsed)):null;
 if(quota.reason==='not_configured')return {message:'Falta configurar el proveedor de precios externos en Coolify.',remainingToday:null,remainingMonth:null,paused:true};
 if(quota.reason==='disabled'||daily===0||monthly===0)return {message:'El administrador ha desactivado las consultas externas mediante sus límites.',remainingToday,remainingMonth,paused:true};
 if(quota.reason==='monthly')return {message:'Se ha alcanzado el límite mensual interno. Se restablece al comenzar el próximo mes, según Europe/Madrid.',remainingToday,remainingMonth,paused:true};
 if(quota.reason==='daily')return {message:'Se ha alcanzado el límite diario interno. Se restablece a medianoche en Europe/Madrid.',remainingToday,remainingMonth,paused:true};
 if(!quota.available)return {message:'No se pueden realizar nuevas consultas externas. Revisa la configuración del proveedor.',remainingToday,remainingMonth,paused:true};
 return {message:'Hay presupuesto interno disponible para nuevas búsquedas.',remainingToday,remainingMonth,paused:false};
}
module.exports={describe};
