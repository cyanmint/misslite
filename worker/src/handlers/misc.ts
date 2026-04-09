/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbNotification, DbUser, DbNote, DbAnnouncement, DbSwSubscription } from '../types.js';
import { json, err, generateId, requireUser, getUser, packUser, packNote, getMeta, setMeta, hashPassword, DEFAULT_POLICIES } from '../helpers.js';

export const emojis: Handler = async () => json({ emojis: [] });

export const stats: Handler = async (db) => {
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

export const ping: Handler = async () => json({ pong: Date.now() });

export const serverInfo: Handler = async () => json({
machine: 'Cloudflare Workers',
cpu: { model: 'unknown', cores: 1 },
mem: { total: 0 },
fs: { total: 0, used: 0 },
net: { interface: 'none' },
});

export const listNotifications: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const limit = Math.min(Number(body.limit) || 10, 100);
const unreadOnly = body.unreadOnly === true;

let sql = 'SELECT * FROM notifications WHERE user_id = ?';
const params: unknown[] = [u.id];
if (unreadOnly) { sql += ' AND is_read = 0'; }
sql += ' ORDER BY created_at DESC LIMIT ?';
params.push(limit);

const rows = await db.prepare(sql).bind(...params).all<DbNotification>();
const results = await Promise.all((rows.results ?? []).map(async n => {
let notifier: Record<string, unknown> | null = null;
let note: Record<string, unknown> | null = null;
if (n.notifier_id) {
const notifierUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(n.notifier_id).first<DbUser>();
if (notifierUser) notifier = packUser(notifierUser);
}
if (n.note_id) {
const noteRow = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(n.note_id).first<DbNote>();
if (noteRow) note = await packNote(db, noteRow);
}
return {
id: n.id,
createdAt: n.created_at,
type: n.type,
isRead: !!n.is_read,
user: notifier,
note,
reaction: n.reaction,
};
}));
return json(results);
};

export const markNotificationsRead: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(u.id).run();
return json({});
};

export const iNotificationsGrouped: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json([]);
};

export const notesFeatured: Handler = async () => json([]);
export const hashtagsTrend: Handler = async () => json([]);

export const hashtagsList: Handler = async () => json([]);
export const hashtagsSearch: Handler = async (db, body) => {
	const query = ((body.query ?? '') as string).trim();
	if (!query) return err('query required');
	return json([]);
};
export const hashtagsShow: Handler = async (db, body) => {
	const tag = (body.tag ?? '') as string;
	if (!tag) return err('tag required');
	return json({ tag, mentionedUsersCount: 0, mentionedLocalUsersCount: 0, mentionedRemoteUsersCount: 0, attachedUsersCount: 0, attachedLocalUsersCount: 0, attachedRemoteUsersCount: 0 });
};
export const hashtagsUsers: Handler = async (db, body) => {
	return json([]);
};
export const notesPollsVote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({});
};
export const notesPollsRecommendation: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};
export const bubbleGameRanking: Handler = async () => json([]);
export const driveFiles: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const driveFolders: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};

export const iClaimAchievement: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json(null);
};

export const readAnnouncement: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const announcementId = body.announcementId as string;
if (announcementId) {
try {
await db.prepare('INSERT INTO announcement_reads (id, user_id, announcement_id) VALUES (?, ?, ?)')
.bind(generateId(), u.id, announcementId).run();
} catch { /* already read */ }
}
return json({});
};

export const swRegister: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const endpoint = (body.endpoint ?? '') as string;
const auth = (body.auth ?? null) as string | null;
const publickey = (body.publickey ?? null) as string | null;
const sendReadMessage = body.sendReadMessage === true;
const id = generateId();
try {
await db.prepare('INSERT INTO sw_subscriptions (id, user_id, endpoint, auth, publickey, send_read_message) VALUES (?, ?, ?, ?, ?, ?)')
.bind(id, u.id, endpoint, auth, publickey, sendReadMessage ? 1 : 0).run();
} catch { /* already registered */ }
return json({ state: 'already-subscribed', key: publickey, userId: u.id, endpoint, sendReadMessage });
};

export const swUnregister: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const endpoint = (body.endpoint ?? '') as string;
if (endpoint) {
await db.prepare('DELETE FROM sw_subscriptions WHERE user_id = ? AND endpoint = ?').bind(u.id, endpoint).run();
}
return json({});
};

export const swShowRegistration: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const endpoint = (body.endpoint ?? '') as string;
const row = await db.prepare('SELECT * FROM sw_subscriptions WHERE user_id = ? AND endpoint = ?')
.bind(u.id, endpoint).first<DbSwSubscription>();
if (!row) return json(null);
return json({ userId: row.user_id, endpoint: row.endpoint, sendReadMessage: !!row.send_read_message, key: row.publickey });
};

export const swUpdateRegistration: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const endpoint = (body.endpoint ?? '') as string;
const sendReadMessage = body.sendReadMessage === true;
await db.prepare('UPDATE sw_subscriptions SET send_read_message = ? WHERE user_id = ? AND endpoint = ?')
.bind(sendReadMessage ? 1 : 0, u.id, endpoint).run();
return json({ userId: u.id, endpoint, sendReadMessage, key: null });
};

export const usernameAvailable: Handler = async (db, body) => {
const username = (body.username ?? '') as string;
if (!username) return err('username required');
const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
return json({ available: !existing });
};

export const emailAddressAvailable: Handler = async () => json({ available: true });

export const getOnlineUsersCount: Handler = async (db) => {
const users = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
return json({ count: users?.c ?? 0 });
};

export const pinnedUsers: Handler = async () => json([]);

export const retention: Handler = async () => json([]);

export const emojiSingle: Handler = async (db, body) => {
const name = (body.name ?? '') as string;
if (!name) return err('name required');
return json(null);
};

export const endpointSingle: Handler = async (db, body) => {
return json({ params: [], res: null });
};

export const announcementShow: Handler = async (db, body) => {
const announcementId = (body.announcementId ?? body.id ?? '') as string;
if (!announcementId) return err('id required');
const a = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(announcementId).first<DbAnnouncement>();
if (!a) return err('No such announcement', 404);
const u = await getUser(db, body);
let isRead = false;
if (u) {
const read = await db.prepare('SELECT id FROM announcement_reads WHERE user_id = ? AND announcement_id = ?')
.bind(u.id, a.id).first();
isRead = !!read;
}
return json({ id: a.id, title: a.title, text: a.text, imageUrl: a.image_url, createdAt: a.created_at, updatedAt: a.updated_at, isRead });
};

export const iPin: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const noteId = (body.noteId ?? '') as string;
if (!noteId) return err('noteId required');
const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
if (!note) return err('No such note', 404);
if (note.user_id !== u.id) return err('Forbidden', 403);
try {
await db.prepare('INSERT INTO pinned_notes (id, user_id, note_id) VALUES (?, ?, ?)')
.bind(generateId(), u.id, noteId).run();
} catch { /* already pinned */ }
const token = (body.i ?? body.token ?? '') as string;
const { packSelf } = await import('../helpers.js');
return json(packSelf(u, token));
};

export const iUnpin: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const noteId = (body.noteId ?? '') as string;
if (!noteId) return err('noteId required');
await db.prepare('DELETE FROM pinned_notes WHERE user_id = ? AND note_id = ?').bind(u.id, noteId).run();
const token = (body.i ?? body.token ?? '') as string;
const { packSelf } = await import('../helpers.js');
return json(packSelf(u, token));
};

export const iDeleteAccount: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const password = (body.password ?? '') as string;
if (!password) return err('password required');
const { verifyPassword } = await import('../helpers.js');
if (!await verifyPassword(u.username + password, u.password_hash)) return err('Incorrect password', 401);
await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
await db.prepare('DELETE FROM notifications WHERE user_id = ? OR notifier_id = ?').bind(u.id, u.id).run();
await db.prepare('DELETE FROM reactions WHERE user_id = ?').bind(u.id).run();
await db.prepare('DELETE FROM favorites WHERE user_id = ?').bind(u.id).run();
await db.prepare('DELETE FROM notes WHERE user_id = ?').bind(u.id).run();
await db.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
return json({});
};

export const iRegenerateToken: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const password = (body.password ?? '') as string;
if (!password) return err('password required');
const { verifyPassword } = await import('../helpers.js');
if (!await verifyPassword(u.username + password, u.password_hash)) return err('Incorrect password', 401);
await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
const token = generateId() + generateId();
await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, u.id).run();
return json({ token });
};

export const iSigninHistory: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const sessions = await db.prepare('SELECT token, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
.bind(u.id).all<{ token: string; created_at: string }>();
return json((sessions.results ?? []).map(s => ({ id: s.token, createdAt: s.created_at, ip: '0.0.0.0', headers: {}, success: true })));
};

export const iRegistryGetDetail: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const key = (body.key ?? '') as string;
const scope = JSON.stringify(body.scope ?? []);
const row = await db.prepare('SELECT * FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ? AND key = ?')
.bind(u.id, scope, key).first();
if (!row) return err('No such key', 404);
return json(row);
};

export const iRegistryKeysWithType: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const scope = JSON.stringify(body.scope ?? []);
const rows = await db.prepare('SELECT key, value FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ?')
.bind(u.id, scope).all<{ key: string; value: string }>();
const result: Record<string, string> = {};
for (const r of rows.results ?? []) {
try { const v = JSON.parse(r.value); result[r.key] = typeof v; } catch { result[r.key] = 'string'; }
}
return json(result);
};

export const iRegistryScopesWithDomain: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const rows = await db.prepare('SELECT DISTINCT domain, scope FROM registry_items WHERE user_id = ?')
.bind(u.id).all<{ domain: string | null; scope: string }>();
const result: Record<string, string[][]> = {};
for (const r of rows.results ?? []) {
const d = r.domain ?? '';
if (!result[d]) result[d] = [];
try { result[d].push(JSON.parse(r.scope)); } catch { result[d].push([]); }
}
return json(result);
};

export const testEndpoint: Handler = async () => json({});

// ── Diagnostic endpoints (CI control group) ────────────────────────────────

/** test/list-stub — returns a valid array schema but performs no DB operations.
 *  Grouped with test/post-stub; the group stub test must flag both as Stub. */
export const testListStub: Handler = async () => json([]);

/** test/post-stub — returns a valid object schema but performs no DB operations.
 *  Grouped with test/list-stub; the group stub test must flag both as Stub. */
export const testPostStub: Handler = async () =>
	json({ id: 'stub-id', createdAt: '2000-01-01T00:00:00.000Z' });

/** test/list-malfunction — intentionally returns an object when an array is expected.
 *  Must be detected as Malfunction by the schema validator. */
export const testListMalfunction: Handler = async () =>
	json({ intentional: 'malfunction', expected: 'array', got: 'object' });

/** test/post-malfunction — intentionally returns an array when an object is expected.
 *  Must be detected as Malfunction by the schema validator. */
export const testPostMalfunction: Handler = async () =>
	json(['intentional', 'malfunction', 'expected', 'object']);

export const iPurgeTimelineCache: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const notificationsCreate: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const notifBody = (body.body ?? '') as string;
const header = (body.header ?? '') as string;
const icon = (body.icon ?? null) as string | null;
await db.prepare('INSERT INTO notifications (id, user_id, type, notifier_id) VALUES (?, ?, ?, ?)')
.bind(generateId(), u.id, 'app', null).run();
return json({});
};

export const notificationsFlush: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const inviteDelete: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const inviteId = (body.inviteId ?? '') as string;
if (!inviteId) return err('inviteId required');
await db.prepare('DELETE FROM invite_codes WHERE code = ? AND created_by = ?').bind(inviteId, u.id).run();
return json({});
};

export const inviteLimit: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({ remaining: 100 });
};

export const getAvatarDecorations: Handler = async () => json([]);

export const bubbleGameRegister: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const fetchRss: Handler = async (db, body) => {
const url = (body.url ?? '') as string;
if (!url) return err('url required');
return json({ items: [] });
};

export const fetchExternalResources: Handler = async (db, body) => {
const url = (body.url ?? '') as string;
if (!url) return err('url required');
return json({ type: 'unknown', data: null });
};

export const promoRead: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const resetDb: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
if (!u.is_admin) return err('Forbidden', 403);
return json({});
};

export const pagePush: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const requestResetPassword: Handler = async () =>
new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

export const resetPasswordHandler: Handler = async () =>
new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

export const iRevokeToken: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const tokenId = (body.tokenId ?? '') as string;
if (tokenId) {
await db.prepare('DELETE FROM sessions WHERE token = ? AND user_id = ?').bind(tokenId, u.id).run();
}
return json({});
};

export const iMove: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({});
};

export const userListsList: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iClips: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iMute: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iBlock: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iFollowing: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iFollowers: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const antennasList: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const iUserListMemberships: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const channelsFeatured: Handler = async () => json([]);
export const channelsFollowed: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const flashFeatured: Handler = async () => json([]);
export const galleryFeatured: Handler = async () => json([]);
export const iGalleryLikes: Handler = async (db, body) => {
const u = await requireUser(db, body); if (u instanceof Response) return u; return json([]);
};
export const pagesFeatured: Handler = async () => json([]);
