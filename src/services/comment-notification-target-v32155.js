'use strict';

// V3.2.155 — Keep an optional, private pointer to the specific comment that
// triggered an existing notification. Old notifications remain valid.
const db=require('../db');
let ready=null;
function ensureCommentNotificationTargetV32155(){
  if(!ready){
    ready=db.query(`ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS comment_id BIGINT REFERENCES comments(id) ON DELETE SET NULL`
    ).catch(error=>{ready=null;throw error;});
  }
  return ready;
}
module.exports={ensureCommentNotificationTargetV32155};
