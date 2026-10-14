'use strict';
// WooCommerce CSV -> safe internal Marketplace preview records; no changes until confirmation.
const {z}=require('zod');
const MAX_ROWS=250,MAX_CSV_BYTES=1024*1024;
function csvRecords(csv){
 if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)throw new Error('csv_too_large');
 const text=csv.replace(/^\uFEFF/,'');if(!text.trim())throw new Error('csv_empty');
 const headerLine=text.split(/\r?\n/,1)[0];
 const separators=[',',';','\t'];
 const countOutside=(str,sep)=>{let q=false,n=0;for(let i=0;i<str.length;i++){if(str[i]==='"'){if(q&&str[i+1]==='"')i++;else q=!q;}else if(!q&&str[i]===sep)n++;}return n;};
 const delimiter=separators.sort((a,b)=>countOutside(headerLine,b)-countOutside(headerLine,a))[0];
 if(!countOutside(headerLine,delimiter))throw new Error('csv_invalid_header');
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
 if(!cols.includes('nombre')&&!cols.includes('name'))throw new Error('csv_not_woocommerce');
 return records.map((cells,i)=>({line:i+2,cells,columns:cols}));
}
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
const importOptions=z.object({city:z.string().trim().min(2).max(100),province:z.string().trim().max(100).optional().default('')}).strict();
function parseProduct(row,opts){
 const type=get(row,'Type','Tipo').toLowerCase().trim();
 const sku=get(row,'SKU');const wcId=get(row,'ID');
 const key=sku?'sku:'+sku.toLowerCase():/^[1-9]\d{0,14}$/.test(wcId)?'id:'+wcId:'';
 const title=clean(get(row,'Name','Nombre'));
 const description=clean(get(row,'Description','Descripción')||get(row,'Short description','Descripción corta'));
 const rawCategory=get(row,'Categories','Categorías','Categorias').split(',')[0].split('>')[0].trim();
 const category=clean(rawCategory)||'Otros';
 const sale=get(row,'Sale price','Precio rebajado');const normal=get(row,'Regular price','Precio normal');
 const priceCents=cents(sale)||cents(normal);
 const published=get(row,'Published','Publicado');
 const inventory=get(row,'In stock?','En inventario','En stock','Hay existencias');
 const errors=[];
 if(type&&!['simple','producto simple'].includes(type))errors.push('Solo productos simples: variaciones no admitidas');
 if(['0','-1','false','no'].includes(published.toLowerCase()))errors.push('Producto no publicado en origen');
 if(['0','false','no'].includes(inventory.toLowerCase()))errors.push('Sin existencias en origen');
 if(!key||key.length>150)errors.push('Es necesario SKU o ID válido');
 if(title.length<6||title.length>120)errors.push('Nombre entre 6 y 120 caracteres');
 if(description.length<25||description.length>4000)errors.push('Descripción entre 25 y 4.000 caracteres');
 if(category.length<2||category.length>65)errors.push('Categoría no válida');
 if(priceCents===null)errors.push('Precio no válido');
 const urls=get(row,'Images','Imágenes','Imagenes').split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean).slice(0,6);
 if(!urls.length)errors.push('El producto necesita al menos una imagen HTTPS');
 if(urls.some(u=>!/^https:\/\/[^\s]+$/i.test(u)||u.length>2000))errors.push('Las imágenes deben tener URL HTTPS válida');
 const condition=/nuevo|new/i.test(get(row,'Condition','Estado'))?'new':undefined;
 const listing={kind:'product',deal:'sale',title,description,category,city:opts.city,priceCents,images:[],details:{...(opts.province?{province:opts.province}:{}),...(condition?{condition}:{})}};
 return {line:row.line,key,title,priceCents,urls,listing,error:errors.join('; '),state:errors.length?'invalid':'pending'};
}
module.exports={csvRecords,parseProduct,importOptions,cents,MAX_ROWS,MAX_CSV_BYTES};
