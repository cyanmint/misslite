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

// ── Additional admin endpoints ────────────────────────────────────────────────

export const adminAnnouncementsList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limit = Math.min(Number(body.limit) || 30, 100);
	const offset = Number(body.offset) || 0;
	const rows = await db.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT ? OFFSET ?')
		.bind(limit, offset).all<DbAnnouncement>();
	return json((rows.results ?? []).map(a => ({
		id: a.id, title: a.title, text: a.text,
		imageUrl: a.image_url, createdAt: a.created_at, updatedAt: a.updated_at,
		reads: 0, isRead: false,
	})));
};

export const adminAnnouncementsUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const id = (body.id ?? '') as string;
	if (!id) return err('id required');
	const a = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first<DbAnnouncement>();
	if (!a) return err('No such announcement', 404);

	const title = (body.title ?? a.title) as string;
	const text = (body.text ?? a.text) as string;
	const imageUrl = (body.imageUrl ?? a.image_url) as string | null;

	await db.prepare('UPDATE announcements SET title = ?, text = ?, image_url = ?, updated_at = ? WHERE id = ?')
		.bind(title, text, imageUrl, new Date().toISOString(), id).run();
	return json({});
};


export const adminShowUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	if (!userId) return err('userId required');
	const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
	if (!target) return err('No such user', 404);

	return json({
		...packUser(target, true),
		email: null,
		emailVerified: false,
		autoAcceptFollowed: true,
		noCrawle: false,
		preventAiLearning: false,
		alwaysMarkNsfw: false,
		autoSensitive: false,
		carefulBot: false,
		injectFeaturedNote: true,
		receiveAnnouncementEmail: true,
		mutedWords: [],
		mutedInstances: [],
		notificationRecieveConfig: {},
		isSilenced: false,
		isSuspended: !!target.is_suspended,
		isHibernated: false,
		isDeleted: false,
		isExplorable: true,
		isApproved: true,
		signupReason: null,
		ips: [],
	});
};

export const adminGetIndexStats: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);
	return json([]);
};

export const adminGetTableStats: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const tables: Record<string, { count: number; size: number | null }> = {};
	for (const name of ['users', 'notes', 'sessions', 'notifications', 'reactions', 'favorites', 'announcements', 'invite_codes', 'meta', 'moderation_logs', 'registry_items']) {
		try {
			const row = await db.prepare(`SELECT COUNT(*) as c FROM ${name}`).first<{ c: number }>();
			tables[name] = { count: row?.c ?? 0, size: null };
		} catch {
			tables[name] = { count: 0, size: null };
		}
	}
	return json(tables);
};

export const adminInviteCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const count = Math.min(Number(body.count) || 1, 100);
	const results: unknown[] = [];
	for (let i = 0; i < count; i++) {
		const code = generateId();
		await db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').bind(code, u.id).run();
		results.push({
			id: code, code, expiresAt: null,
			createdAt: new Date().toISOString(),
			createdBy: packUser(u), usedBy: null, usedAt: null, used: false,
		});
	}
	return json(results);
};

export const adminInviteList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limit = Math.min(Number(body.limit) || 30, 100);
	const offset = Number(body.offset) || 0;
	const codes = await db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT ? OFFSET ?')
		.bind(limit, offset).all();
	return json(codes.results ?? []);
};

export const adminRegenerateUserToken: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	if (!userId) return err('userId required');
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
	const newToken = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(newToken, userId).run();
	await logAction(db, u.id, 'regenerateToken', userId);
	return json({ token: newToken });
};

export const adminAbuseUserReports: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const limitRaw = Number(body.limit);
	const offsetRaw = Number(body.offset);
	const limit = Math.min(!isNaN(limitRaw) && limitRaw > 0 ? limitRaw : 10, 100);
	const offset = !isNaN(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
	const resolved = body.resolved as boolean | undefined;

	let query: string;
	let params: (string | number | null)[];
	if (resolved === true) {
		query = 'SELECT * FROM abuse_reports WHERE resolved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?';
		params = [limit, offset];
	} else if (resolved === false) {
		query = 'SELECT * FROM abuse_reports WHERE resolved = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?';
		params = [limit, offset];
	} else {
		query = 'SELECT * FROM abuse_reports ORDER BY created_at DESC LIMIT ? OFFSET ?';
		params = [limit, offset];
	}

	const rows = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
	const reports = rows.results ?? [];

	// Batch-fetch all referenced users to avoid N+1 queries
	const userIds = [...new Set([
		...reports.map(r => r.reporter_id as string),
		...reports.map(r => r.target_user_id as string),
	].filter(Boolean))];
	const usersMap = new Map<string, DbUser>();
	if (userIds.length > 0) {
		const placeholders = userIds.map(() => '?').join(',');
		const usersRows = await db.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).bind(...userIds).all<DbUser>();
		for (const usr of usersRows.results ?? []) usersMap.set(usr.id, usr);
	}

	const results = reports.map(r => {
		const reporter = usersMap.get(r.reporter_id as string);
		const target = usersMap.get(r.target_user_id as string);
		return {
			id: r.id,
			createdAt: r.created_at,
			comment: r.comment,
			resolved: !!r.resolved,
			forwarded: !!r.forwarded,
			reporter: reporter ? packUser(reporter) : null,
			targetUser: target ? packUser(target) : null,
			assignee: null,
		};
	});
	return json(results);
};

export const adminResolveAbuseUserReport: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const reportId = (body.reportId ?? '') as string;
	if (!reportId) return err('reportId required');
	await db.prepare('UPDATE abuse_reports SET resolved = 1 WHERE id = ?').bind(reportId).run();
	await logAction(db, u.id, 'resolveAbuseReport', reportId);
	return json({});
};

export const adminForwardAbuseUserReport: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const reportId = (body.reportId ?? '') as string;
	if (!reportId) return err('reportId required');
	await db.prepare('UPDATE abuse_reports SET forwarded = 1 WHERE id = ?').bind(reportId).run();
	await logAction(db, u.id, 'forwardAbuseReport', reportId);
	return json({});
};

export const adminUpdateAbuseUserReport: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const reportId = (body.reportId ?? '') as string;
	if (!reportId) return err('reportId required');
	const report = await db.prepare('SELECT * FROM abuse_reports WHERE id = ?').bind(reportId).first<Record<string, unknown>>();
	if (!report) return err('No such report', 404);

	const assigneeId = (body.assigneeId ?? report.assigned_moderator_id ?? null) as string | null;
	await db.prepare('UPDATE abuse_reports SET assigned_moderator_id = ? WHERE id = ?')
		.bind(assigneeId, reportId).run();
	return json({});
};

export const adminShowUserAccountMoveLogs: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);
	return json([]);
};

export const adminUnsetUserAvatar: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	if (!userId) return err('userId required');
	await db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').bind(userId).run();
	return json({});
};

export const adminUnsetUserBanner: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	if (!userId) return err('userId required');
	await db.prepare('UPDATE users SET banner_url = NULL WHERE id = ?').bind(userId).run();
	return json({});
};

export const adminUpdateUserName: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	const newName = (body.name ?? '') as string;
	if (!userId) return err('userId required');

	await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(newName || null, userId).run();
	return json({});
};

export const adminUpdateUserNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const userId = (body.userId ?? '') as string;
	if (!userId) return err('userId required');
	const memo = (body.text ?? '') as string;

	await db.prepare('INSERT OR REPLACE INTO user_memos (user_id, target_user_id, memo) VALUES (?, ?, ?)')
		.bind(u.id, userId, memo).run();
	return json({});
};
