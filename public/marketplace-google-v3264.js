'use strict';
// Seller data is always inserted as text, not HTML.
(async()=>{
 const byId=id=>document.getElementById(id);
 const notice=byId('googleNotice');
 const add=(parent,tag,value,cls='')=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');parent.append(el);return el;};
 try{
  const response=await fetch('/api/marketplace/google-readiness',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
  if(response.status===401){notice.textContent='Inicia sesión en RedLibertad para consultar tus anuncios.';const link=add(notice,'a',' Entrar →');link.href='/';return;}
  if(!response.ok)throw new Error('No ha sido posible cargar el diagnóstico.');
  const data=await response.json();
  if(!data.ok||!Array.isArray(data.items)||!data.summary)throw new Error('Datos de diagnóstico incompletos.');
  byId('googleTotal').textContent=String(data.summary.total);
  byId('googlePublic').textContent=String(data.summary.publicProducts);
  byId('googleImprove').textContent=String(data.summary.withImprovements);
  const listing=byId('googleListings');
  if(!data.items.length)add(listing,'p','Todavía no tienes anuncios. Puedes publicar el primero desde Marketplace.');
  for(const item of data.items){
   const article=add(listing,'article','','product');
   add(article,'h3',item.title);
   add(article,'p',item.publicOnGoogle?'Producto públicamente visible, pero su indexación en Google no está garantizada.':'Este anuncio no reúne los requisitos para ser indexado como producto público.','state '+(item.publicOnGoogle?'good':'needs'));
   if(Array.isArray(item.notes)&&item.notes.length){const ul=add(article,'ul','');for(const text of item.notes.slice(0,8))add(ul,'li',text);}
   add(article,'p','Google Shopping: pendiente de una compra online apta y configuración de Merchant Center.');
   if(/^[1-9]\d{0,15}$/.test(String(item.id))){const link=add(article,'a','Ver mis anuncios →');link.href='/marketplace';}
  }
  notice.hidden=true;
  byId('googleDashboard').hidden=false;
  if(data.partial)add(byId('googleDashboard'),'p','Se muestran hasta 250 anuncios recientes.','notice');
 }catch(error){notice.textContent=error.message||'No se pudo cargar la información.';notice.classList.add('error');}
})();