CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,username VARCHAR(30) NOT NULL UNIQUE,display_name VARCHAR(80) NOT NULL,password_hash TEXT NOT NULL,birth_date DATE NOT NULL,bio VARCHAR(500) NOT NULL DEFAULT '',avatar_url TEXT,cover_url TEXT,is_admin BOOLEAN NOT NULL DEFAULT FALSE,age_verified BOOLEAN NOT NULL DEFAULT FALSE,creator_verified BOOLEAN NOT NULL DEFAULT FALSE,show_sensitive BOOLEAN NOT NULL DEFAULT FALSE,status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),terms_accepted_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS follows (follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(follower_id,following_id),CHECK(follower_id<>following_id));
CREATE TABLE IF NOT EXISTS blocks (blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(blocker_id,blocked_id),CHECK(blocker_id<>blocked_id));
CREATE TABLE IF NOT EXISTS posts (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,caption VARCHAR(2200) NOT NULL DEFAULT '',media_url TEXT NOT NULL,media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),content_level TEXT NOT NULL CHECK(content_level IN ('normal','sensitive','nudity')),moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','under_review','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS playback_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_kind TEXT NOT NULL DEFAULT 'post';
DO $$ BEGIN ALTER TABLE posts ADD CONSTRAINT posts_kind_check CHECK(post_kind IN ('post','reel')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC); CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id); CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(post_kind,created_at DESC);
CREATE TABLE IF NOT EXISTS likes (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS comments (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,body VARCHAR(1000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reports (id BIGSERIAL PRIMARY KEY,reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,target_type TEXT NOT NULL CHECK(target_type IN ('post','user','comment','message')),target_id BIGINT NOT NULL,reason TEXT NOT NULL,details VARCHAR(2000) NOT NULL DEFAULT '',priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','critical')),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),moderator_note VARCHAR(2000) NOT NULL DEFAULT '',resolved_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_reports_queue ON reports(status,priority,created_at);
CREATE TABLE IF NOT EXISTS moderation_audit (id BIGSERIAL PRIMARY KEY,admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,action TEXT NOT NULL,note VARCHAR(2000) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS age_verifications (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL DEFAULT 'manual',provider_reference TEXT,result TEXT NOT NULL CHECK(result IN ('pending','verified','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),verified_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS creator_verifications (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL DEFAULT 'manual',provider_reference TEXT,result TEXT NOT NULL CHECK(result IN ('pending','verified','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),verified_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS post_participants (post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,consent_status TEXT NOT NULL DEFAULT 'pending' CHECK(consent_status IN ('pending','approved','revoked','rejected')),requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),responded_at TIMESTAMPTZ,PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS stories (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,media_url TEXT NOT NULL,media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),media_provider TEXT NOT NULL DEFAULT 'local',external_id TEXT,playback_url TEXT,content_level TEXT NOT NULL CHECK(content_level IN ('normal','sensitive','nudity')),moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','under_review','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(expires_at DESC);

-- AURA V0.3: richer profiles, notifications, consent and private messaging
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_label VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS consent_state TEXT NOT NULL DEFAULT 'none';
DO $$ BEGIN
  ALTER TABLE posts ADD CONSTRAINT posts_consent_state_check
    CHECK(consent_state IN ('none','pending','approved','rejected','revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('follow','message','consent_request','consent_approved','consent_rejected','consent_revoked','system')),
  entity_type TEXT,
  entity_id BIGINT,
  text VARCHAR(500) NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id,read_at);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id,conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(4000) NOT NULL DEFAULT '',
  media_url TEXT,
  media_type TEXT CHECK(media_type IS NULL OR media_type IN ('image','video')),
  media_provider TEXT,
  external_id TEXT,
  playback_url TEXT,
  content_level TEXT NOT NULL DEFAULT 'normal' CHECK(content_level IN ('normal','sensitive','nudity')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id,created_at);

CREATE TABLE IF NOT EXISTS sensitive_message_permissions (
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(receiver_id,sender_id),
  CHECK(receiver_id<>sender_id)
);
