'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('pg');
const {GROWTH_SQL,summarizeGrowth}=require('../src/routes/admin-growth-v219');
const uri=process.env.STRIPE_REENROLL_CI_DATABASE_URL;
const HOUR=3600000,DAY=24*HOUR;
test('PostgreSQL 18: public D1/D7 excludes private/sensitive posts, own comments and private activity',{skip:!uri},async()=>{
 const client=new Client({connectionString:uri});
 await client.connect();
 try{
  await client.query('BEGIN');
  for(const sql of [
   'CREATE TEMP TABLE users(id bigint PRIMARY KEY,created_at timestamptz,is_admin boolean,status text,avatar_url text,bio text)',
   'CREATE TEMP TABLE signup_attributions(user_id bigint,source_type text,source_key text)',
   'CREATE TEMP TABLE user_interests(user_id bigint,interest text)',
   'CREATE TEMP TABLE posts(id bigint PRIMARY KEY,user_id bigint,created_at timestamptz,moderation_status text,post_kind text,audience text,content_level text)',
   'CREATE TEMP TABLE comments(id bigint,user_id bigint,post_id bigint,created_at timestamptz)',
   'CREATE TEMP TABLE follows(follower_id bigint,following_id bigint,created_at timestamptz)',
   'CREATE TEMP TABLE messages(sender_id bigint,created_at timestamptz)',
   'CREATE TEMP TABLE likes(user_id bigint,created_at timestamptz)'
  ])await client.query(sql);
  const joined=new Date(Date.now()-10*DAY),old=new Date(Date.now()-100*DAY);
  for(const id of [1,5,6])await client.query(
   "INSERT INTO users(id,created_at,is_admin,status) VALUES($1,$2,FALSE,'active')",[id,joined]);
  await client.query("INSERT INTO users(id,created_at,is_admin,status) VALUES(2,$1,TRUE,'active')",[old]);
  const at=offset=>new Date(joined.getTime()+offset*HOUR);
  await client.query("INSERT INTO posts VALUES(101,1,$1,'published','post','public','normal')",[at(36)]);
  await client.query("INSERT INTO posts VALUES(102,5,$1,'published','post','private','normal')",[at(36)]);
  await client.query("INSERT INTO posts VALUES(103,5,$1,'published','post','public','sensitive')",[at(180)]);
  await client.query("INSERT INTO posts VALUES(104,2,$1,'published','post','public','normal')",[old]);
  await client.query("INSERT INTO posts VALUES(105,2,$1,'published','post','public','sensitive')",[old]);
  await client.query('INSERT INTO comments VALUES(201,1,104,$1)',[at(180)]);
  await client.query('INSERT INTO comments VALUES(202,5,102,$1)',[at(180)]);
  await client.query('INSERT INTO comments VALUES(203,6,105,$1)',[at(180)]);
  for(const offset of [36,180]){
   await client.query('INSERT INTO messages VALUES(6,$1)',[at(offset)]);
   await client.query('INSERT INTO likes VALUES(6,$1)',[at(offset)]);
  }
  const result=await client.query(GROWTH_SQL,[30]);
  assert.equal(result.rowCount,3);
  const totals=summarizeGrowth(result.rows,30).totals;
  assert.equal(totals.eligibleD1,3);assert.equal(totals.eligibleD7,3);
  assert.equal(totals.activeD1,3);assert.equal(totals.activeD7,3);
  assert.equal(totals.publicD1,1);assert.equal(totals.publicD7,1);
  assert.equal(totals.publicD1RatePct,33.3);
  assert.equal(totals.publicD7RatePct,33.3);
  assert.equal(result.rows.filter(r=>r.public_contribution_d1===true).length,1);
  assert.equal(result.rows.filter(r=>r.public_contribution_d7===true).length,1);
  await client.query('ROLLBACK');
 }finally{await client.end();}
});
