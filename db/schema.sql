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
CREATE INDEX IF NOT EXISTS idx_likes_post_created ON likes(post_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following_follower ON follows(following_id,follower_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_blocker ON blocks(blocked_id,blocker_id);
CREATE INDEX IF NOT EXISTS idx_posts_published_created ON posts(created_at DESC) WHERE moderation_status='published';
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_post_parent_created ON comments(post_id,parent_comment_id,created_at,id);
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

-- RedLibertad V1.50: chats de grupo
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title VARCHAR(120);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_type_check
  CHECK(conversation_type IN ('direct','group'));
CREATE INDEX IF NOT EXISTS idx_conversations_type_updated
  ON conversations(conversation_type,updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id,conversation_id);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS member_role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE conversation_members DROP CONSTRAINT IF EXISTS conversation_members_role_check;
ALTER TABLE conversation_members
  ADD CONSTRAINT conversation_members_role_check
  CHECK(member_role IN ('owner','admin','member'));


-- RedLibertad V1.36: organización privada de conversaciones
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS notifications_muted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_conversation_members_inbox
  ON conversation_members(user_id,is_archived,is_pinned,conversation_id);

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

-- RedLibertad V1.47: respuestas y reacciones en mensajes
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id);

-- RedLibertad V1.51: compartir publicaciones dentro del chat
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_post_ref_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_messages_shared_post ON messages(shared_post_id);
CREATE INDEX IF NOT EXISTS idx_messages_shared_post_ref ON messages(shared_post_ref_id);
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_story_id BIGINT REFERENCES stories(id) ON DELETE SET NULL;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_story_ref_id BIGINT;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_profile_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS shared_profile_ref_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_messages_shared_story ON messages(shared_story_id);
CREATE INDEX IF NOT EXISTS idx_messages_shared_profile ON messages(shared_profile_id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN ('heart','like','laugh','fire','wow','sad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS sensitive_message_permissions (
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(receiver_id,sender_id),
  CHECK(receiver_id<>sender_id)
);


-- RedLibertad V1.52: círculos privados de conexiones
CREATE TABLE IF NOT EXISTS connection_circles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  is_favorites BOOLEAN NOT NULL DEFAULT FALSE,
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_circles_favorites
  ON connection_circles(user_id)
  WHERE is_favorites=true;
CREATE INDEX IF NOT EXISTS idx_connection_circles_user_position
  ON connection_circles(user_id,position,id);

-- RedLibertad V1.57: conexiones cercanas como círculo privado fijo
ALTER TABLE connection_circles ADD COLUMN IF NOT EXISTS is_close BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_circles_close
  ON connection_circles(user_id)
  WHERE is_close=true;

CREATE TABLE IF NOT EXISTS connection_circle_members (
  circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
  connection_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(circle_id,connection_user_id)
);
CREATE INDEX IF NOT EXISTS idx_connection_circle_members_user
  ON connection_circle_members(connection_user_id,circle_id);

-- RedLibertad V1.58: comunidades sociales
CREATE TABLE IF NOT EXISTS communities (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  avatar_url TEXT,
  privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','private')),
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communities_owner_updated
  ON communities(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_privacy_updated
  ON communities(privacy,updated_at DESC);

CREATE TABLE IF NOT EXISTS community_members (
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(community_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_members_user
  ON community_members(user_id,joined_at DESC);

ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE community_members
  ADD CONSTRAINT community_members_role_check
  CHECK(role IN ('owner','admin','moderator','member'));

CREATE TABLE IF NOT EXISTS community_join_requests (
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(community_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_join_requests_pending
  ON community_join_requests(community_id,status,requested_at DESC);

CREATE TABLE IF NOT EXISTS community_rules (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0,
  body VARCHAR(300) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_rules_community
  ON community_rules(community_id,position,id);

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(2200) NOT NULL DEFAULT '',
  media_url TEXT,
  media_type TEXT CHECK(media_type IS NULL OR media_type IN ('image','video')),
  media_provider TEXT,
  external_id TEXT,
  playback_url TEXT,
  content_level TEXT NOT NULL DEFAULT 'normal' CHECK(content_level IN ('normal','sensitive','nudity')),
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK(moderation_status IN ('published','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(btrim(body)<>'' OR media_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_community_posts_community_created
  ON community_posts(community_id,created_at DESC);
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS shared_post_ref_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_community_posts_shared_post
  ON community_posts(shared_post_id);

CREATE TABLE IF NOT EXISTS community_comments (
  id BIGSERIAL PRIMARY KEY,
  community_post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post_created
  ON community_comments(community_post_id,created_at,id);

CREATE TABLE IF NOT EXISTS community_moderation_log (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id BIGINT,
  note VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_moderation_log_community
  ON community_moderation_log(community_id,created_at DESC);


-- RedLibertad V1.63: Community Moderation 3.0
CREATE TABLE IF NOT EXISTS community_reports (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment','member')),
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','threats','rules','sensitive','other')),
  details VARCHAR(1000) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_reports_queue
  ON community_reports(community_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_reports_open_target
  ON community_reports(community_id,reporter_id,target_type,target_id)
  WHERE status='open';

CREATE TABLE IF NOT EXISTS community_member_sanctions (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('warning','mute','suspend')),
  note VARCHAR(500) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_member_sanctions_active
  ON community_member_sanctions(community_id,user_id,action,expires_at,revoked_at);


-- RedLibertad V1.65: Relationship Intelligence
CREATE TABLE IF NOT EXISTS relationship_hidden_suggestions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,target_user_id),
  CHECK(user_id<>target_user_id)
);
CREATE INDEX IF NOT EXISTS idx_relationship_hidden_suggestions_user
  ON relationship_hidden_suggestions(user_id,hidden_at DESC);


-- RedLibertad V1.59: descubrimiento explicable de comunidades
ALTER TABLE communities ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_communities_category_updated
  ON communities(category,updated_at DESC);

CREATE TABLE IF NOT EXISTS community_interests (
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  interest VARCHAR(80) NOT NULL,
  PRIMARY KEY(community_id,interest)
);
CREATE INDEX IF NOT EXISTS idx_community_interests_interest
  ON community_interests(interest,community_id);

CREATE TABLE IF NOT EXISTS community_hidden_suggestions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,community_id)
);
CREATE INDEX IF NOT EXISTS idx_community_hidden_suggestions_user
  ON community_hidden_suggestions(user_id,hidden_at DESC);


-- RedLibertad V1.60: eventos y encuentros
CREATE TABLE IF NOT EXISTS social_events (
  id BIGSERIAL PRIMARY KEY,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'in_person' CHECK(event_type IN ('in_person','online')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location_label VARCHAR(240),
  online_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','connections','circles','community')),
  attendee_visibility TEXT NOT NULL DEFAULT 'responders' CHECK(attendee_visibility IN ('public','responders','private')),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS idx_social_events_start
  ON social_events(cancelled_at,starts_at);
CREATE INDEX IF NOT EXISTS idx_social_events_creator
  ON social_events(creator_id,starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_events_community
  ON social_events(community_id,starts_at);

CREATE TABLE IF NOT EXISTS event_circle_audiences (
  event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
  circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id,circle_id)
);
CREATE INDEX IF NOT EXISTS idx_event_circle_audiences_circle
  ON event_circle_audiences(circle_id,event_id);

CREATE TABLE IF NOT EXISTS event_responses (
  event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('interested','going')),
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_responses_user
  ON event_responses(user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS event_reminders (
  event_id BIGINT NOT NULL REFERENCES social_events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_reminders_due
  ON event_reminders(sent_at,remind_at);

-- RedLibertad V1.61: publicaciones colaborativas
CREATE TABLE IF NOT EXISTS post_collaborators (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_collaborators_user_status
  ON post_collaborators(user_id,status,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_collaborators_post_status
  ON post_collaborators(post_id,status,requested_at);


-- RedLibertad V1.62: menciones avanzadas e historial privado de compartidos
CREATE TABLE IF NOT EXISTS post_circle_mentions (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,circle_id)
);
CREATE INDEX IF NOT EXISTS idx_post_circle_mentions_circle
  ON post_circle_mentions(circle_id,post_id);

CREATE TABLE IF NOT EXISTS social_share_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('post','reel','story','profile')),
  entity_id BIGINT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('conversation','community','external','copy')),
  target_id BIGINT,
  target_label VARCHAR(160) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_share_history_user_created
  ON social_share_history(user_id,created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK(type IN (
    'follow','message','consent_request','consent_approved','consent_rejected','consent_revoked',
    'like','comment','mention','repost','creator_broadcast','creator_vip_broadcast',
    'creator_poll_vote','creator_question_response','event_reminder',
    'collaboration_request','collaboration_approved','collaboration_rejected','collaboration_revoked',
    'circle_mention','system'
  ));

-- RedLibertad V1.48: notificaciones Web Push opcionales
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id,enabled);

CREATE TABLE IF NOT EXISTS push_jobs (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','expired')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_jobs_queue
  ON push_jobs(status,next_attempt_at,created_at);

CREATE OR REPLACE FUNCTION redlibertad_enqueue_push_notification()
RETURNS TRIGGER AS '
BEGIN
  INSERT INTO push_jobs(notification_id,user_id)
  VALUES (NEW.id,NEW.user_id)
  ON CONFLICT(notification_id) DO NOTHING;
  RETURN NEW;
END;
' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_redlibertad_push_notification ON notifications;
CREATE TRIGGER trg_redlibertad_push_notification
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION redlibertad_enqueue_push_notification();

-- RedLibertad V1.46: presencia privada de chat
CREATE TABLE IF NOT EXISTS user_chat_presence (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_conversation_id BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  typing_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_chat_presence_active
  ON user_chat_presence(active_conversation_id,typing_until);

-- RedLibertad V1.40: estado privado de retorno
CREATE TABLE IF NOT EXISTS user_experience_state (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_home_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RedLibertad V1.39: vistas de Stories y Reels
CREATE TABLE IF NOT EXISTS story_views (
  story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(story_id,viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id,viewed_at DESC);

CREATE TABLE IF NOT EXISTS reel_views (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_reel_views_post ON reel_views(post_id,viewed_at DESC);

-- RedLibertad V1.38: identidad breve de perfil
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_status VARCHAR(80) NOT NULL DEFAULT '';

-- RedLibertad base heredada de AURA V0.4: interests, discovery and richer social activity
CREATE TABLE IF NOT EXISTS user_interests (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, interest)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest ON user_interests(interest, user_id);

-- RedLibertad V1.37: feedback privado de descubrimiento
CREATE TABLE IF NOT EXISTS discovery_hidden_items (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,item_type,item_id),
  CONSTRAINT discovery_hidden_items_type_check CHECK(item_type IN ('post','user'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_hidden_items_user
  ON discovery_hidden_items(user_id,item_type,created_at DESC);

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

-- RedLibertad V1.66: Growth & Onboarding 2.0
CREATE TABLE IF NOT EXISTS growth_invite_links (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  open_count INTEGER NOT NULL DEFAULT 0,
  join_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_invite_links_active_user
  ON growth_invite_links(user_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_growth_invite_links_token_active
  ON growth_invite_links(token) WHERE disabled_at IS NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invite_link_id BIGINT REFERENCES growth_invite_links(id) ON DELETE SET NULL;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS attribution TEXT NOT NULL DEFAULT 'legacy_username';


-- RedLibertad V1.9: privacidad y control
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_privacy TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mention_privacy TEXT NOT NULL DEFAULT 'everyone';

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_message_privacy_check
    CHECK(message_privacy IN ('everyone','following','no_one'));
EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_mention_privacy_check
    CHECK(mention_privacy IN ('everyone','connections','no_one'));
EXCEPTION WHEN duplicate_object THEN NULL; END $;

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
  CHECK(audience IN ('public','vip','connections','circles'));

CREATE INDEX IF NOT EXISTS idx_posts_audience_created
  ON posts(audience,created_at DESC);

-- RedLibertad V1.56: audiencias privadas por círculos
CREATE TABLE IF NOT EXISTS post_circle_audiences (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id,circle_id)
);
CREATE INDEX IF NOT EXISTS idx_post_circle_audiences_circle
  ON post_circle_audiences(circle_id,post_id);


-- RedLibertad V1.19: Stories VIP y feed exclusivo
ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public';

ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_audience_check;
ALTER TABLE stories
  ADD CONSTRAINT stories_audience_check
  CHECK(audience IN ('public','vip','connections','circles'));

CREATE INDEX IF NOT EXISTS idx_stories_audience_active
  ON stories(audience,expires_at DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS story_circle_audiences (
  story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  circle_id BIGINT NOT NULL REFERENCES connection_circles(id) ON DELETE CASCADE,
  PRIMARY KEY(story_id,circle_id)
);
CREATE INDEX IF NOT EXISTS idx_story_circle_audiences_circle
  ON story_circle_audiences(circle_id,story_id);


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
    'event_reminder',
    'collaboration_request',
    'collaboration_approved',
    'collaboration_rejected',
    'collaboration_revoked',
    'circle_mention',
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





-- RedLibertad V1.29: tareas y recordatorios privados del creador
CREATE TABLE IF NOT EXISTS creator_tasks (
  id BIGSERIAL PRIMARY KEY,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  notification_id BIGINT REFERENCES notifications(id) ON DELETE SET NULL,
  related_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
  source_key VARCHAR(180),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT creator_tasks_priority_check CHECK(priority IN ('normal','high')),
  CONSTRAINT creator_tasks_status_check CHECK(status IN ('open','completed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_tasks_source_key
  ON creator_tasks(creator_id,source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_tasks_open_due
  ON creator_tasks(creator_id,status,priority,due_at,updated_at DESC);


-- RedLibertad V1.30: CRM privado del creador
CREATE TABLE IF NOT EXISTS creator_contact_meta (
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  private_note VARCHAR(1000) NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(creator_id,contact_id),
  CHECK(creator_id<>contact_id),
  CONSTRAINT creator_contact_meta_priority_check CHECK(priority IN ('normal','high'))
);
CREATE INDEX IF NOT EXISTS idx_creator_contact_meta_creator_priority
  ON creator_contact_meta(creator_id,priority,updated_at DESC);


-- RedLibertad V1.31: segmentos privados de audiencia
CREATE TABLE IF NOT EXISTS creator_segments (
  id BIGSERIAL PRIMARY KEY,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_segment_members (
  segment_id BIGINT NOT NULL REFERENCES creator_segments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(segment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_segments_creator ON creator_segments(creator_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_segment_members_segment ON creator_segment_members(segment_id,created_at DESC);


-- RedLibertad V1.32: centro de comunicaciones del creador
CREATE TABLE IF NOT EXISTS creator_communications (
  id BIGSERIAL PRIMARY KEY,
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(280) NOT NULL,
  audience_type TEXT NOT NULL DEFAULT 'all',
  segment_id BIGINT REFERENCES creator_segments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT creator_communications_audience_check CHECK(audience_type IN ('all','vip','segment','recent_followers','active_30d','inactive_30d','high_priority')),
  CONSTRAINT creator_communications_status_check CHECK(status IN ('draft','scheduled','sending','sent','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_creator_communications_creator_status
  ON creator_communications(creator_id,status,scheduled_for,updated_at DESC);


-- RedLibertad V1.34: automatizaciones privadas del creador
CREATE TABLE IF NOT EXISTS creator_automation_rules (
  creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  threshold INTEGER NOT NULL DEFAULT 3,
  last_run_at TIMESTAMPTZ,
  last_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(creator_id,rule_key),
  CONSTRAINT creator_automation_rule_key_check CHECK(rule_key IN ('overdue_task_priority','repeat_participant_task','overdue_followup_task','high_priority_contact_task'))
);
CREATE INDEX IF NOT EXISTS idx_creator_automation_enabled
  ON creator_automation_rules(enabled,creator_id,updated_at DESC);


-- RedLibertad V1.71: beta launch & real user operations
CREATE TABLE IF NOT EXISTS operational_incidents (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','monitoring','resolved')),
  note VARCHAR(2000) NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_status_created
  ON operational_incidents(status,severity,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created_beta
  ON posts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_created_beta
  ON comments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_created_beta
  ON follows(follower_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created_beta
  ON messages(sender_id,created_at DESC);


-- RedLibertad V1.72: beta feedback & support center
CREATE TABLE IF NOT EXISTS beta_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('bug','suggestion','question')),
  subject VARCHAR(160) NOT NULL,
  message VARCHAR(4000) NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','resolved')),
  admin_note VARCHAR(2000) NOT NULL DEFAULT '',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id VARCHAR(100),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_created
  ON beta_feedback(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_created
  ON beta_feedback(status,type,created_at DESC);


-- RedLibertad V1.73: beta cohorts & release control
CREATE TABLE IF NOT EXISTS beta_cohorts (
  id BIGSERIAL PRIMARY KEY,
  cohort_key VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beta_cohort_members (
  cohort_id BIGINT NOT NULL REFERENCES beta_cohorts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(cohort_id,user_id)
);
CREATE TABLE IF NOT EXISTS release_features (
  feature_key VARCHAR(60) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS release_feature_cohorts (
  feature_key VARCHAR(60) NOT NULL REFERENCES release_features(feature_key) ON DELETE CASCADE,
  cohort_id BIGINT NOT NULL REFERENCES beta_cohorts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(feature_key,cohort_id)
);
CREATE INDEX IF NOT EXISTS idx_beta_cohort_members_user
  ON beta_cohort_members(user_id,cohort_id);
CREATE INDEX IF NOT EXISTS idx_release_feature_cohorts_cohort
  ON release_feature_cohorts(cohort_id,feature_key);
INSERT INTO release_features(feature_key,name,description,enabled,default_enabled)
VALUES('support_center','Centro de soporte beta','Ayuda y feedback dentro de la aplicación.',TRUE,TRUE)
ON CONFLICT(feature_key) DO NOTHING;


-- RedLibertad V1.74: release audit & safe rollback
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
);
CREATE INDEX IF NOT EXISTS idx_release_change_audit_created
  ON release_change_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_change_audit_target
  ON release_change_audit(target_type,target_key,created_at DESC);


-- RedLibertad V1.75: controlled rollout waves & beta graduation
ALTER TABLE release_features
  ADD COLUMN IF NOT EXISTS rollout_stage TEXT NOT NULL DEFAULT 'cohorts';
ALTER TABLE release_features
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE release_features
  ADD COLUMN IF NOT EXISTS rollout_frozen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE release_features
  ADD COLUMN IF NOT EXISTS rollout_note VARCHAR(500) NOT NULL DEFAULT '';
UPDATE release_features
   SET rollout_stage='graduated',
       rollout_percentage=100
 WHERE default_enabled=TRUE
   AND rollout_stage='cohorts'
   AND rollout_percentage=0;


-- RedLibertad V1.77: public profiles & profile SEO
CREATE INDEX IF NOT EXISTS idx_users_public_profile_seo
  ON users(discoverable,updated_at DESC)
  WHERE status='active' AND is_admin=false;
