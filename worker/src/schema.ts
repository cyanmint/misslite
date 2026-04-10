/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, name TEXT, description TEXT DEFAULT '',
  avatar_url TEXT, banner_url TEXT, email TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_moderator INTEGER NOT NULL DEFAULT 0, is_suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id),
  used_by TEXT REFERENCES users(id), used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT, cw TEXT, visibility TEXT NOT NULL DEFAULT 'public',
  reply_id TEXT, renote_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id),
  user_id TEXT NOT NULL REFERENCES users(id), reaction TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(note_id, user_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, note_id)
);
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL,
  image_url TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS moderation_logs (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, target_id TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, notifier_id TEXT, note_id TEXT, reaction TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_note ON reactions(note_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE TABLE IF NOT EXISTS registry_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  domain TEXT,
  scope TEXT NOT NULL DEFAULT '[]',
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT 'null',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, domain, scope, key)
);
CREATE INDEX IF NOT EXISTS idx_registry_user_scope ON registry_items(user_id, domain, scope);

-- Following
CREATE TABLE IF NOT EXISTS following (
  id TEXT PRIMARY KEY, follower_id TEXT NOT NULL REFERENCES users(id),
  followee_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_following_follower ON following(follower_id);
CREATE INDEX IF NOT EXISTS idx_following_followee ON following(followee_id);

-- Blocking
CREATE TABLE IF NOT EXISTS blocking (
  id TEXT PRIMARY KEY, blocker_id TEXT NOT NULL REFERENCES users(id),
  blockee_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(blocker_id, blockee_id)
);

-- Muting
CREATE TABLE IF NOT EXISTS muting (
  id TEXT PRIMARY KEY, muter_id TEXT NOT NULL REFERENCES users(id),
  mutee_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(muter_id, mutee_id)
);

-- Renote muting
CREATE TABLE IF NOT EXISTS renote_muting (
  id TEXT PRIMARY KEY, muter_id TEXT NOT NULL REFERENCES users(id),
  mutee_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(muter_id, mutee_id)
);

-- User Lists
CREATE TABLE IF NOT EXISTS user_lists (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS user_list_members (
  id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES user_lists(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(list_id, user_id)
);

-- Clips
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS clip_notes (
  id TEXT PRIMARY KEY, clip_id TEXT NOT NULL REFERENCES clips(id),
  note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(clip_id, note_id)
);
CREATE TABLE IF NOT EXISTS clip_favorites (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  clip_id TEXT NOT NULL REFERENCES clips(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, clip_id)
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, description TEXT, color TEXT DEFAULT '#000000',
  banner_url TEXT, is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS channel_following (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, channel_id)
);
CREATE TABLE IF NOT EXISTS channel_favorites (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, channel_id)
);

-- Antennas
CREATE TABLE IF NOT EXISTS antennas (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, src TEXT NOT NULL DEFAULT 'all',
  keywords TEXT NOT NULL DEFAULT '[]', exclude_keywords TEXT NOT NULL DEFAULT '[]',
  users_list_id TEXT, case_sensitive INTEGER NOT NULL DEFAULT 0,
  local_only INTEGER NOT NULL DEFAULT 0, exclude_bots INTEGER NOT NULL DEFAULT 0,
  with_replies INTEGER NOT NULL DEFAULT 0, with_file INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
  color TEXT, icon_url TEXT, target TEXT NOT NULL DEFAULT 'manual',
  cond_formula TEXT, is_public INTEGER NOT NULL DEFAULT 0,
  is_moderator INTEGER NOT NULL DEFAULT 0, is_administrator INTEGER NOT NULL DEFAULT 0,
  is_explorable INTEGER NOT NULL DEFAULT 0, as_badge INTEGER NOT NULL DEFAULT 0,
  can_edit_members_by_moderator INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  policies TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS role_assignments (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(role_id, user_id)
);

-- Abuse reports
CREATE TABLE IF NOT EXISTS abuse_reports (
  id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL DEFAULT '', resolved INTEGER NOT NULL DEFAULT 0,
  forwarded INTEGER NOT NULL DEFAULT 0,
  assigned_moderator_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Pinned notes
CREATE TABLE IF NOT EXISTS pinned_notes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  note_id TEXT NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, note_id)
);

-- Announcement read status
CREATE TABLE IF NOT EXISTS announcement_reads (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, announcement_id)
);

-- User memos
CREATE TABLE IF NOT EXISTS user_memos (
  user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  memo TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(user_id, target_user_id)
);

-- Thread muting
CREATE TABLE IF NOT EXISTS thread_muting (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  thread_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, thread_id)
);

-- Service worker subscriptions
CREATE TABLE IF NOT EXISTS sw_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL, auth TEXT, publickey TEXT,
  send_read_message INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Pages
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, title TEXT NOT NULL, summary TEXT,
  content TEXT NOT NULL DEFAULT '[]', variables TEXT NOT NULL DEFAULT '[]',
  script TEXT NOT NULL DEFAULT '', font TEXT NOT NULL DEFAULT '',
  align_center INTEGER NOT NULL DEFAULT 0,
  hide_title_when_pinned INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  eye_catching_image_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS page_likes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, page_id)
);

-- Flash (Play)
CREATE TABLE IF NOT EXISTS flash (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  liked_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS flash_likes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  flash_id TEXT NOT NULL REFERENCES flash(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, flash_id)
);

-- Gallery
CREATE TABLE IF NOT EXISTS gallery_posts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  liked_count INTEGER NOT NULL DEFAULT 0,
  file_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS gallery_likes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES gallery_posts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(user_id, post_id)
);

-- Bubble Game
CREATE TABLE IF NOT EXISTS bubble_game_scores (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL, lang TEXT NOT NULL DEFAULT 'en-US',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bubble_game_scores ON bubble_game_scores(score DESC);
`;

export async function ensureSchema(db: D1Database): Promise<void> {
	const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
	for (const sql of statements) {
		await db.prepare(sql).run();
	}
}
