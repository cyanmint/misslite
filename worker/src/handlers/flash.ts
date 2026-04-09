import type { Handler } from '../types.js';
import type { DbUser, DbFlash } from '../types.js';
import { json, err, generateId, packUser, requireUser } from '../helpers.js';

function packFlash(f: DbFlash, user?: Record<string, unknown>): Record<string, unknown> {
	return {
		id: f.id,
		createdAt: f.created_at,
		updatedAt: f.updated_at,
		userId: f.user_id,
		user: user ?? null,
		title: f.title,
		summary: f.summary,
		script: f.script,
		visibility: f.visibility,
		likedCount: f.liked_count,
		isLiked: false,
	};
}

export const flashCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const title = body.title as string | undefined;
	if (!title) return err('title is required');

	const summary = (body.summary as string | undefined) ?? '';
	const script = (body.script as string | undefined) ?? '';
	const visibility = (body.visibility as string | undefined) ?? 'public';

	const id = generateId();
	const now = new Date().toISOString();

	await db.prepare(
		'INSERT INTO flash (id, user_id, title, summary, script, visibility, liked_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
	).bind(id, u.id, title, summary, script, visibility, now, now).run();

	const newFlash: DbFlash = {
		id, user_id: u.id, title, summary, script, visibility,
		liked_count: 0, created_at: now, updated_at: now,
	};
	return json(packFlash(newFlash, packUser(u)));
};

export const flashDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const flashId = body.flashId as string | undefined;
	if (!flashId) return err('flashId is required');

	const flash = await db.prepare('SELECT * FROM flash WHERE id = ?').bind(flashId).first<DbFlash>();
	if (!flash) return err('No such flash', 404);
	if (flash.user_id !== u.id) return err('Forbidden', 403);

	await db.prepare('DELETE FROM flash_likes WHERE flash_id = ?').bind(flashId).run();
	await db.prepare('DELETE FROM flash WHERE id = ?').bind(flashId).run();

	return json({});
};

export const flashShow: Handler = async (db, body) => {
	const flashId = body.flashId as string | undefined;
	if (!flashId) return err('flashId is required');

	const flash = await db.prepare('SELECT * FROM flash WHERE id = ?').bind(flashId).first<DbFlash>();
	if (!flash) return err('No such flash', 404);

	const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(flash.user_id).first<DbUser>();

	return json(packFlash(flash, owner ? packUser(owner) : undefined));
};

export const flashUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const flashId = body.flashId as string | undefined;
	if (!flashId) return err('flashId is required');

	const flash = await db.prepare('SELECT * FROM flash WHERE id = ?').bind(flashId).first<DbFlash>();
	if (!flash) return err('No such flash', 404);
	if (flash.user_id !== u.id) return err('Forbidden', 403);

	const sets: string[] = [];
	const vals: unknown[] = [];

	if (typeof body.title === 'string') { sets.push('title = ?'); vals.push(body.title); }
	if (typeof body.summary === 'string') { sets.push('summary = ?'); vals.push(body.summary); }
	if (typeof body.script === 'string') { sets.push('script = ?'); vals.push(body.script); }
	if (typeof body.visibility === 'string') { sets.push('visibility = ?'); vals.push(body.visibility); }

	if (sets.length > 0) {
		sets.push('updated_at = ?');
		vals.push(new Date().toISOString());
		vals.push(flashId);
		await db.prepare(`UPDATE flash SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}

	const updated = await db.prepare('SELECT * FROM flash WHERE id = ?').bind(flashId).first<DbFlash>();
	return json(packFlash(updated!, packUser(u)));
};

export const flashLike: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const flashId = body.flashId as string | undefined;
	if (!flashId) return err('flashId is required');

	const id = generateId();
	const now = new Date().toISOString();

	try {
		await db.prepare(
			'INSERT INTO flash_likes (id, user_id, flash_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, flashId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already liked');
		throw e;
	}

	await db.prepare('UPDATE flash SET liked_count = liked_count + 1 WHERE id = ?').bind(flashId).run();

	return json({});
};

export const flashUnlike: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const flashId = body.flashId as string | undefined;
	if (!flashId) return err('flashId is required');

	const res = await db.prepare('DELETE FROM flash_likes WHERE user_id = ? AND flash_id = ?').bind(u.id, flashId).run();

	if (res.meta?.changes && res.meta.changes > 0) {
		await db.prepare('UPDATE flash SET liked_count = MAX(liked_count - 1, 0) WHERE id = ?').bind(flashId).run();
	}

	return json({});
};

export const flashMy: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT * FROM flash WHERE user_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM flash WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM flash WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all<DbFlash>();
	return json((rows.results ?? []).map(f => packFlash(f)));
};

export const flashMyLikes: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT fl.id AS fl_id, fl.created_at AS fl_created_at, f.* FROM flash_likes fl JOIN flash f ON f.id = fl.flash_id WHERE fl.user_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM flash_likes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND fl.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM flash_likes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND fl.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY fl.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();
	return json((rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.fl_id as string,
		flash: packFlash({
			id: r.id as string,
			user_id: r.user_id as string,
			title: r.title as string,
			summary: r.summary as string,
			script: r.script as string,
			visibility: r.visibility as string,
			liked_count: r.liked_count as number,
			created_at: r.created_at as string,
			updated_at: r.updated_at as string,
		}),
	})));
};

export const flashFeatured: Handler = async (db) => {
	const rows = await db.prepare(
		'SELECT * FROM flash WHERE visibility = \'public\' ORDER BY created_at DESC LIMIT 10',
	).all<DbFlash>();
	return json((rows.results ?? []).map(f => packFlash(f)));
};

export const usersFlashs: Handler = async (db, body) => {
	const userId = body.userId as string | undefined;
	if (!userId) return err('userId is required');

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT * FROM flash WHERE user_id = ? AND visibility = \'public\'';
	const params: unknown[] = [userId];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM flash WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM flash WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all<DbFlash>();
	return json((rows.results ?? []).map(f => packFlash(f)));
};
