'use strict';
// V3.2.133 — Google Shopping España (SerpApi): resultados reales, sin scraping directo.
// Nunca expone la API key en HTML ni comunica un enlace Google como checkout del vendedor.
const EXCLUDED=/\b(funda|carcasa|protector|cristal templado|cargador|cable|correa|repuesto|soporte|estuche|adaptador|accessory|case|cover|screen protector)\b/i;
function keyOf(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function safeHttps(value){
 try {
  const u=new URL(String(value));
  if(u.protocol!=='https:' || u.username || u.password || u.port && u.port!=='443')return null;
  if(['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(u.hostname))return null;
  return u.href;
 }catch(_){return null;}
}
function safeImage(value){
 const url=safeHttps(value);
 if(!url)return null;
 const host=new URL(url).hostname.toLowerCase();
 if(host==='serpapi.com'||host.endsWith('.serpapi.com')||host==='gstatic.com'||host.endsWith('.gstatic.com')||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com'))return url;
 return null;
}
function isGoogleHost(host){
 const h=String(host||'').toLowerCase();
 return h==='google.com'||h.endsWith('.google.com')||/^google\.[a-z.]+$/.test(h)||/\.google\.[a-z.]+$/.test(h)||h==='googleadservices.com'||h.endsWith('.googleadservices.com');
}
// Nombre conservado para compatibilidad con llamadas anteriores.
// Las fichas usadas de Wallapop y otros marketplaces no suelen aparecer en la
// pestaña Shopping (udm=28). Abrimos búsqueda WEB sin fijar dicha pestaña.
// Nunca se promete recuperar el anuncio exacto si la fuente no dio URL directa.
// SerpApi a veces devuelve un enlace de Google /url con la URL real del
// vendedor codificada en ?q= o ?url=. Solo extraemos destinos HTTPS externos
// en ese formato exacto. No seguimos redirecciones ni enlaces de anuncios /aclk.
function directMerchantUrl(value){
 const safe=safeHttps(value);
 if(!safe)return null;
 const u=new URL(safe);
 if(!isGoogleHost(u.hostname))return safe;
 if(u.pathname!=='/url')return null;
 for(const key of ['url','q']){
  const raw=u.searchParams.get(key);
  const extracted=safeHttps(raw);
  if(extracted&&!isGoogleHost(new URL(extracted).hostname))return extracted;
 }
 return null;
}
// Token ofrecido por Google Shopping para recuperar la variante concreta
// con una sola consulta Google Product, en lugar de un catálogo genérico.
function safePageToken(v){
 return typeof v==='string'&&v.length>=20&&v.length<=2400&&/^[A-Za-z0-9_+=/-]+$/.test(v)?v:null;
}
function shoppingSearchUrl(title,shop=''){
 const raw=String(title||'').trim().slice(0,160);
 if(!raw)return null;
 const beforeMarketing=raw.split(/\b(?:pago a plazos|garant[ií]a incluida|env[ií]o gratis|financiaci[oó]n)\b/i)[0];
 const skip=new Set([
  'negro','negra','blanco','blanca','azul','verde','rojo','roja','rosa','violeta','morado','morada',
  'gris','plateado','plateada','dorado','dorada','cobalto','medianoche','midnight','purple','black',
  'white','green','blue','pink','gray','grey','silver','gold','graphite',
  'usado','usada','segunda','mano','refurbished','reacondicionado','reacondicionada','renewed',
  'nuevo','nueva','precintado','precintada','garantia','garantía','incluida','incluido'
 ]);
 const tokens=beforeMarketing.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-zA-Z0-9]+/g)||[];
 const main=tokens.filter(t=>!skip.has(t.toLowerCase())).slice(0,9).join(' ').trim();
 if(!main)return null;
 const seller=String(shop||'').replace(/[<>]/g,' ').trim().slice(0,55);
 const suffix=seller && seller.toLowerCase()!=='tienda no identificada'?seller:'';
 const url=new URL('https://www.google.com/search');
 url.searchParams.set('q',(main+' '+suffix).trim());
 url.searchParams.set('hl','es');
 url.searchParams.set('gl','es');
 return url.href;
}
// Nunca enviar al usuario a un product_link de Google que puede haber caducado.
// Aplica también a URLs guardadas anteriormente en PostgreSQL.
function resolveOfferLink(offer){
 const cached=directMerchantUrl(offer?.resolved_href);
 if(cached&&!isGoogleHost(new URL(cached).hostname))return {href:cached,destination:'store'};
 const href=directMerchantUrl(offer?.href);
 if(offer?.internal)return {href:offer.href,destination:'internal'};
 if(href&&!isGoogleHost(new URL(href).hostname)){
  return {href,destination:'store'};
 }
 const search=shoppingSearchUrl(offer?.title,offer?.shop);
 return search?{href:search,destination:'shopping-search'}:null;
}
// Los marketplaces entre particulares no ofrecen normalmente una ficha de
// vendedores de Google Product que permita verificar el anuncio concreto.
// No gastar consultas adicionales cuando no hay URL real de ese anuncio.
function hasProductReference(offer){
 return /^\d{8,30}$/.test(String(offer?.product_id||'')) || Boolean(safePageToken(offer?.page_token));
}
function canLookupSeller(offer){
 const shop=String(offer?.shop||'').trim().toLowerCase();
 return !/^(?:wallapop(?:\.es)?|vinted(?:\.es)?|milanuncios(?:\.com)?|facebook marketplace)$/i.test(shop);
}
function isSpecificModel(q){
 const words=keyOf(q).split(' ').filter(Boolean);
 return words.length>=2 && words.some(w=>/\d/.test(w));
}
function storageCode(value){
 // Google Shopping alterna «128GB» y «128 GB». Comparar de forma idéntica.
 const m=keyOf(value).match(/\b(64|128|256|512|1024)\s*(gb|g|tb)\b/);
 return m?String(Number(m[1])*(m[2]==='tb'?1024:1))+'gb':null;
}
function titleMatches(q,title,{includeAccessories=false}={}){
 const separate=v=>keyOf(v).replace(/\b(64|128|256|512|1024)\s*(gb|g|tb)\b/g,'$1 $2');
 const query=separate(q),value=separate(title);
 if(!query||!value)return false;
 if(!includeAccessories&&EXCLUDED.test(value)&&!EXCLUDED.test(query))return false;
 const terms=query.split(' ').filter(t=>t.length>=2),wanted=new Set(terms);
 const words=new Set(value.split(' '));
 const match=terms.filter(t=>words.has(t)).length;
 if(!terms.length||match<Math.max(1,Math.ceil(terms.length*.72)))return false;
 if(terms.some(t=>/\d/.test(t)&&!words.has(t)))return false;
 if(isSpecificModel(q)){
  // El modelo estándar NO es Pro, Pro Max, Plus, Ultra, etc.
  // La marca en la búsqueda y en la oferta ha de coincidir exactamente;
  // lo mismo para la capacidad, si el comprador la ha indicado.
  for(const marker of ['pro','max','ultra','plus','mini','lite','fe','se','air','edge','fold','flip']){
   if(wanted.has(marker)!==words.has(marker))return false;
  }
  const capacity=storageCode(q);
  if(capacity&&storageCode(title)!==capacity)return false;
 }
 return true;
}
function euroPrice(r){
 // SerpApi devuelve extracted_price numérico y price formateado con la moneda.
 // gl=es NO garantiza por sí solo EUR, así que se comprueba el símbolo explícito.
 const currency=String(r.currency||'').trim().toUpperCase();
 if(currency && !['EUR','€'].includes(currency))return null;
 const displayed=String(r.price||'');
 if(/(?:\$|£|\bUSD\b|\bGBP\b|\bTRY\b|\bINR\b|\bMXN\b|\bBRL\b)/i.test(displayed))return null;
 if(displayed && !/(?:€|\bEUR\b)/i.test(displayed) && !currency)return null;
 const number=Number(r.extracted_price);
 if(!Number.isFinite(number)||number<=0||number>100000)return null;
 return Math.round(number*100);
}
function parseExternal(results,q){
 const out=[],seen=new Set();
 for(const r of (Array.isArray(results)?results:[]).slice(0,60)){
  if(!r||typeof r!=='object')continue;
  const title=String(r.title||'').trim().slice(0,160);
  if(!titleMatches(q,title))continue;
  const cents=euroPrice(r);
  if(!cents)continue;
  const direct=directMerchantUrl(r.direct_link)||directMerchantUrl(r.link);
  const source=safeHttps(r.link||'');
  const product=safeHttps(r.product_link||'');
  // Un vínculo Google /aclk o /shopping nunca es compra directa, pero
  // la oferta real con precio aún debe poder buscarse por título y tienda.
  // Algunas fichas ofrecen únicamente el token de la variante: la búsqueda
  // web sigue disponible y el usuario puede solicitar una sola comprobación.
  if(!direct&&!product&&!source&&!safePageToken(r.immersive_product_page_token))continue;
  const shop=String(r.source||'Tienda no identificada').replace(/[<>]/g,'').trim().slice(0,80)||'Tienda no identificada';
  const landing=direct&&!isGoogleHost(new URL(direct).hostname)?{href:direct,destination:'store'}:
   resolveOfferLink({title,shop,href:product||source});
  if(!landing)continue;
  const dedup=shop.toLowerCase()+'|'+keyOf(title)+'|'+cents;
  if(seen.has(dedup))continue;
  seen.add(dedup);
  const condition=String(r.second_hand_condition||'').toLowerCase();
  out.push({
   title,shop,price_cents:cents,href:landing.href,
   destination:landing.destination,
   product_id:/^\d{8,30}$/.test(String(r.product_id||''))?String(r.product_id):null,
   page_token:safePageToken(r.immersive_product_page_token),
   condition:condition.includes('refurb')||condition.includes('reacondicionado')?'Reacondicionado':condition.includes('used')||condition.includes('usado')?'Usado':'Consultar estado',
   delivery:typeof r.delivery==='string'?r.delivery.trim().slice(0,110):'',
   image:safeImage(r.thumbnail || (Array.isArray(r.thumbnails)?r.thumbnails[0]:null)),
   internal:false,
   price_currency:'EUR'
  });
  if(out.length>=24)break;
 }
 return out.sort((a,b)=>a.price_cents-b.price_cents);
}
// Google Shopping incluye ocasionalmente "inline_shopping_results" (anuncios).
// Cuando la respuesta trae una URL directa del comercio podemos usarla sin
// otra llamada a SerpApi. Nunca se usa el tracking_link ni un enlace Google.
function parseInlineStores(results,q){
 const out=[],seen=new Set();
 for(const r of (Array.isArray(results)?results:[]).slice(0,24)){
  if(!r||typeof r!=='object')continue;
  const title=String(r.title||'').trim().slice(0,160);
  if(!titleMatches(q,title))continue;
  const price_cents=euroPrice(r);
  if(!price_cents)continue;
  const direct=directMerchantUrl(r.direct_link)||directMerchantUrl(r.link);
  if(!direct||isGoogleHost(new URL(direct).hostname))continue;
  const shop=String(r.source||'Comercio').replace(/[<>]/g,'').trim().slice(0,80)||'Comercio';
  const identity=shop.toLowerCase()+'|'+keyOf(title)+'|'+price_cents;
  if(seen.has(identity))continue;
  seen.add(identity);
  out.push({
   title,shop,price_cents,href:direct,destination:'store',
   sponsored:true,source_type:'google_shopping_ad',
   condition:'Consultar estado',
   delivery:typeof r.delivery==='string'?r.delivery.trim().slice(0,110):'',
   image:safeImage(r.thumbnail||(Array.isArray(r.thumbnails)?r.thumbnails[0]:null)),
   internal:false,price_currency:'EUR'
  });
  if(out.length>=8)break;
 }
 return out.sort((a,b)=>a.price_cents-b.price_cents);
}
function mergeOffers(organic,ads){
 const out=(Array.isArray(organic)?organic:[]).slice(0,24),position=new Map();
 // Si el mismo vendedor y precio aparece como anuncio con link real,
 // preferimos esa URL sobre el enlace genérico a Google Shopping.
 const key=o=>keyOf(o.shop)+'|'+keyOf(o.title)+'|'+o.price_cents;
 out.forEach((offer,i)=>position.set(key(offer),i));
 for(const offer of (Array.isArray(ads)?ads:[])){
  const id=key(offer),i=position.get(id);
  if(i!==undefined){
   if(out[i].destination!=='store')out[i]=offer;
   continue;
  }
  position.set(id,out.length);out.push(offer);
 }
 return out.slice(0,32).sort((a,b)=>a.price_cents-b.price_cents);
}
function retailerKey(value){
 return keyOf(value).replace(/\b(www|es|com|eu|online|shop|store|tienda)\b/g,' ').trim().replace(/\s+/g,' ');
}
function sameRetailer(wanted,actual){
 const a=retailerKey(wanted),b=retailerKey(actual);
 if(!a||!b||a.length<4||b.length<4)return false;
 return a===b||((a.startsWith(b+' ')||b.startsWith(a+' '))&&Math.min(a.length,b.length)>=7);
}
function readEuroAmount(v){
 if(typeof v==='number')return Number.isFinite(v)?Math.round(v*100):null;
 const x=String(v||'').trim();
 if(!x||!/(€|\bEUR\b)/i.test(x)||/[\$£]/.test(x))return null;
 const numeric=x.replace(/[^\d,.]/g,'');
 if(!numeric)return null;
 const comma=numeric.lastIndexOf(','),dot=numeric.lastIndexOf('.');
 const separator=Math.max(comma,dot);
 let dec;
 if(separator!==-1&&numeric.length-separator-1===2){
  dec=numeric.slice(0,separator).replace(/[.,]/g,'')+'.'+numeric.slice(separator+1);
 }else dec=numeric.replace(/[.,]/g,'');
 const n=Number(dec);
 return Number.isFinite(n)&&n>0&&n<=100000?Math.round(n*100):null;
}
function selectRetailer(offer,sellers){
 const requested=Number(offer.price_cents);
 if(!Number.isSafeInteger(requested)||requested<=0)return null;
 for(const seller of (Array.isArray(sellers)?sellers:[]).slice(0,50)){
  if(!sameRetailer(offer.shop,seller?.name))continue;
  const href=directMerchantUrl(seller?.direct_link)||directMerchantUrl(seller?.link);
  if(!href||isGoogleHost(new URL(href).hostname))continue;
  const price=readEuroAmount(seller.base_price);
  if(price===null)continue; // evitar mandar a un modelo/variante de precio desconocido
  if(Math.abs(price-requested)>Math.max(300,Math.round(requested*0.03)))continue;
  return {href,verified_price_cents:price,shop:String(seller.name).slice(0,90)};
 }
 return null;
}
async function fetchDirectRetailer(offer,fetchFn=fetch,env=process.env){
 if(!configured(env))throw new Error('provider_not_configured');
 const pid=String(offer?.product_id||'');
 const token=safePageToken(offer?.page_token);
 if(!token&&!/^\d{8,30}$/.test(pid))return null;
 const params=new URLSearchParams({
  engine:'google_product',gl:'es',hl:'es',api_key:String(env.COMPARADOR_SERPAPI_KEY).trim()
 });
 if(token)params.set('page_token',token);
 else params.set('product_id',pid);
 const r=await fetchFn('https://serpapi.com/search.json?'+params,{
  signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}
 });
 if(!r.ok)throw new Error('provider_http_'+r.status);
 const payload=await r.json();
 if(payload?.error)throw new Error('provider_error');
 return selectRetailer(offer,payload?.sellers_results?.online_sellers);
}
function configured(env=process.env){
 return typeof env.COMPARADOR_SERPAPI_KEY==='string'&&env.COMPARADOR_SERPAPI_KEY.trim().length>=12;
}
function budget(env=process.env){
 const read=(key,def,max)=>{
  const raw=String(env[key]||'').trim();
  const n=/^\d+$/.test(raw)?Number(raw):def;
  return Number.isSafeInteger(n)?Math.min(max,Math.max(0,n)):def;
 };
 // El plan gratis muestra 250 búsquedas/mes. Reservamos 30 para imprevistos.
  // Variables de Coolify explícitas siguen prevaleciendo (sin sobrepasar 220/mes).
  return {daily:read('COMPARADOR_DAILY_LIMIT',12,50),monthly:read('COMPARADOR_MONTHLY_LIMIT',220,220)};
}
async function fetchOffers(q,fetchFn=fetch,env=process.env){
 if(!configured(env))throw new Error('provider_not_configured');
 const query=new URLSearchParams({
  engine:'google_shopping',q,hl:'es',gl:'es',
  api_key:String(env.COMPARADOR_SERPAPI_KEY).trim()
 });
 const response=await fetchFn('https://serpapi.com/search.json?'+query.toString(),{
  signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}
 });
 if(!response.ok)throw new Error('provider_http_'+response.status);
 const data=await response.json();
 // SerpApi considera correctas algunas búsquedas sin resultados e incluye
 // `error` como mensaje informativo incluso con search_metadata.status=Success.
 // No confundir «0 ofertas» con fallo técnico ni fabricar precios.
 const success=data?.search_metadata?.status==='Success';
 const hasResults=Array.isArray(data?.shopping_results)||Array.isArray(data?.inline_shopping_results);
 const noResults=/\b(?:no results|fully empty|hasn.t returned any results|sin resultados)\b/i.test(
  String(data?.error||'')+' '+String(data?.search_information?.shopping_results_state||'')
 );
 if(success&&noResults&&(!hasResults||!(data.shopping_results||[]).length&&!(data.inline_shopping_results||[]).length))return [];
 if(data?.error){
  const reason=String(data.error).toLowerCase();
  const code=/\b(?:invalid|incorrect|unauthorized|not valid)\b.*\b(?:api[_ -]?key|token)\b|\b(?:api[_ -]?key|token)\b.*\b(?:invalid|incorrect|unauthorized|not valid)\b/.test(reason)?'provider_invalid_key':
   /(?:monthly|credits|quota|plan|searches).*?(?:limit|exhaust|reached)|(?:limit|exhaust|reached).*?(?:monthly|credits|quota|plan|searches)/.test(reason)?'provider_remote_quota':
   /rate.?limit|too many requests/.test(reason)?'provider_rate_limit':'provider_error';
  throw new Error(code);
 }
 if(!hasResults)throw new Error('provider_missing_results');
 const organic=parseExternal(data.shopping_results||[],q);
 const sponsored=parseInlineStores(data.inline_shopping_results||[],q);
 return mergeOffers(organic,sponsored);
}
module.exports={safeHttps,safeImage,directMerchantUrl,safePageToken,titleMatches,isSpecificModel,euroPrice,parseExternal,configured,budget,fetchOffers,resolveOfferLink,shoppingSearchUrl,isGoogleHost,parseInlineStores,mergeOffers,retailerKey,sameRetailer,readEuroAmount,hasProductReference,canLookupSeller,selectRetailer,fetchDirectRetailer};
