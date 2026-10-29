'use strict';
// V3.4.5.7.1 — textos de estados reales en fichas sin ofertas comparables.
// No realiza consultas externas ni expone credenciales/cuotas internas.
const STATES=Object.freeze({
 queued:{
  title:'Buscando precios y tiendas…',
  description:'Estamos comprobando las ofertas disponibles. Si encontramos precios verificables aparecerán aquí automáticamente.',
  pending:true
 },
 checking:{
  title:'Buscando precios y tiendas…',
  description:'Estamos consultando las ofertas disponibles. Si encontramos precios verificables aparecerán aquí automáticamente.',
  pending:true
 },
 ok:{
  title:'No hemos encontrado ofertas coincidentes',
  description:'La búsqueda ha terminado, pero no hay precios suficientemente fiables para este producto. Prueba con otro modelo, una capacidad diferente o un nombre más general.',
  pending:false
 },
 limit_reached:{
  title:'Las búsquedas externas están temporalmente en pausa',
  description:'Por ahora no se pueden realizar más consultas de precios externos. Esta comparación se ha guardado, pero no tenemos ofertas verificadas que mostrar. Puedes consultar otras comparaciones que ya tienen resultados.',
  pending:false
 },
 unavailable:{
  title:'No hemos podido completar la consulta de precios',
  description:'La búsqueda externa ha fallado temporalmente. No tenemos ofertas verificadas que mostrarte en esta ficha. Puedes consultar otras comparaciones o volver más tarde.',
  pending:false
 },
 not_configured:{
  title:'La consulta de tiendas externas no está disponible',
  description:'En este momento no se pueden buscar precios externos para este producto. Puedes consultar otras comparaciones con resultados guardados o probar un producto diferente.',
  pending:false
 },
 unknown:{
  title:'Todavía no hay ofertas verificadas para este producto',
  description:'La comparación está guardada, pero no hay resultados disponibles ni una búsqueda en curso. Puedes cambiar el producto o explorar otras comparaciones.',
  pending:false
 }
});
function emptyState(status,providerReady=true){
 const raw=typeof status==='string'?status:'';
 const key=!providerReady&&['queued','checking'].includes(raw)?'not_configured':
  Object.hasOwn(STATES,raw)?raw:'unknown';
 return {status:key,...STATES[key]};
}
module.exports={emptyState};
