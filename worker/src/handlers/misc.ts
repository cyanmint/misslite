/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbNotification, DbUser, DbNote } from '../types.js';
import { json, requireUser, packUser, packNote } from '../helpers.js';

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
