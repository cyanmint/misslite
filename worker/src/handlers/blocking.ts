/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, generateId, packUser, requireUser } from '../helpers.js';

/* ------------------------------------------------------------------ */
/*  blocking/create                                                    */
/* ------------------------------------------------------------------ */
export const blockingCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const blockeeId = body.userId as string | undefined;
	if (!blockeeId) return err('userId is required');

	if (blockeeId === u.id) return err('Cannot block yourself');

	const blockee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(blockeeId).first<DbUser>();
	if (!blockee) return err('User not found');

	const id = generateId();
	try {
		await db.prepare(
			'INSERT INTO blocking (id, blocker_id, blockee_id) VALUES (?, ?, ?)',
		).bind(id, u.id, blockeeId).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already blocking');
		throw e;
	}

	// Remove any following relationship in both directions
	await db.prepare(
		'DELETE FROM following WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)',
	).bind(u.id, blockeeId, blockeeId, u.id).run();

	return json(packUser(blockee, true));
};

/* ------------------------------------------------------------------ */
/*  blocking/delete                                                    */
/* ------------------------------------------------------------------ */
export const blockingDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const blockeeId = body.userId as string | undefined;
	if (!blockeeId) return err('userId is required');

	const blockee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(blockeeId).first<DbUser>();
	if (!blockee) return err('User not found');

	await db.prepare(
		'DELETE FROM blocking WHERE blocker_id = ? AND blockee_id = ?',
	).bind(u.id, blockeeId).run();

	return json(packUser(blockee, true));
};

/* ------------------------------------------------------------------ */
/*  blocking/list                                                      */
/* ------------------------------------------------------------------ */
export const blockingList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT b.id, b.created_at, b.blocker_id, b.blockee_id, u.* FROM blocking b JOIN users u ON u.id = b.blockee_id WHERE b.blocker_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM blocking WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND b.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM blocking WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND b.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY b.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();

	const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		createdAt: r.created_at as string,
		blockeeId: r.blockee_id as string,
		blockee: packUser({
			id: r.blockee_id as string,
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
