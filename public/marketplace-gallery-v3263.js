'use strict';
// V3.2.63 - Photo gallery for public product pages; stays usable by touch
// and keyboard with JavaScript disabled (native horizontal scrolling).
document.querySelectorAll('[data-market-gallery]').forEach(root=>{
 const strip=root.querySelector('.gallery');
 const images=[...strip?.querySelectorAll('img')||[]];
 const previous=root.querySelector('[data-market-prev]');
 const next=root.querySelector('[data-market-next]');
 const counter=root.querySelector('[data-market-counter]');
 if(!strip||images.length<2||!previous||!next||!counter)return;
 let current=0,scheduled=false;
 function render(){
  previous.disabled=current===0;
  next.disabled=current===images.length-1;
  counter.textContent=(current+1)+' de '+images.length;
 }
 function go(delta){
  current=Math.max(0,Math.min(images.length-1,current+delta));
  const left=images[current].offsetLeft-images[0].offsetLeft;
  strip.scrollTo({left,behavior:'smooth'});
  render();
 }
 function nearest(){
  const left=strip.scrollLeft;
  let candidate=0,distance=Infinity;
  for(let i=0;i<images.length;i++){
   const gap=Math.abs(images[i].offsetLeft-images[0].offsetLeft-left);
   if(gap<distance){candidate=i;distance=gap;}
  }
  current=candidate;
  render();
 }
 previous.addEventListener('click',()=>go(-1));
 next.addEventListener('click',()=>go(1));
 strip.addEventListener('scroll',()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;nearest();});
 },{passive:true});
 window.addEventListener('resize',nearest,{passive:true});
 render();
});
