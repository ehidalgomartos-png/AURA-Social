'use strict';
// Deterministic marketplace icon in 192px and 512px PNG, no image service or dependency.
// Colors and bag mark are independent from RedLibertad's PWA icon.
const zlib=require('node:zlib');
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const TABLE=Uint32Array.from({length:256},(_,i)=>{
 let x=i;for(let j=0;j<8;j++)x=(x&1)?(0xedb88320^(x>>>1)):(x>>>1);return x>>>0;
});
function crc32(buffer){let c=0xffffffff;for(const b of buffer)c=TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){
 const name=Buffer.from(type,'ascii'),sz=Buffer.alloc(4),crc=Buffer.alloc(4);
 sz.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
 return Buffer.concat([sz,name,data,crc]);
}
function withinRound(x,y,left,top,right,bottom,r){
 const cx=Math.max(left+r,Math.min(right-r,x));
 const cy=Math.max(top+r,Math.min(bottom-r,y));
 return (x-cx)**2+(y-cy)**2<=r*r;
}
function color(x,y){
 // All coordinates normalized to a 512x512 canvas.
 let c=[14,43,65];
 if(withinRound(x,y,18,18,494,494,106))c=[13,62,74];
 if(withinRound(x,y,112,194,400,401,35))c=[28,177,153];
 // simple bag handles, hollow center above the rectangular body
 if(y>=121&&y<=231&&x>=172&&x<=340){
   const outer=((x-256)/82)**2+((y-216)/96)**2<=1;
   const inner=((x-256)/43)**2+((y-217)/68)**2<=1;
   if(outer&&!inner)c=[248,251,245];
 }
 if(withinRound(x,y,127,214,385,391,25))c=[32,187,162];
 // stylized central "M" with white highlights.
 if(y>=266&&y<=345){
   const left=Math.abs(x-(185+(y-266)*0.04))<13;
   const right=Math.abs(x-(327-(y-266)*0.04))<13;
   const diagLeft=Math.abs(x-(198+(y-266)*0.73))<10&&y<334;
   const diagRight=Math.abs(x-(314-(y-266)*0.73))<10&&y<334;
   if(left||right||diagLeft||diagRight)c=[255,255,255];
 }
 return c;
}
const cache=new Map();
function icon(size){
 if(![192,512].includes(size))throw new RangeError('invalid icon size');
 if(cache.has(size))return cache.get(size);
 const raw=Buffer.alloc(size*(size*4+1));
 for(let py=0;py<size;py++){
   let cursor=py*(size*4+1);raw[cursor++]=0;
   for(let px=0;px<size;px++){
     const [r,g,b]=color((px+0.5)*512/size,(py+0.5)*512/size);
     raw[cursor++]=r;raw[cursor++]=g;raw[cursor++]=b;raw[cursor++]=255;
   }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 const png=Buffer.concat([PNG_SIGNATURE,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
 cache.set(size,png);return png;
}
module.exports={icon};
