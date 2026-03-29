/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * MissLite CF Worker — minimal Misskey-compatible backend
 * running on Cloudflare Workers with D1 as the database.
 */

export interface Env {
	DB: D1Database;
	INITIAL_PASSWORD: string;
}

// ---- helpers ----

function generateId(): string {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	let id = '';
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	for (const b of arr) id += chars[b % chars.length];
	return id;
}

async function hashPassword(pw: string): Promise<string> {
	const data = new TextEncoder().encode(pw);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function cors(headers?: HeadersInit): Headers {
	const h = new Headers(headers);
	h.set('Access-Control-Allow-Origin', '*');
	h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	return h;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: cors({ 'Content-Type': 'application/json' }),
	});
}

function err(message: string, status = 400): Response {
	return json({ error: { message, code: status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST' } }, status);
}

// ---- user packing ----

interface DbUser {
	id: string;
	username: string;
	password_hash: string;
	name: string | null;
	description: string;
	avatar_url: string | null;
	is_admin: number;
	is_moderator: number;
	is_suspended: number;
	created_at: string;
}

function packUser(u: DbUser, detail = false): Record<string, unknown> {
	const packed: Record<string, unknown> = {
		id: u.id,
		name: u.name || u.username,
		username: u.username,
		host: null,
		avatarUrl: u.avatar_url,
		isBot: false,
		isCat: false,
		onlineStatus: 'unknown',
		isAdmin: !!u.is_admin,
		isModerator: !!u.is_moderator,
		isSuspended: !!u.is_suspended,
		createdAt: u.created_at,
	};
	if (detail) {
		packed.description = u.description;
		packed.followersCount = 0;
		packed.followingCount = 0;
		packed.notesCount = 0;
		packed.avatarBlurhash = null;
		packed.bannerUrl = null;
		packed.bannerBlurhash = null;
		packed.fields = [];
		packed.pinnedNotes = [];
		packed.pinnedNoteIds = [];
	}
	return packed;
}

// ---- note packing ----

interface DbNote {
	id: string;
	user_id: string;
	text: string | null;
	cw: string | null;
	visibility: string;
	reply_id: string | null;
	renote_id: string | null;
	created_at: string;
}

async function packNote(db: D1Database, n: DbNote): Promise<Record<string, unknown>> {
	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(n.user_id).first<DbUser>();
	const reactions = await db.prepare('SELECT reaction, COUNT(*) as count FROM reactions WHERE note_id = ? GROUP BY reaction').bind(n.id).all();
	const reactionMap: Record<string, number> = {};
	for (const r of reactions.results ?? []) {
		reactionMap[r.reaction as string] = r.count as number;
	}
	return {
		id: n.id,
		createdAt: n.created_at,
		text: n.text,
		cw: n.cw,
		userId: n.user_id,
		user: user ? packUser(user) : null,
		visibility: n.visibility,
		replyId: n.reply_id,
		renoteId: n.renote_id,
		reactions: reactionMap,
		repliesCount: 0,
		renoteCount: 0,
		emojis: {},
		fileIds: [],
		files: [],
		localOnly: false,
	};
}

// ---- auth helper ----

async function getUser(db: D1Database, body: Record<string, unknown>): Promise<DbUser | null> {
	const token = (body.i ?? body.token ?? '') as string;
	if (!token) return null;
	const session = await db.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first<{ user_id: string }>();
	if (!session) return null;
	return db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<DbUser>();
}

async function requireUser(db: D1Database, body: Record<string, unknown>): Promise<DbUser | Response> {
	const u = await getUser(db, body);
	if (!u) return err('Authentication required', 401);
	if (u.is_suspended) return err('Account is suspended', 403);
	return u;
}

// ---- database init ----

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, name TEXT, description TEXT DEFAULT '',
  avatar_url TEXT, is_admin INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_note ON reactions(note_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

async function ensureSchema(db: D1Database): Promise<void> {
	const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
	for (const sql of statements) {
		await db.prepare(sql).run();
	}
}

// ---- API routes ----

type Handler = (db: D1Database, body: Record<string, unknown>, env: Env) => Promise<Response>;

const routes: Record<string, Handler> = {};

// -- meta --
routes['meta'] = async (db) => {
	await ensureSchema(db);
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>();
	const name = await db.prepare("SELECT value FROM meta WHERE key = 'name'").first<{ value: string }>();
	const desc = await db.prepare("SELECT value FROM meta WHERE key = 'description'").first<{ value: string }>();
	return json({
		maintainerName: 'admin',
		maintainerEmail: '',
		version: '2026.3.0',
		name: name?.value ?? 'MissLite',
		shortName: null,
		uri: 'https://misslite.example',
		description: desc?.value ?? 'A MissLite instance',
		langs: ['en-US'],
		disableRegistration: true,
		emailRequiredForSignup: false,
		enableHcaptcha: false,
		enableRecaptcha: false,
		enableTurnstile: false,
		maxNoteTextLength: 3000,
		enableEmail: false,
		enableServiceWorker: false,
		proxyAccountName: null,
		themeColor: '#86b300',
		mascotImageUrl: null,
		bannerUrl: null,
		backgroundImageUrl: null,
		logoImageUrl: null,
		iconUrl: null,
		features: {},
		requireSetup: !initialized,
		policies: {
			ltlAvailable: true,
			canPublicNote: true,
			canCreateContent: true,
			canInvite: true,
		},
		ads: [],
		notesCount: 0,
		usersCount: 0,
		federation: 'none',
		cacheRemoteFiles: false,
		cacheRemoteSensitiveFiles: false,
		mediaProxy: '',
	});
};

// -- admin/accounts/create (initial setup) --
routes['admin/accounts/create'] = async (db, body, env) => {
	await ensureSchema(db);
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first();
	if (initialized) return err('Already initialized', 403);

	const password = (body.password ?? '') as string;
	if (password !== env.INITIAL_PASSWORD) return err('Initial password is incorrect', 403);

	const username = (body.username ?? '') as string;
	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');

	const id = generateId();
	const pwHash = await hashPassword(password);
	await db.prepare('INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, 1)')
		.bind(id, username, pwHash).run();
	await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('initialized', 'true')").run();

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, id).run();

	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	return json({ ...packUser(user!, true), token });
};

// -- signin --
routes['signin'] = async (db, body) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? '') as string;
	if (!username || !password) return err('Missing credentials');

	const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	if (!user) return err('No such user', 401);
	if (user.is_suspended) return err('Account is suspended', 403);

	const pwHash = await hashPassword(password);
	if (user.password_hash !== pwHash) return err('Incorrect password', 401);

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();
	return json({ id: user.id, i: token });
};

// -- signout (just invalidate token) --
routes['i'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(packUser(u, true));
};

// -- i/update --
routes['i/update'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
	if (typeof body.description === 'string') { sets.push('description = ?'); vals.push(body.description); }
	if (typeof body.avatarUrl === 'string') { sets.push('avatar_url = ?'); vals.push(body.avatarUrl); }

	if (sets.length > 0) {
		vals.push(u.id);
		await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}

	const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<DbUser>();
	return json(packUser(updated!, true));
};

// -- users/show --
routes['users/show'] = async (db, body) => {
	const userId = body.userId as string | undefined;
	const username = body.username as string | undefined;
	let user: DbUser | null = null;
	if (userId) {
		user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
	} else if (username) {
		user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	}
	if (!user) return err('No such user', 404);
	return json(packUser(user, true));
};

// -- invite/create --
routes['invite/create'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const code = generateId();
	await db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').bind(code, u.id).run();
	return json({ code });
};

// -- invite/list --
routes['invite/list'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const codes = await db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();
	return json(codes.results ?? []);
};

// -- signup (with invite code) --
routes['signup'] = async (db, body) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? '') as string;
	const inviteCode = (body.invitationCode ?? body.inviteCode ?? '') as string;

	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');
	if (!password) return err('Password required');
	if (!inviteCode) return err('Invite code required');

	const invite = await db.prepare('SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL').bind(inviteCode).first();
	if (!invite) return err('Invalid or used invite code');

	const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
	if (existing) return err('Username already taken');

	const id = generateId();
	const pwHash = await hashPassword(password);
	await db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
		.bind(id, username, pwHash).run();
	await db.prepare('UPDATE invite_codes SET used_by = ?, used_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE code = ?')
		.bind(id, inviteCode).run();

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, id).run();

	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	return json({ ...packUser(user!, true), token });
};

// -- admin/suspend-user --
routes['admin/suspend-user'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 1 WHERE id = ?').bind(targetId).run();
	// Remove sessions
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
	return json({});
};

// -- admin/unsuspend-user --
routes['admin/unsuspend-user'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 0 WHERE id = ?').bind(targetId).run();
	return json({});
};

// -- admin/update-user-note (set moderator) --
routes['admin/moderators/add'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 1 WHERE id = ?').bind(targetId).run();
	return json({});
};

routes['admin/moderators/remove'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 0 WHERE id = ?').bind(targetId).run();
	return json({});
};

// -- admin/show-users --
routes['admin/show-users'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limit = Math.min(Number(body.limit) || 30, 100);
	const offset = Number(body.offset) || 0;
	const users = await db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
		.bind(limit, offset).all<DbUser>();
	return json((users.results ?? []).map(u2 => packUser(u2, true)));
};

// -- notes/create --
routes['notes/create'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const text = (body.text ?? '') as string;
	const cw = (body.cw ?? null) as string | null;
	const visibility = (body.visibility ?? 'public') as string;
	const replyId = (body.replyId ?? null) as string | null;
	const renoteId = (body.renoteId ?? null) as string | null;

	if (!text && !renoteId) return err('Text or renoteId required');

	const id = generateId();
	await db.prepare(
		'INSERT INTO notes (id, user_id, text, cw, visibility, reply_id, renote_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(id, u.id, text || null, cw, visibility, replyId, renoteId).run();

	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<DbNote>();
	const packed = await packNote(db, note!);
	return json({ createdNote: packed });
};

// -- notes/show --
routes['notes/show'] = async (db, body) => {
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	if (!note) return err('No such note', 404);
	return json(await packNote(db, note));
};

// -- notes/delete --
routes['notes/delete'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	if (!note) return err('No such note', 404);
	if (note.user_id !== u.id && !u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	await db.prepare('DELETE FROM reactions WHERE note_id = ?').bind(noteId).run();
	await db.prepare('DELETE FROM notes WHERE id = ?').bind(noteId).run();
	return json({});
};

// -- notes/reactions/create --
routes['notes/reactions/create'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	const reaction = (body.reaction ?? '❤') as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT id FROM notes WHERE id = ?').bind(noteId).first();
	if (!note) return err('No such note', 404);

	const id = generateId();
	try {
		await db.prepare('INSERT INTO reactions (id, note_id, user_id, reaction) VALUES (?, ?, ?, ?)')
			.bind(id, noteId, u.id, reaction).run();
	} catch {
		return err('Already reacted');
	}
	return json({});
};

// -- notes/reactions/delete --
routes['notes/reactions/delete'] = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');

	await db.prepare('DELETE FROM reactions WHERE note_id = ? AND user_id = ?')
		.bind(noteId, u.id).run();
	return json({});
};

// -- notes/timeline --
routes['notes/timeline'] = async (db, body) => {
	const limit = Math.min(Number(body.limit) || 10, 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT * FROM notes WHERE visibility = \'public\'';
	const params: unknown[] = [];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const notes = await db.prepare(sql).bind(...params).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

// alias
routes['notes/local-timeline'] = routes['notes/timeline'];
routes['notes/global-timeline'] = routes['notes/timeline'];

// -- notes/user-timeline (user's notes) --
routes['users/notes'] = async (db, body) => {
	const userId = body.userId as string;
	if (!userId) return err('userId required');
	const limit = Math.min(Number(body.limit) || 10, 100);

	const notes = await db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
		.bind(userId, limit).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

// -- emojis (empty) --
routes['emojis'] = async () => json({ emojis: [] });

// -- stats --
routes['stats'] = async (db) => {
	const users = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
	const notes = await db.prepare('SELECT COUNT(*) as c FROM notes').first<{ c: number }>();
	return json({
		notesCount: notes?.c ?? 0,
		originalNotesCount: notes?.c ?? 0,
		usersCount: users?.c ?? 0,
		originalUsersCount: users?.c ?? 0,
		reactionsCount: 0,
		instances: 0,
		driveUsageLocal: 0,
		driveUsageRemote: 0,
	});
};

// -- ping --
routes['ping'] = async () => json({ pong: Date.now() });

// -- endpoints (list available endpoints) --
routes['endpoints'] = async () => json(Object.keys(routes));

// ---- main handler ----

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors() });
		}

		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

		if (!path || path === '') {
			return json({ name: 'MissLite CF', version: '0.1.0' });
		}

		const handler = routes[path];
		if (!handler) {
			return err('Unknown endpoint: ' + path, 404);
		}

		let body: Record<string, unknown> = {};
		if (request.method === 'POST') {
			try {
				body = await request.json() as Record<string, unknown>;
			} catch {
				body = {};
			}
		}

		try {
			return await handler(env.DB, body, env);
		} catch (e) {
			console.error('Handler error:', e);
			return err('Internal server error', 500);
		}
	},
};
