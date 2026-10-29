'use strict';
// V3.4.6.2 — sugerencias de modelos presentes en ofertas YA guardadas.
// Son enlaces para rellenar una búsqueda; nunca crean páginas ni consultan SerpApi.
const provider=require('./marketplace-comparador-provider-v32133');
const quality=require('./marketplace-comparador-offer-quality-v3419');
const discovery=require('./marketplace-comparador-index-discovery-v3458');
const auto=require('./marketplace-comparador-auto-seo-v32138');
const IGNORED=new Set(['wifi6','wifi7','rtx2050','rtx3050','rtx3060','rtx3070',
 'rtx4050','rtx4060','rtx4070','rtx4080','rtx4090','gtx1650','gtx1660',
 'ddr3','ddr4','ddr5','usb2','usb3','hdmi2','fhd1080','uhd4k','nvme2',
 'corei3','corei5','corei7','corei9','i3','i5','i7','i9','5g','4g']);
function usable(page,o){
 return o && !o.internal && !o.sponsored && o.price_currency==='EUR' &&
  Number.isSafeInteger(o.price_cents) && o.price_cents>0 &&
  typeof o.shop==='string' && o.shop.trim() &&
  o.shop.trim().toLowerCase()!=='tienda no identificada' &&
  typeof o.title==='string' && o.title.length<=180 &&
  provider.safeHttps(o.href) &&
  !quality.repairReason(o) && !quality.accessoryReason(o) &&
  provider.titleMatches(page.query_text,o.title);
}
function models(page,limit=3){
 const q=String(page?.query_text||'').trim().replace(/\s+/g,' ');
 if(q.length<3 || q.length>90 || /[<>{}@]/.test(q) ||
  quality.isRepairSearch(q) || discovery.modelEvidence(q))return [];
 const rows=Array.isArray(page?.external_results)?page.external_results:[];
 const groups=new Map(),queryTokens=new Set(quality.normalize(q).split(' '));
 for(const o of rows.slice(0,80)){
  if(!usable(page,o))continue;
  const title=o.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const found=title.match(/\b[a-z]{1,8}-?\d{1,5}[a-z0-9]{0,3}\b/g)||[];
  for(const original of new Set(found)){
   const model=original.replace(/-/g,'');
   if(IGNORED.has(model)||queryTokens.has(model)||model.length<2)continue;
   const token=original.toUpperCase();
   const withModel=q+' '+token;
   // Los teléfonos con una capacidad identificada deben mantenerla explícita.
   const capacity=quality.isPhoneSearch(withModel)?auto.capacity(o.title):null;
   const candidate=withModel+(capacity?' '+capacity.replace('gb',' GB'):'');
   if(candidate.length>100 || !provider.titleMatches(candidate,o.title))continue;
   const key=quality.normalize(candidate);
   let group=groups.get(key);
   if(!group){
    group={query:candidate,shops:new Set(),offerCount:0};
    groups.set(key,group);
   }
   group.offerCount++;
   group.shops.add(quality.normalize(o.shop));
  }
 }
 return [...groups.values()]
  .map(g=>({query:g.query,sellerCount:g.shops.size,offerCount:g.offerCount}))
  .sort((a,b)=>b.sellerCount-a.sellerCount || b.offerCount-a.offerCount ||
   a.query.localeCompare(b.query,'es'))
  .slice(0,Number.isInteger(limit)&&limit>0?Math.min(limit,5):3);
}
module.exports={models};
