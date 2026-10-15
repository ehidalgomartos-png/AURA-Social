'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {decodeHtmlBufferV32491,declaredCharsetsV32491,decodeEntitiesV3223,
  extractPageMetadataV3223,fetchWebPageV3223,MAX_PAGE_BYTES}=require('../src/services/editorial-web-import-v3223');
const ip={address:'8.8.8.8',family:4};
const url='https://medio.es/espana-y-melilla';
function mockRequest(headers,buffer){
 return (_options,callback)=>{
  const request=new EventEmitter();
  request.setTimeout=()=>{};request.destroy=()=>{};
  request.end=()=>{
   const res=new EventEmitter();
   res.statusCode=200;res.headers=headers;
   callback(res);
   res.emit('data',buffer.subarray(0,Math.max(1,Math.floor(buffer.length/2))));
   res.emit('data',buffer.subarray(Math.max(1,Math.floor(buffer.length/2))));
   res.emit('end');
  };return request;
 };
}
test('decode Windows-1252 from HTTP charset and preserve Spanish accents and typography',async()=>{
 const pre='<html><head><meta property="og:title" content="La valla donde tiembla España: Melilla recibe a los Reyes">' +
 '<meta name="description" content="Ceuta y Melilla eran las dos autonomías que Felipe VI no había visitado.">';
 const raw=Buffer.concat([Buffer.from(pre,'latin1'),Buffer.from([0x93]),
   Buffer.from('Orgullo y memoria de España', 'latin1'),Buffer.from([0x94]),Buffer.from('</head></html>')]);
 const page=await fetchWebPageV3223(url,{lookup:async()=>[ip],
  request:mockRequest({'content-type':'text/html; charset="windows-1252"'},raw)});
 assert.match(page.source_title,/España/);
 assert.match(page.source_excerpt,/autonomías/);
 assert.match(page.source_excerpt,/había/);
 assert.ok(!page.source_title.includes('�')&&!page.source_excerpt.includes('�'));
 assert.match(decodeHtmlBufferV32491(raw,'text/html; charset=windows-1252'),/“Orgullo y memoria de España”/);
});
test('ISO-8859-1 declared in HTML meta without charset header',()=>{
 const raw=Buffer.from('<html><meta charset="iso-8859-1"><meta property="og:title" content="España y la autonomía">'+
  '<meta name="description" content="El niño tenía información pública sobre la reunión."></html>','latin1');
 assert.equal(declaredCharsetsV32491(raw,'text/html').meta,'windows-1252');
 const title=extractPageMetadataV3223(decodeHtmlBufferV32491(raw,'text/html'),url);
 assert.equal(title.source_title,'España y la autonomía');
 assert.match(title.source_excerpt,/niño tenía/);
});
test('legacy http-equiv meta charset is recognized',()=>{
 const buf=Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">'+
  '<meta property="og:title" content="Melilla y España"><meta name="description" content="Revisión de la reunión pública">','latin1');
 assert.equal(declaredCharsetsV32491(buf,'text/html').meta,'windows-1252');
 assert.match(decodeHtmlBufferV32491(buf),/España/);
});
test('strict UTF-8 decoding preserves accents, not incorrectly recoded as Windows-1252',()=>{
 const text='<meta property="og:title" content="España: música y autonomía">'+
 '<meta name="description" content="Un niño participó en la sesión">';
 const raw=Buffer.from(text,'utf8');
 assert.equal(decodeHtmlBufferV32491(raw,'text/html'),text);
 const withBOM=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw]);
 assert.equal(decodeHtmlBufferV32491(withBOM,'text/html; charset=windows-1252'),text);
});
test('undocumented legacy bytes fall back only after strict UTF-8 fails',()=>{
 const buf=Buffer.from('<meta property="og:title" content="España y política">','latin1');
 assert.match(decodeHtmlBufferV32491(buf,'text/html'),/España y política/);
});
test('Spanish named entities, uppercase accented names and numeric entities are decoded safely',()=>{
 assert.equal(decodeEntitiesV3223('Espa&ntilde;a, autonom&iacute;as y &Aacute;vila &mdash; &iexcl;Hola!'),
   'España, autonomías y Ávila — ¡Hola!');
 assert.equal(decodeEntitiesV3223('ni&#241;o &#xF1; y &Uuml;ber'), 'niño ñ y Über');
 assert.equal(decodeEntitiesV3223('&lt;script&gt;alert(1)&lt;/script&gt;'),
   '<script>alert(1)</script>');
});
test('unexpected byte buffers and oversized payloads fail safely; network restrictions unchanged',()=>{
 assert.throws(()=>decodeHtmlBufferV32491(Buffer.alloc(MAX_PAGE_BYTES+1)),{code:'editorial_web_page_invalid'});
 assert.throws(()=>decodeHtmlBufferV32491('not bytes'),{code:'editorial_web_page_invalid'});
});
test('decode happens before metadata extraction with existing network limits and security guards',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../src/services/editorial-web-import-v3223.js'),'utf8');
 assert.match(source,/decodeHtmlBufferV32491\(Buffer\.concat\(chunks\),mime\)/);
 for(const guard of ['pinnedAddressLookup(ip)','MAX_PAGE_BYTES','res.statusCode','image_is_metadata_only',
  "'Accept-Encoding':'identity'"])assert.ok(source.includes(guard),guard);
 assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8')).version,'3.2.69');
});
