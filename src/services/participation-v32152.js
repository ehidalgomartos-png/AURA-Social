'use strict';

// V3.2.152: suggest one genuine discussion only on a meaningful return.
// Uses server timestamps and the member's existing published-post state.
const HOUR=60*60*1000;
function canOfferConversation({lastHomeSeenAt,lastPromptAt,snoozedUntil,hasPublishedPosts},now=Date.now()){
  if(hasPublishedPosts!==true)return false; // First-post onboarding handles new members.
  const last=Date.parse(String(lastHomeSeenAt||''));
  if(!Number.isFinite(last)||last>now||now-last<24*HOUR)return false;
  const snooze=Date.parse(String(snoozedUntil||''));
  if(Number.isFinite(snooze)&&snooze>now)return false;
  const previous=Date.parse(String(lastPromptAt||''));
  if(Number.isFinite(previous) && (previous>now || now-previous<72*HOUR))return false;
  return true;
}
module.exports={HOUR,canOfferConversation};
