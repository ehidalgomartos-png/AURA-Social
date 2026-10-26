'use strict';

// V3.2.150: pure, non-intrusive welcome criteria for existing and new members.
const DAY=24*60*60*1000;
const ACTIONS=new Set(['profile','create','explore','communities','feed']);
function nextWelcomeStep(steps=[]){
  // Publicar es voluntario y no exige completar antes campos opcionales del perfil.
  const priority=['post','avatar','profile','follow','community','interact'];
  return priority.map(id=>steps.find(step=>step?.id===id&&step.done!==true))
    .find(step=>step&&ACTIONS.has(step.action)) || null;
}
function welcomeEligibility(user,steps=[],now=Date.now()){
  if(!user||user.is_admin===true||user.status&&user.status!=='active')return false;
  const done=steps.filter(step=>step?.done===true).length;
  if(!steps.length||done===steps.length)return false;
  const joined=Date.parse(String(user.created_at||''));
  const recent=Number.isFinite(joined)&&joined<=now&&joined>=now-30*DAY;
  const noPublishedPosts=Number(user.post_count||0)===0;
  // Existing inactive accounts get a first opportunity, active established users aren't nagged.
  return noPublishedPosts || recent;
}
function welcomeVisible(eligible,state,now=Date.now()){
  if(!eligible||state?.dismissed_at)return false;
  const until=Date.parse(String(state?.snoozed_until||''));
  return !Number.isFinite(until)||until<=now;
}
module.exports={DAY,nextWelcomeStep,welcomeEligibility,welcomeVisible};
