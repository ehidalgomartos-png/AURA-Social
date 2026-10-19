'use strict';
// WooCommerce CSV -> safe internal Marketplace preview records; no changes until confirmation.
const {z}=require('zod');
const {validGtin}=require('./marketplace-google-v3264');
const MAX_ROWS=250,MAX_CSV_BYTES=1024*1024;
function csvRecords(csv){
 if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)throw new Error('csv_too_large');
 let text=csv.replace(/^\uFEFF/,'');
 if(!text.trim())throw new Error('csv_empty');
 if(text.includes('\u0000'))throw new Error('csv_invalid_encoding');
 // Excel and other CSV exporters may prepend "sep=;" or "sep=,".
 text=text.replace(/^(?:[ \t]*\r?\n){0,3}/,'');
 const preamble=/^sep=([,;\t|])\r?\n/i.exec(text);
 if(preamble)text=text.slice(preamble[0].length);
 const header=text.split(/\r\n|\n|\r/,1)[0];
 const separators=[',',';','\t','|'];
 const countOutside=(str,sep)=>{
  let quoted=false,count=0;
  for(let i=0;i<str.length;i++){
   if(str[i]==='"'){if(quoted&&str[i+1]==='"')i++;else quoted=!quoted;}
   else if(!quoted&&str[i]===sep)count++;
  }
  return count;
 };
 const delimiter=preamble?preamble[1]:separators.reduce((best,sep)=>countOutside(header,sep)>countOutside(header,best)?sep:best,separators[0]);
 if(!countOutside(header,delimiter))throw new Error('csv_invalid_header');
 const records=[];let record=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&ch===delimiter){record.push(field);field='';}
  else if(!quoted&&(ch==='\r'||ch==='\n')){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   record.push(field);field='';
   if(record.some(x=>x.trim()!=='')){records.push(record);if(records.length>MAX_ROWS+1)throw new Error('csv_too_many_rows');}
   record=[];
  }else field+=ch;
  if(field.length>100000)throw new Error('csv_field_too_long');
 }
 if(quoted)throw new Error('csv_unclosed_quote');
 record.push(field);if(record.some(x=>x.trim()!==''))records.push(record);
 if(records.length<2)throw new Error('csv_no_products');
 if(records.length>MAX_ROWS+1)throw new Error('csv_too_many_rows');
 const cols=records.shift().map(normalize);
 if(!['nombre','name','product name','nombre del producto','titulo','titulo del producto'].some(name=>cols.includes(name)))throw new Error('csv_not_woocommerce');
 return records.map((cells,i)=>({line:i+2,cells,columns:cols}));
}
const {readableDescription}=require('./marketplace-description-v3267');
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function get(row,...names){for(const n of names){const i=row.columns.indexOf(normalize(n));if(i>=0)return String(row.cells[i]||'').trim();}return '';}
function clean(v){return String(v||'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();}
function cents(value){
 const s=String(value||'').trim().replace(/[€\s]/g,'');
 if(!s)return null;
 let n=s;if(s.includes(',')&&s.includes('.'))n=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(s.includes(','))n=s.replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(n))return null;
 const [whole,dec='']=n.split('.');const v=Number(whole)*100+Number(dec.padEnd(2,'0'));
 return Number.isSafeInteger(v)&&v<=99999999900?v:null;
}
const importOptions=z.object({city:z.string().trim().min(2).max(100),province:z.string().trim().max(100).optional().default(''),saleScope:z.enum(['local','national']).optional()}).strict();

function indexVariationParents(rows){
 // Only parent products exported in this same CSV are trusted.
 const byId=new Map(),bySku=new Map();
 for(const row of rows){
  if(!['variable','producto variable'].includes(get(row,'Type','Tipo').toLowerCase()))continue;
  const id=get(row,'ID').trim(),sku=get(row,'SKU').trim().toLowerCase();
  if(/^[1-9]\d{0,14}$/.test(id))byId.set(id,row);
  if(sku)bySku.set(sku,row);
 }
 return {byId,bySku};
}
function variationParent(row,parents){
 const raw=get(row,'Parent','Padre','Superior').trim();
 if(!raw||!parents)return null;
 const id=/^id:\s*(\d+)$/i.exec(raw);
 const sku=/^sku:\s*(.+)$/i.exec(raw);
 if(id)return parents.byId.get(id[1])||null;
 if(sku)return parents.bySku.get(sku[1].trim().toLowerCase())||null;
 return parents.byId.get(raw)||parents.bySku.get(raw.toLowerCase())||null;
}
function parseProduct(row,opts,parents=null){
 const type=get(row,'Type','Tipo').toLowerCase().trim();
 const variable=['variable','producto variable'].includes(type);
 const variation=['variation','variacion','variación'].includes(type);
 const parent=variation?variationParent(row,parents):null;
 const sku=get(row,'SKU'),wcId=get(row,'ID');
 const key=sku?'sku:'+sku.toLowerCase():/^[1-9]\d{0,14}$/.test(wcId)?'id:'+wcId:'';
 if(variable){
  // Parent products are metadata only: publishing both parent and variants duplicates the inventory.
  return {line:row.line,key:'',title:clean(get(row,'Name','Nombre','Product name','Nombre del producto')),
   priceCents:null,urls:[],listing:null,error:'Producto padre: sus variaciones se importan por separado',
   warnings:[],state:'skipped'};
 }
 const ownName=clean(get(row,'Name','Nombre','Product name','Nombre del producto','Título','Titulo','Título del producto'));
 const parentName=parent?clean(get(parent,'Name','Nombre','Product name','Nombre del producto')):'';
 const title=ownName||parentName;
 const ownDescription=clean(readableDescription(get(row,'Description','Descripción')||get(row,'Short description','Descripción corta')));
 const parentDescription=parent?clean(readableDescription(get(parent,'Description','Descripción')||get(parent,'Short description','Descripción corta'))):'';
 const suffix=parentName&&title.toLowerCase().startsWith(parentName.toLowerCase())
   ?title.slice(parentName.length).replace(/^[\s–—-]+/,'').trim():title;
 const warnings=[];
 let description=ownDescription;
 if(variation&&parent&&description.length<25){
  if(parentDescription.length>=25){
   description=parentDescription+(suffix?' Variante: '+suffix+'.':'');
  }else{
   // Use factual labels from the CSV only: never fabricate dimensions/materials/features.
   description='Producto: '+(parentName||title)+'. Variante: '+(suffix||title)+'.';
   warnings.push('Descripción preparada con el nombre del producto y su variante: revísala antes de publicar.');
  }
 }
 const rawCategory=get(row,'Categories','Categorías','Categorias')||(parent?get(parent,'Categories','Categorías','Categorias'):'');
 // Retain real nested WooCommerce labels for NEW CSV imports. Never reimport existing ads.
 const categoryPath=rawCategory.split(',')[0].split('>').map(part=>clean(part.trim())).filter(Boolean);
 const category=categoryPath[0]||'Otros';
 const subcategory=categoryPath.length>1?categoryPath.slice(1).reverse().find(part=>part.length>=2&&part.length<=65):null;
 // Each variation must use its own price, stock, SKU/ID and GTIN/MPN.
 const sale=get(row,'Sale price','Precio rebajado'),normal=get(row,'Regular price','Precio normal');
 const priceCents=cents(sale)??cents(normal);
 const published=get(row,'Published','Publicado');
 const inventory=get(row,'In stock?','En inventario','En stock','Hay existencias');
 const errors=[];
 if(!['','simple','producto simple','variation','variacion','variación'].includes(type))errors.push('Solo productos simples o variaciones válidas');
 if(variation&&!parent)errors.push('No se pueden importar variaciones sin su producto padre en este CSV');
 if(['0','-1','false','no'].includes(published.toLowerCase()))errors.push('Producto no publicado en origen');
 if(['0','false','no'].includes(inventory.toLowerCase()))errors.push('Sin existencias en origen');
 if(!key||key.length>150)errors.push('Es necesario SKU o ID válido');
 if(title.length<6||title.length>120)errors.push('Nombre entre 6 y 120 caracteres');
 if(description.length<25||description.length>4000)errors.push('Descripción entre 25 y 4.000 caracteres');
 if(category.length<2||category.length>65)errors.push('Categoría no válida');
 if(priceCents===null)errors.push('Precio no válido');
 const parseImages=r=>get(r,'Images','Imágenes','Imagenes').split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean).slice(0,6);
 let urls=parseImages(row);
 if(variation&&parent&&!urls.length){
  urls=parseImages(parent);
  if(urls.length)warnings.push('Fotografía heredada del producto padre: confirma que representa correctamente esta variante.');
 }
 if(!urls.length)errors.push('El producto necesita al menos una imagen HTTPS');
 if(urls.some(u=>!/^https:\/\/[^\s]+$/i.test(u)||u.length>2000))errors.push('Las imágenes deben tener URL HTTPS válida');
 const condition=/nuevo|new/i.test(get(row,'Condition','Estado')||(parent?get(parent,'Condition','Estado'):''))?'new':undefined;
 const brand=clean(get(row,'Brands','Brand','Marca')||(parent?get(parent,'Brands','Brand','Marca'):''));
 const gtin=get(row,'GTIN, UPC, EAN, or ISBN','GTIN','EAN','UPC','Global Unique ID').replace(/\s+/g,'');
 const mpn=clean(get(row,'MPN','Manufacturer Part Number','Referencia del fabricante'));
 if(brand.length>80)errors.push('Marca demasiado larga');
 if(gtin&&!validGtin(gtin))errors.push('EAN/GTIN no válido');
 if(mpn&&(mpn.length>70||!/^[A-Za-z0-9][A-Za-z0-9 ._\/-]*$/.test(mpn)))errors.push('Referencia de fabricante no válida');
 const listing={kind:'product',deal:'sale',title,description,category,city:opts.city,priceCents,images:[],
  details:{...(opts.province?{province:opts.province}:{}),...(subcategory?{subcategory}:{}),...(condition?{condition}:{}),
   ...(brand&&brand.length<=80?{brand}:{}),...(gtin&&validGtin(gtin)?{gtin}:{}),
   ...(mpn&&mpn.length<=70?{mpn}:{}),...(opts.saleScope?{saleScope:opts.saleScope}:{})}};
 return {line:row.line,key,title,priceCents,urls,listing,error:errors.join('; '),
  warnings,state:errors.length?'invalid':'pending'};
}
module.exports={csvRecords,parseProduct,indexVariationParents,importOptions,cents,MAX_ROWS,MAX_CSV_BYTES};
