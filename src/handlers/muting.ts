import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, generateId, packUser, requireUser } from '../helpers.js';

export const muteCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const muteeId = body.userId as string | undefined;
	if (!muteeId) return err('userId is required');

	if (muteeId === u.id) return err('Cannot mute yourself');

	const mutee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(muteeId).first<DbUser>();
	if (!mutee) return err('User not found');

	const expiresAt = (body.expiresAt as string | null) ?? null;

	const id = generateId();
	try {
		await db.prepare(
			'INSERT INTO muting (id, muter_id, mutee_id, expires_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, muteeId, expiresAt).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already muting');
		throw e;
	}

	return json({});
};

export const muteDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const muteeId = body.userId as string | undefined;
	if (!muteeId) return err('userId is required');

	await db.prepare(
		'DELETE FROM muting WHERE muter_id = ? AND mutee_id = ?',
	).bind(u.id, muteeId).run();

	return json({});
};

export const muteList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT m.id, m.created_at, m.muter_id, m.mutee_id, m.expires_at, u.* FROM muting m JOIN users u ON u.id = m.mutee_id WHERE m.muter_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM muting WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND m.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM muting WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND m.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY m.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();

	const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		createdAt: r.created_at as string,
		muteeId: r.mutee_id as string,
		expiresAt: r.expires_at as string | null,
		mutee: packUser({
			id: r.mutee_id as string,
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

export const renoteMuteCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const muteeId = body.userId as string | undefined;
	if (!muteeId) return err('userId is required');

	if (muteeId === u.id) return err('Cannot mute yourself');

	const mutee = await db.prepare('SELECT * FROM users WHERE id = ?').bind(muteeId).first<DbUser>();
	if (!mutee) return err('User not found');

	const id = generateId();
	try {
		await db.prepare(
			'INSERT INTO renote_muting (id, muter_id, mutee_id) VALUES (?, ?, ?)',
		).bind(id, u.id, muteeId).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already muting renotes');
		throw e;
	}

	return json({});
};

export const renoteMuteDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const muteeId = body.userId as string | undefined;
	if (!muteeId) return err('userId is required');

	await db.prepare(
		'DELETE FROM renote_muting WHERE muter_id = ? AND mutee_id = ?',
	).bind(u.id, muteeId).run();

	return json({});
};

export const renoteMuteList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT m.id, m.created_at, m.muter_id, m.mutee_id, u.* FROM renote_muting m JOIN users u ON u.id = m.mutee_id WHERE m.muter_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM renote_muting WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND m.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM renote_muting WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND m.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY m.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();

	const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		createdAt: r.created_at as string,
		muteeId: r.mutee_id as string,
		mutee: packUser({
			id: r.mutee_id as string,
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
