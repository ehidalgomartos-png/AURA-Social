'use strict';
// V3.4.5.2 — aggregated, owner-only statistics without personal visitor information.
const DAY=86400000;
function normalizeCount(value){
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>0?n:0;
}
function dayUtc(value){
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
function dailyTrend(rows,now=Date.now(),days=30){
 const end=dayUtc(now);
 if(!end||!Number.isInteger(days)||days<1||days>31)throw Error('invalid_trend_range');
 const start=Date.parse(end+'T00:00:00.000Z')-(days-1)*DAY;
 const values=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  const day=typeof row?.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)?row.day:null;
  const timestamp=day?Date.parse(day+'T00:00:00.000Z'):NaN;
  if(Number.isFinite(timestamp)&&timestamp>=start&&timestamp<=Date.parse(end+'T00:00:00.000Z'))
   values.set(day,normalizeCount(row.clicks));
 }
 const series=Array.from({length:days},(_,i)=>{
  const day=new Date(start+i*DAY).toISOString().slice(0,10);
  return {day,clicks:values.get(day)||0};
 });
 const total=series.reduce((sum,row)=>sum+row.clicks,0);
 const peak=Math.max(0,...series.map(x=>x.clicks));
 return {series,total,peak,days};
}
function productRows(rows){
 return (Array.isArray(rows)?rows:[]).slice(0,10).map(row=>({
  id:String(row?.id||''),title:String(row?.title||'Producto sin título').slice(0,160),
  clicks:normalizeCount(row?.clicks)
 }));
}
module.exports={dayUtc,normalizeCount,dailyTrend,productRows};
