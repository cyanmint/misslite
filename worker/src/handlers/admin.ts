/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser, DbAnnouncement } from '../types.js';
import { json, err, generateId, packUser, requireUser, hashPassword, getMeta, setMeta } from '../helpers.js';

async function logAction(db: D1Database, actorId: string, type: string, targetId?: string, note?: string): Promise<void> {
	await db.prepare('INSERT INTO moderation_logs (id, actor_id, type, target_id, note) VALUES (?, ?, ?, ?, ?)')
		.bind(generateId(), actorId, type, targetId ?? null, note ?? null).run();
}

export const suspendUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 1 WHERE id = ?').bind(targetId).run();
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
	await logAction(db, u.id, 'suspend', targetId);
	return json({});
};

export const unsuspendUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 0 WHERE id = ?').bind(targetId).run();
	await logAction(db, u.id, 'unsuspend', targetId);
	return json({});
};

export const addModerator: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 1 WHERE id = ?').bind(targetId).run();
	await logAction(db, u.id, 'addModerator', targetId);
	return json({});
};

export const removeModerator: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 0 WHERE id = ?').bind(targetId).run();
	await logAction(db, u.id, 'removeModerator', targetId);
	return json({});
};

export const showUsers: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limit = Math.min(Number(body.limit) || 30, 100);
	const offset = Number(body.offset) || 0;
	const users = await db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
		.bind(limit, offset).all<DbUser>();
	return json((users.results ?? []).map(u2 => packUser(u2, true)));
};

export const createInvite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const code = generateId();
	await db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').bind(code, u.id).run();
	const userRow = await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<DbUser>();
	return json({
		id: code,
		code,
		expiresAt: null,
		createdAt: new Date().toISOString(),
		createdBy: packUser(userRow!),
		usedBy: null,
		usedAt: null,
		used: false,
	});
};

export const listInvites: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const codes = await db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();
	return json(codes.results ?? []);
};

export const deleteAccount: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	if (targetId === u.id) return err('Cannot delete your own account');

	const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
	if (!target) return err('No such user', 404);

	// Cascade: reactions → notes → sessions → invite_codes → notifications → user
	await db.prepare('DELETE FROM reactions WHERE user_id = ?').bind(targetId).run();
	await db.prepare('DELETE FROM favorites WHERE user_id = ?').bind(targetId).run();
	await db.prepare('DELETE FROM notifications WHERE user_id = ? OR notifier_id = ?').bind(targetId, targetId).run();
	await db.prepare('DELETE FROM reactions WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').bind(targetId).run();
	await db.prepare('DELETE FROM favorites WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').bind(targetId).run();
	await db.prepare('DELETE FROM notes WHERE user_id = ?').bind(targetId).run();
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
	await db.prepare('UPDATE invite_codes SET used_by = NULL, used_at = NULL WHERE used_by = ?').bind(targetId).run();
	await db.prepare('DELETE FROM invite_codes WHERE created_by = ?').bind(targetId).run();
	await db.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
	await logAction(db, u.id, 'deleteAccount', targetId);
	return json({});
};

export const resetPassword: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	const newPassword = (body.newPassword ?? '') as string;
	if (!targetId) return err('userId required');
	if (!newPassword) return err('newPassword required');

	const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(targetId).first<DbUser>();
	if (!target) return err('No such user', 404);

	const pwHash = await hashPassword(target.username + newPassword);
	await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(pwHash, targetId).run();
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
	await logAction(db, u.id, 'resetPassword', targetId);
	return json({});
};

export const updateMeta: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const allowed = ['name', 'description', 'themeColor', 'maxNoteLength', 'registrationMode',
		'bannerUrl', 'iconUrl', 'backgroundImageUrl', 'maintainerName', 'maintainerEmail'];
	for (const key of allowed) {
		if (key in body && body[key] !== undefined) {
			await setMeta(db, key, String(body[key]));
		}
	}
	await logAction(db, u.id, 'updateMeta');
	return json({});
};

export const showModerationLogs: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limit = Math.min(Number(body.limit) || 30, 100);
	const offset = Number(body.offset) || 0;
	const logs = await db.prepare(
		'SELECT l.*, u.username as actor_username FROM moderation_logs l LEFT JOIN users u ON l.actor_id = u.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?'
	).bind(limit, offset).all();
	return json(logs.results ?? []);
};

// ── Announcements ─────────────────────────────────────────────────────────────

export const listAnnouncements: Handler = async (db) => {
	const rows = await db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all<DbAnnouncement>();
	return json((rows.results ?? []).map(a => ({
		id: a.id, title: a.title, text: a.text,
		imageUrl: a.image_url, createdAt: a.created_at, updatedAt: a.updated_at,
		isRead: false,
	})));
};

export const createAnnouncement: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const title = (body.title ?? '') as string;
	const text = (body.text ?? '') as string;
	const imageUrl = (body.imageUrl ?? null) as string | null;
	if (!title) return err('title required');
	if (!text) return err('text required');

	const id = generateId();
	await db.prepare('INSERT INTO announcements (id, title, text, image_url) VALUES (?, ?, ?, ?)')
		.bind(id, title, text, imageUrl).run();
	const a = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first<DbAnnouncement>();
	return json({ id: a!.id, title: a!.title, text: a!.text, imageUrl: a!.image_url, createdAt: a!.created_at, updatedAt: a!.updated_at });
};

export const deleteAnnouncement: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const announcementId = body.announcementId as string;
	if (!announcementId) return err('announcementId required');
	await db.prepare('DELETE FROM announcements WHERE id = ?').bind(announcementId).run();
	return json({});
};
