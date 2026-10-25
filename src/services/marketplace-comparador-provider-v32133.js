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
function shoppingSearchUrl(title,shop=''){
 const q=String(title||'').trim().slice(0,160);
 if(!q)return null;
 const origin='https://www.google.com/search';
 const url=new URL(origin);
 const suffix=String(shop||'').trim().slice(0,50);
 url.searchParams.set('q',(q+' '+(suffix&&suffix!=='Tienda no identificada'?suffix:'')).trim());
 url.searchParams.set('udm','28');
 url.searchParams.set('hl','es');
 url.searchParams.set('gl','es');
 return url.href;
}
// Nunca enviar al usuario a un product_link de Google que puede haber caducado.
// Aplica también a URLs guardadas anteriormente en PostgreSQL.
function resolveOfferLink(offer){
 const href=safeHttps(offer?.href);
 if(offer?.internal)return {href:offer.href,destination:'internal'};
 if(href&&!isGoogleHost(new URL(href).hostname)){
  return {href,destination:'store'};
 }
 const search=shoppingSearchUrl(offer?.title,offer?.shop);
 return search?{href:search,destination:'shopping-search'}:null;
}
function isSpecificModel(q){
 const words=keyOf(q).split(' ').filter(Boolean);
 return words.length>=2 && words.some(w=>/\d/.test(w));
}
function titleMatches(q,title){
 const query=keyOf(q),value=keyOf(title);
 if(!query||!value)return false;
 if(EXCLUDED.test(value)&&!EXCLUDED.test(query))return false;
 const terms=query.split(' ').filter(t=>t.length>=2),wanted=new Set(terms);
 const words=new Set(value.split(' '));
 const match=terms.filter(t=>words.has(t)).length;
 if(!terms.length||match<Math.max(1,Math.ceil(terms.length*.72)))return false;
 if(terms.some(t=>/\d/.test(t)&&!words.has(t)))return false;
 // No mezclar variantes de gama "Pro" y "Pro Max", "Ultra" y modelo base.
 for(const marker of ['max','ultra','plus','mini','lite']){
  if(!wanted.has(marker)&&words.has(marker)&&isSpecificModel(q))return false;
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
  const direct=safeHttps(r.link||'');
  const product=safeHttps(r.product_link||'');
  if(!direct&&!product)continue;
  const shop=String(r.source||'Tienda no identificada').replace(/[<>]/g,'').trim().slice(0,80)||'Tienda no identificada';
  const landing=direct&&!isGoogleHost(new URL(direct).hostname)?{href:direct,destination:'store'}:
   resolveOfferLink({title,shop,href:product||direct});
  if(!landing)continue;
  const dedup=shop.toLowerCase()+'|'+keyOf(title)+'|'+cents;
  if(seen.has(dedup))continue;
  seen.add(dedup);
  const condition=String(r.second_hand_condition||'').toLowerCase();
  out.push({
   title,shop,price_cents:cents,href:landing.href,
   destination:landing.destination,
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
  const direct=safeHttps(r.link||'');
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
 const out=(Array.isArray(organic)?organic:[]).slice(0,24),seen=new Set();
 // La URL de cada vendedor es preferible a una ficha genérica de Google.
 const key=o=>keyOf(o.shop)+'|'+keyOf(o.title)+'|'+o.price_cents;
 for(const offer of out)seen.add(key(offer));
 for(const offer of (Array.isArray(ads)?ads:[])){
  if(seen.has(key(offer)))continue;
  out.push(offer);seen.add(key(offer));
 }
 return out.slice(0,32).sort((a,b)=>a.price_cents-b.price_cents);
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
 return {daily:read('COMPARADOR_DAILY_LIMIT',5,50),monthly:read('COMPARADOR_MONTHLY_LIMIT',100,250)};
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
 if(data?.error)throw new Error('provider_error');
 if(!Array.isArray(data?.shopping_results)&&!Array.isArray(data?.inline_shopping_results))throw new Error('provider_missing_results');
 const organic=parseExternal(data.shopping_results||[],q);
 const sponsored=parseInlineStores(data.inline_shopping_results||[],q);
 return mergeOffers(organic,sponsored);
}
module.exports={safeHttps,safeImage,titleMatches,isSpecificModel,euroPrice,parseExternal,configured,budget,fetchOffers,resolveOfferLink,shoppingSearchUrl,isGoogleHost,parseInlineStores,mergeOffers};
