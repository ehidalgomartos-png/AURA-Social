const crypto=require('crypto');
const db=require('../db');

let releaseSchemaReady=null;

async function ensureReleaseSchema(){
  if(!releaseSchemaReady){
    releaseSchemaReady=(async()=>{
      await db.query(`
        CREATE TABLE IF NOT EXISTS beta_cohorts (
          id BIGSERIAL PRIMARY KEY,
          cohort_key VARCHAR(60) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          description VARCHAR(500) NOT NULL DEFAULT '',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS beta_cohort_members (
          cohort_id BIGINT NOT NULL REFERENCES beta_cohorts(id) ON DELETE CASCADE,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          added_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(cohort_id,user_id)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS release_features (
          feature_key VARCHAR(60) PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          description VARCHAR(500) NOT NULL DEFAULT '',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query("ALTER TABLE release_features ADD COLUMN IF NOT EXISTS rollout_stage TEXT NOT NULL DEFAULT 'cohorts'");
      await db.query("ALTER TABLE release_features ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER NOT NULL DEFAULT 0");
      await db.query("ALTER TABLE release_features ADD COLUMN IF NOT EXISTS rollout_frozen BOOLEAN NOT NULL DEFAULT FALSE");
      await db.query("ALTER TABLE release_features ADD COLUMN IF NOT EXISTS rollout_note VARCHAR(500) NOT NULL DEFAULT ''");
      await db.query(`
        UPDATE release_features
           SET rollout_stage='graduated',
               rollout_percentage=100
         WHERE default_enabled=TRUE
           AND rollout_stage='cohorts'
           AND rollout_percentage=0
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS release_feature_cohorts (
          feature_key VARCHAR(60) NOT NULL REFERENCES release_features(feature_key) ON DELETE CASCADE,
          cohort_id BIGINT NOT NULL REFERENCES beta_cohorts(id) ON DELETE CASCADE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(feature_key,cohort_id)
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_beta_cohort_members_user ON beta_cohort_members(user_id,cohort_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_release_feature_cohorts_cohort ON release_feature_cohorts(cohort_id,feature_key)');
      await db.query(`
        CREATE TABLE IF NOT EXISTS release_change_audit (
          id BIGSERIAL PRIMARY KEY,
          target_type TEXT NOT NULL CHECK(target_type IN ('feature','cohort')),
          target_key VARCHAR(120) NOT NULL,
          action VARCHAR(80) NOT NULL,
          before_state JSONB,
          after_state JSONB,
          actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          request_id VARCHAR(100),
          rollback_of BIGINT REFERENCES release_change_audit(id) ON DELETE SET NULL,
          rolled_back_at TIMESTAMPTZ,
          rolled_back_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_release_change_audit_created ON release_change_audit(created_at DESC)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_release_change_audit_target ON release_change_audit(target_type,target_key,created_at DESC)');
      await db.query(`
        INSERT INTO release_features(feature_key,name,description,enabled,default_enabled)
        VALUES('support_center','Centro de soporte beta','Ayuda y feedback dentro de la aplicación.',TRUE,TRUE)
        ON CONFLICT(feature_key) DO NOTHING
      `);
    })().catch(error=>{
      releaseSchemaReady=null;
      throw error;
    });
  }
  return releaseSchemaReady;
}

function rolloutBucket(userId,featureKey){
  const digest=crypto.createHash('sha256').update(String(featureKey)+':'+String(userId)).digest('hex').slice(0,8);
  return parseInt(digest,16)%100;
}

function evaluateFeatureRow(row,userId){
  if(!row || row.enabled!==true)return false;
  if(row.default_enabled===true || Number(row.rollout_percentage||0)>=100)return true;
  if(row.cohort_enabled===true)return true;
  const percentage=Math.max(0,Math.min(100,Number(row.rollout_percentage||0)));
  return percentage>0 && rolloutBucket(userId,row.feature_key)<percentage;
}

async function featureEnabledForUser(userId,featureKey){
  await ensureReleaseSchema();
  const result=await db.query(`
    SELECT f.feature_key,f.enabled,f.default_enabled,f.rollout_percentage,
           EXISTS(
             SELECT 1
               FROM release_feature_cohorts fc
               JOIN beta_cohorts c ON c.id=fc.cohort_id
               JOIN beta_cohort_members cm ON cm.cohort_id=c.id
              WHERE fc.feature_key=f.feature_key
                AND fc.enabled=TRUE
                AND c.enabled=TRUE
                AND cm.user_id=$1
           ) AS cohort_enabled
      FROM release_features f
     WHERE f.feature_key=$2
     LIMIT 1
  `,[userId,featureKey]);
  return result.rowCount ? evaluateFeatureRow(result.rows[0],userId) : false;
}

async function featuresForUser(userId){
  await ensureReleaseSchema();
  const result=await db.query(`
    SELECT f.feature_key,f.enabled,f.default_enabled,f.rollout_percentage,
           EXISTS(
             SELECT 1
               FROM release_feature_cohorts fc
               JOIN beta_cohorts c ON c.id=fc.cohort_id
               JOIN beta_cohort_members cm ON cm.cohort_id=c.id
              WHERE fc.feature_key=f.feature_key
                AND fc.enabled=TRUE
                AND c.enabled=TRUE
                AND cm.user_id=$1
           ) AS cohort_enabled
      FROM release_features f
     ORDER BY f.feature_key
  `,[userId]);
  return Object.fromEntries(result.rows.map(row=>[row.feature_key,evaluateFeatureRow(row,userId)]));
}

function requireFeature(featureKey){
  return async(req,res,next)=>{
    try{
      const enabled=await featureEnabledForUser(req.user?.id,featureKey);
      if(!enabled)return res.status(403).json({error:'feature_disabled',feature:featureKey});
      next();
    }catch(error){
      next(error);
    }
  };
}

module.exports={ensureReleaseSchema,featureEnabledForUser,featuresForUser,requireFeature};
