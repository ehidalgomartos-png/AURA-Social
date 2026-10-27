'use strict';

// Keep an existing member's return-to-home baseline stable while an open
// browser tab refreshes unread counters. The client input is strictly bounded.
const THIRTY_DAYS_V3322=30*24*60*60*1000;
const ISO_V3322=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function resolveReturnSinceV3322(requested,fallback,now=Date.now()){
  if(typeof requested!=='string'||!ISO_V3322.test(requested))return fallback;
  const date=new Date(requested),time=date.getTime();
  if(!Number.isFinite(time)||date.toISOString()!==requested ||
     time>now||time<now-THIRTY_DAYS_V3322)return fallback;
  return date;
}
module.exports={resolveReturnSinceV3322,THIRTY_DAYS_V3322};
