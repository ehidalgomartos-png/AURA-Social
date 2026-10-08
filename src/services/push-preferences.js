'use strict';

// User-controlled delivery preferences apply ONLY to web push notifications.
// In-app notification records, safety signals and unread totals remain unchanged.
const PUSH_CATEGORY_KEYS=Object.freeze([
  'messages','mentions','interactions','community','consents','system'
]);
const DEFAULT_PUSH_PREFERENCES=Object.freeze(
  Object.fromEntries(PUSH_CATEGORY_KEYS.map(key=>[key,true]))
);

function pushCategoryForType(value){
  const type=String(value||'');
  if(type==='message')return 'messages';
  if(type==='mention'||type==='circle_mention')return 'mentions';
  if(type==='like'||type==='comment'||type==='repost')return 'interactions';
  if(type==='follow'||type==='creator_broadcast'||type==='creator_vip_broadcast'||
     type==='creator_poll_vote'||type==='creator_question_response'||type==='event_reminder'){
    return 'community';
  }
  if(type.startsWith('consent_')||type.startsWith('collaboration_'))return 'consents';
  return 'system';
}

function normalizePushPreferences(value){
  const data=value&&typeof value==='object'?value:{};
  return Object.fromEntries(PUSH_CATEGORY_KEYS.map(key=>[
    key,typeof data[key]==='boolean'?data[key]:true
  ]));
}

function shouldDeliverPush(type,preferences){
  const normalized=normalizePushPreferences(preferences);
  return normalized[pushCategoryForType(type)]===true;
}

module.exports={
  PUSH_CATEGORY_KEYS,
  DEFAULT_PUSH_PREFERENCES,
  pushCategoryForType,
  normalizePushPreferences,
  shouldDeliverPush
};
