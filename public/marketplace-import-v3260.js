'use strict';
const $=id=>document.getElementById(id);
const state={id:null,confirmed:false,summary:null,page:1,running:false,stop:false};
const labels={pending:'Listo',invalid:'Error',duplicate:'Duplicado',imported:'Importado',failed:'Fallido'};
const errorText={csv_invalid_header:'No se reconoce el separador del CSV. Exporta directamente desde WooCommerce → Productos → Exportar. Se aceptan coma, punto y coma, tabulador y barra vertical. Si persiste, envíame el CSV para revisar su formato.',csv_invalid_encoding:'Codificación no reconocida. Exporta en UTF-8 o UTF-16.',csv_empty:'El CSV está vacío.',csv_unclosed_quote:'El CSV tiene comillas sin cerrar; vuelve a exportarlo.',csv_too_large:'El CSV supera el límite de 1 MB.',csv_no_products:'El CSV no contiene productos.',csv_not_woocommerce:'No encuentro una columna Nombre, Name o Nombre del producto. Exporta desde WooCommerce → Productos → Exportar.',csv_too_many_rows:'El máximo es 250 productos por archivo.',invalid_import_options:'Indica tu ciudad.',preview_expired:'La vista previa ha caducado. Sube de nuevo el CSV.',confirmation_required:'Confirma primero la importación.',import_unavailable:'No se pudo procesar la importación. Inténtalo más tarde.',request_timeout:'La importación tarda demasiado. Puedes reanudar el lote sin volver a subir el archivo.'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(text){$('message').textContent=text||'';}
async function api(url,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{
  const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,signal:controller.signal});
  let result={};try{result=await response.json();}catch{}
  return {...result,ok:response.ok&&result.ok!==false,status:response.status};
 }catch(e){return {ok:false,error:e.name==='AbortError'?'request_timeout':'network'};}
 finally{clearTimeout(timer);}
}
function displaySummary(s){
 if(!s)return;
 state.summary=s;
 $('summary').textContent='Total: '+s.total+' · Por importar: '+s.pending+' · Importados: '+s.imported+' · Duplicados: '+s.duplicate+' · No válidos: '+s.invalid+' · Fallidos: '+s.failed;
 const completed=s.total-s.pending;
 $('bar').value=s.total?Math.round(completed*100/s.total):100;
 $('progressText').textContent=completed+' de '+s.total+' revisados · '+s.imported+' publicados correctamente'+(s.pending?'':' · Proceso terminado.');
 if(s.pending===0){state.running=false;$('startBtn').disabled=true;$('pauseBtn').disabled=true;}
}
async function page(n){
 if(!state.id)return;
 const result=await api('/api/marketplace/import/'+encodeURIComponent(state.id)+'?page='+n);
 if(!result.ok){msg(errorText[result.error]||'No se pudo consultar la vista previa.');return;}
 state.page=n;displaySummary(result.summary);
 const list=$('previewList');
 list.innerHTML=result.items.map(item=>'<article class="row"><span class="number">#'+Number(item.line)+'</span>'+
  '<div><strong>'+esc(item.title||'Producto sin nombre')+'</strong><p>'+esc((item.priceCents!=null?(item.priceCents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'Precio no válido')+' · '+(item.photos||0)+' fotos')+(item.error?' · '+item.error:'')+'</p></div>'+
  '<span class="state state-'+esc(item.state)+'">'+esc(labels[item.state]||item.state)+'</span></article>').join('');
 $('pageInfo').textContent='Página '+n+' de '+Math.max(1,Math.ceil(result.summary.total/50));
 $('prev').disabled=n<=1;
 $('next').disabled=n*50>=result.summary.total;
 $('preview').hidden=false;
 $('confirmArea').hidden=state.confirmed||result.summary.pending===0;
}
async function process(){
 if(state.running||!state.id||!state.confirmed)return;
 state.running=true;state.stop=false;msg('');
 $('startBtn').disabled=true;
 $('pauseBtn').disabled=false;
 while(!state.stop){
  const r=await api('/api/marketplace/import/'+encodeURIComponent(state.id)+'/step',{method:'POST',body:'{}'});
  if(!r.ok){msg(errorText[r.error]||'Se ha interrumpido la importación. Puedes pulsar Continuar para reanudarla.');break;}
  displaySummary(r.summary);
  if(r.processed?.state==='failed')msg('El producto «'+r.processed.title+'» no pudo importarse: '+(r.processed.error||'error desconocido')+'. Comprueba que la imagen original sea accesible por HTTPS.');
  if(r.done)break;
 }
 state.running=false;
 if(state.summary?.pending){$('startBtn').disabled=false;$('pauseBtn').disabled=false;}
 else{$('startBtn').disabled=true;$('pauseBtn').disabled=true;}
 await page(state.page);
}
$('importForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const file=$('csvFile').files[0];
 if(!file||!/\.csv$/i.test(file.name)){msg('Elige un archivo .csv de WooCommerce.');return;}
 if(file.size>1024*1024){msg('El archivo supera 1 MB. Exporta menos productos y vuelve a intentarlo.');return;}
 const city=$('importCity').value.trim(),province=$('importProvince').value.trim();
 if(city.length<2||city.length>100||province.length>100){msg('Revisa la ciudad y provincia.');return;}
 $('previewBtn').disabled=true;msg('Leyendo y validando el archivo…');
 try{
  // File.text() assumes UTF-8 and misreads Excel's UTF-16 CSV exports.
  const bytes=await file.arrayBuffer(),view=new Uint8Array(bytes);
  const isLe=view[0]===0xff&&view[1]===0xfe;
  const isBe=view[0]===0xfe&&view[1]===0xff;
  let csv;
  if(isLe||isBe)csv=new TextDecoder(isLe?'utf-16le':'utf-16be',{fatal:true}).decode(bytes);
  else csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!csv.trim()){msg('El CSV está vacío.');return;}
  if(csv.includes('\u0000')){msg(errorText.csv_invalid_encoding);return;}
  const saleScope=$('importSaleScope').value;
  const options={city,province,...(saleScope?{saleScope}:{})};
  const r=await api('/api/marketplace/import/preview',{method:'POST',body:JSON.stringify({csv,options})});
  if(!r.ok){msg(errorText[r.error]||'No se pudo previsualizar el archivo ('+(r.error||r.status)+').');return;}
  state.id=r.id;state.confirmed=false;state.page=1;$('confirmRights').checked=false;
  $('progress').hidden=true;$('startBtn').disabled=false;
  msg('Vista previa lista. Comprueba los productos y confirma cuando quieras.');
  await page(1);$('preview').scrollIntoView({behavior:'smooth'});
 }catch{msg('No se pudo leer el archivo. Comprueba que sea CSV en UTF-8 o UTF-16.');}
 finally{$('previewBtn').disabled=false;}
});
$('confirmBtn').addEventListener('click',async()=>{
 if(!state.id)return;
 if(!$('confirmRights').checked){msg('Confirma que tienes derecho a publicar los productos y sus fotografías.');return;}
 if(!confirm('Se publicarán los productos válidos y se copiarán sus fotografías al VPS. ¿Confirmas la importación?'))return;
 $('confirmBtn').disabled=true;const r=await api('/api/marketplace/import/'+encodeURIComponent(state.id)+'/confirm',{method:'POST',body:'{}'});
 if(!r.ok){$('confirmBtn').disabled=false;msg(errorText[r.error]||'No se pudo confirmar.');return;}
 state.confirmed=true;displaySummary(r.summary);
 $('confirmArea').hidden=true;$('progress').hidden=false;
 await process();
});
$('prev').addEventListener('click',()=>page(state.page-1));
$('next').addEventListener('click',()=>page(state.page+1));
$('startBtn').addEventListener('click',process);
$('pauseBtn').addEventListener('click',()=>{state.stop=true;$('pauseBtn').disabled=true;msg('Pausando después del producto actual…');});
(async()=>{
 const me=await api('/api/auth/me');
 if(!me.ok){$('auth').hidden=false;$('uploader').hidden=true;return;}
 $('uploader').hidden=false;
 const recent=await api('/api/marketplace/import/latest');
 if(!recent.ok||!recent.batch)return;
 state.id=recent.batch.id;state.confirmed=recent.batch.confirmed;
 await page(1);
 if(state.confirmed){$('confirmArea').hidden=true;$('progress').hidden=false;$('startBtn').disabled=recent.batch.summary.pending===0;}
 else msg('Hay un CSV previsualizado pendiente de confirmar. Puedes revisarlo o subir uno nuevo.');
})();
