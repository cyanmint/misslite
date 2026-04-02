/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, packUser, packSelf, requireUser } from '../helpers.js';

export const currentUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const token = (body.i ?? body.token ?? '') as string;
	return json(packSelf(u, token));
};

export const updateUser: Handler = async (db, body) => {
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
	const token = (body.i ?? body.token ?? '') as string;
	return json(packSelf(updated!, token));
};

export const showUser: Handler = async (db, body) => {
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

export const searchUsers: Handler = async (db, body) => {
	const query = ((body.query ?? body.username ?? '') as string).trim();
	if (!query) return err('query required');
	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;
	const pattern = '%' + query.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
	const users = await db.prepare(
		'SELECT * FROM users WHERE (username LIKE ? OR name LIKE ?) ORDER BY username ASC LIMIT ? OFFSET ?'
	).bind(pattern, pattern, limit, offset).all<DbUser>();
	return json((users.results ?? []).map(u => packUser(u, true)));
};
