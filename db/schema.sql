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

-- RedLibertad base heredada de AURA V0.3: richer profiles, notifications, consent and private messaging
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


-- RedLibertad base heredada de AURA V0.4: interests, discovery and richer social activity
CREATE TABLE IF NOT EXISTS user_interests (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, interest)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest ON user_interests(interest, user_id);

-- Expand notification types to include social interactions.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK(type IN (
    'follow',
    'message',
    'consent_request',
    'consent_approved',
    'consent_rejected',
    'consent_revoked',
    'like',
    'comment',
    'system'
  ));


-- RedLibertad V1.3: guardados
CREATE TABLE IF NOT EXISTS saved_posts (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON saved_posts(user_id,created_at DESC);


-- RedLibertad V1.5: comunidad y viralidad
CREATE TABLE IF NOT EXISTS reposts (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_reposts_post_created ON reposts(post_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reposts_user_created ON reposts(user_id,created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK(type IN (
    'follow',
    'message',
    'consent_request',
    'consent_approved',
    'consent_rejected',
    'consent_revoked',
    'like',
    'comment',
    'mention',
    'repost',
    'system'
  ));


-- RedLibertad V1.8: crecimiento e invitaciones
CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON referrals(inviter_user_id,created_at DESC);


-- RedLibertad V1.9: privacidad y control
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_message_privacy_check
    CHECK(message_privacy IN ('everyone','following','no_one'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mutes (
  muter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(muter_id,muted_id),
  CHECK(muter_id<>muted_id)
);
CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes(muter_id,created_at DESC);


-- RedLibertad V1.10: cuenta y seguridad
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;


-- RedLibertad V1.11: confianza y moderación 2.0
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(500) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS user_moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(40) NOT NULL,
  duration_label VARCHAR(40) NOT NULL DEFAULT '',
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_moderation_actions_user_created
  ON user_moderation_actions(user_id,created_at DESC);


-- RedLibertad V1.12: centro de confianza y verificación
CREATE TABLE IF NOT EXISTS verification_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK(type IN ('age','creator')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','cancelled')),
  request_note VARCHAR(1000) NOT NULL DEFAULT '',
  review_note VARCHAR(1000) NOT NULL DEFAULT '',
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_one_pending
  ON verification_requests(user_id,type)
  WHERE status='pending';

CREATE INDEX IF NOT EXISTS idx_verification_requests_queue
  ON verification_requests(status,type,created_at);

-- RedLibertad V1.13: creator hub y contenido destacado
CREATE TABLE IF NOT EXISTS creator_featured_posts (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  featured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_featured_posts_user
  ON creator_featured_posts(user_id,featured_at DESC);

-- RedLibertad V1.14: perfil público de creador y enlaces
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_headline VARCHAR(120) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS creator_links (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(40) NOT NULL,
  url TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_links_user_position
  ON creator_links(user_id,position,id);

-- RedLibertad V1.15: audiencia de creador y avisos a seguidores
CREATE TABLE IF NOT EXISTS creator_broadcasts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(280) NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_broadcasts_user_created
  ON creator_broadcasts(user_id,created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK(type IN (
    'follow',
    'message',
    'consent_request',
    'consent_approved',
    'consent_rejected',
    'consent_revoked',
    'like',
    'comment',
    'mention',
    'repost',
    'creator_broadcast',
    'system'
  ));

-- RedLibertad V1.17: círculo VIP privado de creador
CREATE TABLE IF NOT EXISTS creator_vips (
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fan_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(creator_id,fan_id),
  CHECK(creator_id<>fan_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_vips_creator_created
  ON creator_vips(creator_id,created_at DESC);

CREATE TABLE IF NOT EXISTS creator_vip_broadcasts (
  id BIGSERIAL PRIMARY KEY,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(280) NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_vip_broadcasts_creator_created
  ON creator_vip_broadcasts(creator_id,created_at DESC);

-- RedLibertad V1.18: contenido exclusivo para círculo VIP
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public';

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audience_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_audience_check
  CHECK(audience IN ('public','vip'));

CREATE INDEX IF NOT EXISTS idx_posts_audience_created
  ON posts(audience,created_at DESC);


-- RedLibertad V1.19: Stories VIP y feed exclusivo
ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public';

ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_audience_check;
ALTER TABLE stories
  ADD CONSTRAINT stories_audience_check
  CHECK(audience IN ('public','vip'));

CREATE INDEX IF NOT EXISTS idx_stories_audience_active
  ON stories(audience,expires_at DESC,created_at DESC);


-- RedLibertad V1.20: borradores y programación de publicaciones
ALTER TABLE posts ADD COLUMN IF NOT EXISTS creator_state TEXT NOT NULL DEFAULT 'live';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_creator_state_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_creator_state_check
  CHECK(creator_state IN ('live','draft','scheduled'));

CREATE INDEX IF NOT EXISTS idx_posts_creator_state_schedule
  ON posts(creator_state,scheduled_for,user_id);


-- RedLibertad V1.21: calendario editorial privado
ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_date DATE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS editorial_label VARCHAR(40) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_posts_creator_editorial_date
  ON posts(user_id,editorial_date);


-- RedLibertad V1.22: herramientas de comunidad del creador
CREATE TABLE IF NOT EXISTS creator_polls (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question VARCHAR(300) NOT NULL,
  allow_change BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_poll_options (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES creator_polls(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  label VARCHAR(120) NOT NULL,
  UNIQUE(poll_id,position)
);
CREATE INDEX IF NOT EXISTS idx_creator_poll_options_poll
  ON creator_poll_options(poll_id,position);

CREATE TABLE IF NOT EXISTS creator_poll_votes (
  poll_id BIGINT NOT NULL REFERENCES creator_polls(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES creator_poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(poll_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_poll_votes_option
  ON creator_poll_votes(option_id);

CREATE TABLE IF NOT EXISTS creator_questions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  prompt VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_question_responses (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES creator_questions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_question_responses_question_created
  ON creator_question_responses(question_id,created_at DESC);


-- RedLibertad V1.23: gestión avanzada de comunidad
ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE creator_polls ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE creator_polls DROP CONSTRAINT IF EXISTS creator_polls_status_check;
ALTER TABLE creator_polls
  ADD CONSTRAINT creator_polls_status_check
  CHECK(status IN ('active','archived'));

ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE creator_questions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE creator_questions DROP CONSTRAINT IF EXISTS creator_questions_status_check;
ALTER TABLE creator_questions
  ADD CONSTRAINT creator_questions_status_check
  CHECK(status IN ('active','archived'));

ALTER TABLE creator_question_responses ADD COLUMN IF NOT EXISTS creator_starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE creator_question_responses ADD COLUMN IF NOT EXISTS starred_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_creator_polls_status
  ON creator_polls(post_id,status,is_open);
CREATE INDEX IF NOT EXISTS idx_creator_questions_status
  ON creator_questions(post_id,status,is_open);
CREATE INDEX IF NOT EXISTS idx_creator_question_responses_starred
  ON creator_question_responses(question_id,creator_starred,updated_at DESC);


ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK(type IN (
    'follow',
    'message',
    'consent_request',
    'consent_approved',
    'consent_rejected',
    'consent_revoked',
    'like',
    'comment',
    'mention',
    'repost',
    'creator_broadcast',
    'creator_vip_broadcast',
    'creator_poll_vote',
    'creator_question_response',
    'system'
  ));

-- RedLibertad V1.24: insights y notificaciones de comunidad
CREATE INDEX IF NOT EXISTS idx_creator_poll_votes_created
  ON creator_poll_votes(created_at DESC,poll_id);
CREATE INDEX IF NOT EXISTS idx_creator_question_responses_created
  ON creator_question_responses(created_at DESC,question_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_creator_community_once
  ON notifications(user_id,actor_id,type,entity_type,entity_id)
  WHERE type IN ('creator_poll_vote','creator_question_response');


-- RedLibertad V1.25: centro de actividad de comunidad
CREATE TABLE IF NOT EXISTS creator_community_notification_reviews (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_community_reviews_creator
  ON creator_community_notification_reviews(creator_id,reviewed_at DESC);


-- RedLibertad V1.26: seguimiento y notas privadas de actividad
CREATE TABLE IF NOT EXISTS creator_community_activity_meta (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority TEXT NOT NULL DEFAULT 'normal',
  private_note VARCHAR(1000) NOT NULL DEFAULT '',
  follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE creator_community_activity_meta DROP CONSTRAINT IF EXISTS creator_community_activity_priority_check;
ALTER TABLE creator_community_activity_meta
  ADD CONSTRAINT creator_community_activity_priority_check
  CHECK(priority IN ('normal','high'));

CREATE INDEX IF NOT EXISTS idx_creator_community_activity_meta_creator
  ON creator_community_activity_meta(creator_id,follow_up,priority,updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_community_activity_follow_up_at
  ON creator_community_activity_meta(creator_id,follow_up,follow_up_at,priority);

CREATE INDEX IF NOT EXISTS idx_creator_community_activity_completed_at
  ON creator_community_activity_meta(creator_id,completed_at DESC)
  WHERE completed_at IS NOT NULL;



