/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, generateId, packUser, requireUser } from '../helpers.js';

export const suspendUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 1 WHERE id = ?').bind(targetId).run();
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
	return json({});
};

export const unsuspendUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');

	await db.prepare('UPDATE users SET is_suspended = 0 WHERE id = ?').bind(targetId).run();
	return json({});
};

export const addModerator: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 1 WHERE id = ?').bind(targetId).run();
	return json({});
};

export const removeModerator: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);

	const targetId = body.userId as string;
	if (!targetId) return err('userId required');
	await db.prepare('UPDATE users SET is_moderator = 0 WHERE id = ?').bind(targetId).run();
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
	return json({ code });
};

export const listInvites: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	const codes = await db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();
	return json(codes.results ?? []);
};
