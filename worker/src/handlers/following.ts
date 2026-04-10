/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, generateId, packUser, requireUser, getUser } from '../helpers.js';

/* ------------------------------------------------------------------ */
/*  following/create                                                   */
/* ------------------------------------------------------------------ */
export const followCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const followeeId = body.userId as string | undefined;
	if (!followeeId) return err('userId is required');

	if (followeeId === u.id) return err('Cannot follow yourself');

	const followee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(followeeId).first<DbUser>();
	if (!followee) return err('User not found');

	const id = generateId();
	await db.prepare(
		'INSERT OR IGNORE INTO following (id, follower_id, followee_id) VALUES (?, ?, ?)',
	).bind(id, u.id, followeeId).run();

	// Create a follow notification for the followee
	await db.prepare(
		'INSERT INTO notifications (id, user_id, type, notifier_id) VALUES (?, ?, \'follow\', ?)',
	).bind(generateId(), followeeId, u.id).run();

	return json(packUser(followee, true));
};

/* ------------------------------------------------------------------ */
/*  following/delete                                                   */
/* ------------------------------------------------------------------ */
export const followDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const followeeId = body.userId as string | undefined;
	if (!followeeId) return err('userId is required');

	const followee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(followeeId).first<DbUser>();
	if (!followee) return err('User not found');

	await db.prepare(
		'DELETE FROM following WHERE follower_id = ? AND followee_id = ?',
	).bind(u.id, followeeId).run();

	return json(packUser(followee, true));
};

/* ------------------------------------------------------------------ */
/*  following/invalidate                                               */
/* ------------------------------------------------------------------ */
export const followInvalidate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const followerId = body.userId as string | undefined;
	if (!followerId) return err('userId is required');

	const follower = await db.prepare('SELECT * FROM users WHERE id = ?').bind(followerId).first<DbUser>();
	if (!follower) return err('User not found');

	await db.prepare(
		'DELETE FROM following WHERE follower_id = ? AND followee_id = ?',
	).bind(followerId, u.id).run();

	return json(packUser(follower, true));
};

/* ------------------------------------------------------------------ */
/*  following/requests/accept                                          */
/* ------------------------------------------------------------------ */
export const followRequestsAccept: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({});
};

/* ------------------------------------------------------------------ */
/*  following/requests/cancel                                          */
/* ------------------------------------------------------------------ */
export const followRequestsCancel: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const userId = (body.userId ?? '') as string;
	if (userId) {
		const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
		if (target) return json(packUser(target));
	}
	return json(packUser(u));
};

/* ------------------------------------------------------------------ */
/*  following/requests/list                                            */
/* ------------------------------------------------------------------ */
export const followRequestsList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

/* ------------------------------------------------------------------ */
/*  following/requests/reject                                          */
/* ------------------------------------------------------------------ */
export const followRequestsReject: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({});
};

/* ------------------------------------------------------------------ */
/*  following/requests/sent                                            */
/* ------------------------------------------------------------------ */
export const followRequestsSent: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

/* ------------------------------------------------------------------ */
/*  following/update                                                   */
/* ------------------------------------------------------------------ */
export const followUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const userId = (body.userId ?? '') as string;
	if (userId) {
		const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
		if (target) return json(packUser(target));
	}
	return json(packUser(u));
};

/* ------------------------------------------------------------------ */
/*  following/update-all                                               */
/* ------------------------------------------------------------------ */
export const followUpdateAll: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({});
};

/* ------------------------------------------------------------------ */
/*  Helpers: resolve target user & build pagination clauses            */
/* ------------------------------------------------------------------ */

async function resolveTarget(db: D1Database, body: Record<string, unknown>): Promise<DbUser | Response> {
	const userId = body.userId as string | undefined;
	const username = body.username as string | undefined;

	if (userId) {
		const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
		if (!u) return err('User not found');
		return u;
	}
	if (username) {
		const u = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
		if (!u) return err('User not found');
		return u;
	}
	// Fall back to the authenticated user if available
	const me = await getUser(db, body);
	if (me) return me;
	return err('userId is required');
}

/* ------------------------------------------------------------------ */
/*  users/followers                                                    */
/* ------------------------------------------------------------------ */
export const usersFollowers: Handler = async (db, body) => {
	const targetResult = await resolveTarget(db, body);
	if (targetResult instanceof Response) return json([]);
	const target = targetResult;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT f.id, f.created_at, f.follower_id, f.followee_id, u.* FROM following f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ?';
	const params: unknown[] = [target.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM following WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND f.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM following WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND f.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY f.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();

	const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		createdAt: r.created_at as string,
		followeeId: r.followee_id as string,
		followerId: r.follower_id as string,
		follower: packUser({
			id: r.follower_id as string,
			username: r.username as string,
			password_hash: r.password_hash as string,
			name: r.name as string | null,
			description: r.description as string,
			avatar_url: r.avatar_url as string | null,
			is_admin: r.is_admin as number,
			is_moderator: r.is_moderator as number,
			is_suspended: r.is_suspended as number,
			created_at: (r as Record<string, unknown>)['created_at:1'] as string ?? r.created_at as string,
		}),
	}));

	return json(results);
};

/* ------------------------------------------------------------------ */
/*  users/following                                                    */
/* ------------------------------------------------------------------ */
export const usersFollowing: Handler = async (db, body) => {
	const targetResult = await resolveTarget(db, body);
	if (targetResult instanceof Response) return json([]);
	const target = targetResult;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT f.id, f.created_at, f.follower_id, f.followee_id, u.* FROM following f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?';
	const params: unknown[] = [target.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM following WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND f.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM following WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND f.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY f.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();

	const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		createdAt: r.created_at as string,
		followeeId: r.followee_id as string,
		followerId: r.follower_id as string,
		followee: packUser({
			id: r.followee_id as string,
			username: r.username as string,
			password_hash: r.password_hash as string,
			name: r.name as string | null,
			description: r.description as string,
			avatar_url: r.avatar_url as string | null,
			is_admin: r.is_admin as number,
			is_moderator: r.is_moderator as number,
			is_suspended: r.is_suspended as number,
			created_at: (r as Record<string, unknown>)['created_at:1'] as string ?? r.created_at as string,
		}),
	}));

	return json(results);
};
