'use strict';

// Read-only daily editorial triage. A recommendation is not permission to publish.
const MADRID='Europe/Madrid';
function madridDay(date=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:MADRID,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function validDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function qualityCurrent(item){
  return item.quality_decision==='clear' &&
    item.quality_revision!=null &&
    Number(item.quality_revision)===Number(item.revision);
}
function editorialReady(item){
  return item.status==='approved'&&
    !item.live_publication_id &&
    item.source_status==='approved'&&item.profile_status==='ready'&&
    qualityCurrent(item)&&String(item.editorial_title||'').trim().length>=12&&
    String(item.editorial_summary||'').trim().length>=70;
}
function triage(rows,{day}={}){
  if(!validDay(day))throw new Error('invalid_editorial_day');
  const planned=[],ready=[],needsQuality=[],others=[];
  for(const row of rows){
    if(row.status!=='approved'||row.live_publication_id)continue;
    const due=row.planned_day===day;
    const overdue=!!row.planned_day&&row.planned_day<day;
    const stalePlan=row.plan_revision!=null&&Number(row.plan_revision)!==Number(row.revision);
    const entry={...row,quality_current:qualityCurrent(row),publication_prechecks_met:editorialReady(row),
      planned_for_day:due,overdue,plan_stale:stalePlan};
    if(due||overdue){planned.push(entry);continue;}
    // Do not suggest early release of an item booked for a future day.
    if(row.planned_day&&row.planned_day>day){others.push(entry);continue;}
    if(editorialReady(row)){ready.push(entry);continue;}
    if(!qualityCurrent(row)||row.source_status!=='approved'||row.profile_status!=='ready'){
      needsQuality.push(entry);continue;
    }
    others.push(entry);
  }
  planned.sort((a,b)=>{
    if(a.overdue!==b.overdue)return Number(b.overdue)-Number(a.overdue);
    return new Date(a.planned_for||0)-new Date(b.planned_for||0)||
      Number(b.priority||2)-Number(a.priority||2);
  });
  ready.sort((a,b)=>Number(b.priority||2)-Number(a.priority||2)||
    new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0));
  needsQuality.sort((a,b)=>new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0));
  return {planned,ready,needsQuality,others};
}
function sourceAlerts(sources,now=new Date()){
  return sources.filter(source=>{
    const last=source.last_checked_at?new Date(source.last_checked_at).getTime():NaN;
    return source.status==='approved'&&(!Number.isFinite(last)||now.getTime()-last>48*3600*1000);
  });
}
module.exports={MADRID,madridDay,validDay,qualityCurrent,editorialReady,triage,sourceAlerts};
