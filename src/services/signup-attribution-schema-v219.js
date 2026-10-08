'use strict';

// Shared by registration and administrative growth endpoints. No data deletion.
let ready=null;
const TYPES=Object.freeze(['profile','post','community','event','reel','topic','story','guide']);
function ensureSignupAttributionSchema(db){
  if(!db?.query)throw new TypeError('db required');
  if(!ready){
    ready=(async()=>{
      await db.query(
        "CREATE TABLE IF NOT EXISTS signup_attributions ("+
        "user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"+
        "source_type VARCHAR(20) NOT NULL CHECK(source_type IN ('profile','post','community','event','reel','topic','story','guide')),"+
        "source_key VARCHAR(120) NOT NULL DEFAULT '',source_path VARCHAR(280) NOT NULL,"+
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
      );
      // The earlier constraint persists after CREATE IF NOT EXISTS.
      // Widen the named constraint only when it lacks the guide source.
      await db.query(
        "DO $migration$ DECLARE existing_definition TEXT; BEGIN "+
        "SELECT pg_get_constraintdef(c.oid) INTO existing_definition FROM pg_constraint c "+
        "WHERE c.conrelid='signup_attributions'::regclass "+
        "AND c.conname='signup_attributions_source_type_check' AND c.contype='c'; "+
        "IF existing_definition IS NOT NULL AND position('guide' IN existing_definition)=0 THEN "+
        "ALTER TABLE signup_attributions DROP CONSTRAINT signup_attributions_source_type_check; "+
        "ALTER TABLE signup_attributions ADD CONSTRAINT signup_attributions_source_type_check "+
        "CHECK (source_type IN ('profile','post','community','event','reel','topic','story','guide')); "+
        "END IF; END $migration$;"
      );
      await db.query('CREATE INDEX IF NOT EXISTS idx_signup_attributions_source_created ON signup_attributions(source_type,created_at DESC)');
    })().catch(error=>{ready=null;throw error;});
  }
  return ready;
}
module.exports={ensureSignupAttributionSchema,TYPES};
