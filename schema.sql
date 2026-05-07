-- SPDX-License-Identifier: AGPL-3.0-only
-- MissLite CF Worker D1 Schema

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT,
  description TEXT DEFAULT '',
  avatar_url TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  is_cat INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_moderator INTEGER NOT NULL DEFAULT 0,
  is_suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  used_by TEXT REFERENCES users(id),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT,
  cw TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  reply_id TEXT REFERENCES notes(id),
  renote_id TEXT REFERENCES notes(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS note_visible_users (
  note_id TEXT NOT NULL REFERENCES notes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY(note_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_note_visible_users_user ON note_visible_users(user_id, note_id);
CREATE TABLE IF NOT EXISTS note_polls (
  note_id TEXT PRIMARY KEY REFERENCES notes(id),
  multiple INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS note_poll_choices (
  note_id TEXT NOT NULL REFERENCES notes(id),
  choice_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  votes_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(note_id, choice_index)
);
CREATE TABLE IF NOT EXISTS note_poll_votes (
  note_id TEXT NOT NULL REFERENCES notes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  choice_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY(note_id, user_id, choice_index)
);
CREATE INDEX IF NOT EXISTS idx_note_poll_votes_note ON note_poll_votes(note_id, user_id);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reaction TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_note ON reactions(note_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
