'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const url=process.env.STRIPE_REENROLL_CI_DATABASE_URL;
const source=fs.readFileSync(path.join(__dirname,'../src/routes/growth.js'),'utf8');
function queryText(){
 const marker='const starterProfiles=await db.query(' + String.fromCharCode(96);
 const begin=source.indexOf(marker);
 assert.ok(begin>0);
 const start=begin+marker.length,end=source.indexOf(String.fromCharCode(96)+',[req.user.id]);',start);
 assert.ok(end>start);
 return source.slice(start,end);
}
test('PostgreSQL 18: fair and private first-circle public-post signals',{skip:!url},async()=>{
 const db=new Client({connectionString:url});
 await db.connect();
 try{
  await db.query('BEGIN');
  await db.query('CREATE TEMP TABLE users(id bigint PRIMARY KEY,username text,display_name text,avatar_url text,bio text,creator_verified boolean,location_label text,created_at timestamptz,status text,is_admin boolean,discoverable boolean,show_activity boolean)');
  await db.query('CREATE TEMP TABLE posts(user_id bigint,post_kind text,moderation_status text,audience text,content_level text,created_at timestamptz)');
  await db.query('CREATE TEMP TABLE follows(follower_id bigint,following_id bigint)');
  await db.query('CREATE TEMP TABLE user_interests(user_id bigint,interest text)');
  await db.query('CREATE TEMP TABLE blocks(blocker_id bigint,blocked_id bigint)');
  await db.query('CREATE TEMP TABLE mutes(muter_id bigint,muted_id bigint)');
  await db.query('CREATE TEMP TABLE discovery_hidden_items(user_id bigint,item_type text,item_id bigint)');
  const users=[1,2,3,4,5,6,8,9,10,11,12,13,14,15].map(id=>({
   id,recent:id===4,visible:id!==13,isAdmin:id===14,
   status:id===15?'suspended':'active',activity:id!==8
  }));
  for(const u of users)await db.query(
   'INSERT INTO users(id,username,display_name,created_at,status,is_admin,discoverable,show_activity,bio,creator_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE)',
   [u.id,'person_'+u.id,'Person '+u.id,u.recent?new Date():new Date('2026-01-01T00:00:00Z'),u.status,u.isAdmin,u.visible,u.activity,u.id===2?'Hola':null]
  );
  for(const id of [1,2,3,8])await db.query('INSERT INTO user_interests(user_id,interest) VALUES($1,$2)',[id,'fotografía']);
  for(const [id,audience,level] of [
   [2,'public','normal'],[3,'public','sensitive'],[4,'private','normal'],
   [5,'public','normal'],[6,'private','normal'],[8,'public','normal'],
   [9,'public','normal'],[10,'public','normal'],[11,'public','normal'],[12,'public','normal']
  ])await db.query(
   'INSERT INTO posts(user_id,post_kind,moderation_status,audience,content_level,created_at) VALUES($1,$2,$3,$4,$5,now())',
   [id,'post','published',audience,level]
  );
  await db.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES(1,9)');
  await db.query('INSERT INTO follows(follower_id,following_id) VALUES(1,10)');
  await db.query('INSERT INTO mutes(muter_id,muted_id) VALUES(1,11)');
  await db.query("INSERT INTO discovery_hidden_items(user_id,item_type,item_id) VALUES(1,'user',12)");
  const result=await db.query(queryText(),[1]);
  const ids=result.rows.map(r=>Number(r.id));
  assert.deepEqual(ids.slice(0,3).sort((a,b)=>a-b),[2,3,8]);
  assert.equal(ids[3],4);
  assert.equal(ids[4],5);
  assert.equal(ids[5],6);
  assert.equal(result.rows.find(x=>Number(x.id)===2).recent_public_post,true);
  for(const id of [3,4,6,8])assert.equal(result.rows.find(x=>Number(x.id)===id).recent_public_post,false);
  assert.ok([9,10,11,12,13,14,15].every(id=>!ids.includes(id)));
  await db.query('ROLLBACK');
 }finally{await db.end()}
});
