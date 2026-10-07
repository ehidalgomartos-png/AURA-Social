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

async function featureEnabledForUser(userId,featureKey){
  await ensureReleaseSchema();
  const result=await db.query(`
    SELECT
      f.feature_key,
      CASE
        WHEN f.enabled=FALSE THEN FALSE
        WHEN f.default_enabled=TRUE THEN TRUE
        ELSE EXISTS(
          SELECT 1
            FROM release_feature_cohorts fc
            JOIN beta_cohorts c ON c.id=fc.cohort_id
            JOIN beta_cohort_members cm ON cm.cohort_id=c.id
           WHERE fc.feature_key=f.feature_key
             AND fc.enabled=TRUE
             AND c.enabled=TRUE
             AND cm.user_id=$1
        )
      END AS enabled
      FROM release_features f
     WHERE f.feature_key=$2
     LIMIT 1
  `,[userId,featureKey]);
  return result.rowCount ? result.rows[0].enabled===true : false;
}

async function featuresForUser(userId){
  await ensureReleaseSchema();
  const result=await db.query(`
    SELECT
      f.feature_key,
      CASE
        WHEN f.enabled=FALSE THEN FALSE
        WHEN f.default_enabled=TRUE THEN TRUE
        ELSE EXISTS(
          SELECT 1
            FROM release_feature_cohorts fc
            JOIN beta_cohorts c ON c.id=fc.cohort_id
            JOIN beta_cohort_members cm ON cm.cohort_id=c.id
           WHERE fc.feature_key=f.feature_key
             AND fc.enabled=TRUE
             AND c.enabled=TRUE
             AND cm.user_id=$1
        )
      END AS enabled
      FROM release_features f
     ORDER BY f.feature_key
  `,[userId]);
  return Object.fromEntries(result.rows.map(row=>[row.feature_key,row.enabled===true]));
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
