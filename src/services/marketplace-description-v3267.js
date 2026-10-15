'use strict';
// Repair escaped WooCommerce line breaks for display, never rewriting existing listings.
function readableDescription(value){
 return String(value??'').replace(/\r\n?/g,'\n').replace(/\\r\\n|\\n|\\r/g,'\n').replace(/[\u2028\u2029]/g,'\n').trim();
}
function descriptionParts(value,limit=530){
 const text=readableDescription(value);
 if(text.length<=limit+120)return {preview:text,more:''};
 const chunk=text.slice(0,limit+1),line=chunk.lastIndexOf('\n'),space=chunk.lastIndexOf(' ');
 const at=line>=Math.floor(limit*.55)?line:space>=Math.floor(limit*.65)?space:limit;
 return {preview:text.slice(0,at).trimEnd(),more:text.slice(at).trimStart()};
}
module.exports={readableDescription,descriptionParts};

