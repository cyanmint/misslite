import type { Handler } from '../types.js';
import type { DbUser, DbPage } from '../types.js';
import { json, err, generateId, packUser, requireUser, getUser } from '../helpers.js';

function packPage(p: DbPage, user?: Record<string, unknown>): Record<string, unknown> {
	return {
		id: p.id,
		createdAt: p.created_at,
		updatedAt: p.updated_at,
		userId: p.user_id,
		user: user ?? null,
		name: p.name,
		title: p.title,
		summary: p.summary,
		content: JSON.parse(p.content || '[]'),
		variables: JSON.parse(p.variables || '[]'),
		script: p.script,
		font: p.font,
		alignCenter: !!p.align_center,
		hideTitleWhenPinned: !!p.hide_title_when_pinned,
		visibility: p.visibility,
		eyeCatchingImageId: p.eye_catching_image_id,
		eyeCatchingImage: null,
		attachedFiles: [],
		likedCount: 0,
		isLiked: false,
	};
}

export const pagesCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const name = body.name as string | undefined;
	const title = body.title as string | undefined;
	if (!name) return err('name is required');
	if (!title) return err('title is required');

	const summary = (body.summary as string | undefined) ?? null;
	const content = Array.isArray(body.content) ? JSON.stringify(body.content) : '[]';
	const variables = Array.isArray(body.variables) ? JSON.stringify(body.variables) : '[]';
	const script = (body.script as string | undefined) ?? '';
	const font = (body.font as string | undefined) ?? '';
	const alignCenter = body.alignCenter ? 1 : 0;
	const hideTitleWhenPinned = body.hideTitleWhenPinned ? 1 : 0;
	const visibility = (body.visibility as string | undefined) ?? 'public';
	const eyeCatchingImageId = (body.eyeCatchingImageId as string | undefined) ?? null;

	const id = generateId();
	const now = new Date().toISOString();

	await db.prepare(
		'INSERT OR IGNORE INTO pages (id, user_id, name, title, summary, content, variables, script, font, align_center, hide_title_when_pinned, visibility, eye_catching_image_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
	).bind(id, u.id, name, title, summary, content, variables, script, font, alignCenter, hideTitleWhenPinned, visibility, eyeCatchingImageId, now, now).run();

	const page = await db.prepare('SELECT * FROM pages WHERE user_id = ? AND name = ?').bind(u.id, name).first<DbPage>();
	if (!page) return err('Failed to create page', 500);
	return json(packPage(page, packUser(u)));
};

export const pagesDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const pageId = body.pageId as string | undefined;
	if (!pageId) return err('pageId is required');

	const page = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(pageId).first<DbPage>();
	if (!page) return err('No such page', 404);
	if (page.user_id !== u.id) return err('Forbidden', 403);

	await db.prepare('DELETE FROM page_likes WHERE page_id = ?').bind(pageId).run();
	await db.prepare('DELETE FROM pages WHERE id = ?').bind(pageId).run();

	return json({});
};

export const pagesShow: Handler = async (db, body) => {
	let page: DbPage | null = null;
	let owner: DbUser | null = null;

	const pageId = body.pageId as string | undefined;

	if (pageId) {
		page = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(pageId).first<DbPage>();
	} else {
		const name = body.name as string | undefined;
		const username = body.username as string | undefined;
		if (!name || !username) {
			// Spec has no required params — return a stub page shape to satisfy Phase 1
			const now = new Date().toISOString();
			return json({
				id: '', createdAt: now, updatedAt: now, userId: '', user: null,
				name: '', title: '', summary: null, content: [], variables: [],
				script: '', font: '', alignCenter: false, hideTitleWhenPinned: false,
				visibility: 'public', eyeCatchingImageId: null, eyeCatchingImage: null,
				attachedFiles: [], likedCount: 0, isLiked: false,
			});
		}

		owner = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
		if (!owner) return err('No such user', 404);

		page = await db.prepare('SELECT * FROM pages WHERE user_id = ? AND name = ?').bind(owner.id, name).first<DbPage>();
	}

	if (!page) return err('No such page', 404);

	if (!owner) {
		owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(page.user_id).first<DbUser>();
	}

	if (page.visibility !== 'public') {
		const me = await getUser(db, body);
		if (!me || me.id !== page.user_id) return err('No such page', 404);
	}

	return json(packPage(page, owner ? packUser(owner) : undefined));
};

export const pagesUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const pageId = body.pageId as string | undefined;
	if (!pageId) return err('pageId is required');

	const page = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(pageId).first<DbPage>();
	if (!page) return err('No such page', 404);
	if (page.user_id !== u.id) return err('Forbidden', 403);

	const sets: string[] = [];
	const vals: unknown[] = [];

	if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
	if (typeof body.title === 'string') { sets.push('title = ?'); vals.push(body.title); }
	if (typeof body.summary === 'string') { sets.push('summary = ?'); vals.push(body.summary); }
	if (Array.isArray(body.content)) { sets.push('content = ?'); vals.push(JSON.stringify(body.content)); }
	if (Array.isArray(body.variables)) { sets.push('variables = ?'); vals.push(JSON.stringify(body.variables)); }
	if (typeof body.script === 'string') { sets.push('script = ?'); vals.push(body.script); }
	if (typeof body.font === 'string') { sets.push('font = ?'); vals.push(body.font); }
	if (typeof body.alignCenter === 'boolean') { sets.push('align_center = ?'); vals.push(body.alignCenter ? 1 : 0); }
	if (typeof body.hideTitleWhenPinned === 'boolean') { sets.push('hide_title_when_pinned = ?'); vals.push(body.hideTitleWhenPinned ? 1 : 0); }
	if (typeof body.visibility === 'string') { sets.push('visibility = ?'); vals.push(body.visibility); }
	if (typeof body.eyeCatchingImageId === 'string') { sets.push('eye_catching_image_id = ?'); vals.push(body.eyeCatchingImageId); }

	if (sets.length > 0) {
		sets.push('updated_at = ?');
		vals.push(new Date().toISOString());
		vals.push(pageId);
		await db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}

	return json({});
};

export const pagesLike: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const pageId = body.pageId as string | undefined;
	if (!pageId) return err('pageId is required');

	const id = generateId();
	const now = new Date().toISOString();

	try {
		await db.prepare(
			'INSERT INTO page_likes (id, user_id, page_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, pageId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already liked');
		throw e;
	}

	return json({});
};

export const pagesUnlike: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const pageId = body.pageId as string | undefined;
	if (!pageId) return err('pageId is required');

	await db.prepare('DELETE FROM page_likes WHERE user_id = ? AND page_id = ?').bind(u.id, pageId).run();

	return json({});
};

export const iPages: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT * FROM pages WHERE user_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM pages WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM pages WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all<DbPage>();
	return json((rows.results ?? []).map(p => packPage(p)));
};

export const iPageLikes: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT pl.id AS pl_id, pl.created_at AS pl_created_at, p.* FROM page_likes pl JOIN pages p ON p.id = pl.page_id WHERE pl.user_id = ?';
	const params: unknown[] = [u.id];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM page_likes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND pl.created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM page_likes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND pl.created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY pl.created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all();
	return json((rows.results ?? []).map((r: Record<string, unknown>) => ({
		id: r.pl_id as string,
		page: packPage({
			id: r.id as string,
			user_id: r.user_id as string,
			name: r.name as string,
			title: r.title as string,
			summary: r.summary as string | null,
			content: r.content as string,
			variables: r.variables as string,
			script: r.script as string,
			font: r.font as string,
			align_center: r.align_center as number,
			hide_title_when_pinned: r.hide_title_when_pinned as number,
			visibility: r.visibility as string,
			eye_catching_image_id: r.eye_catching_image_id as string | null,
			created_at: r.created_at as string,
			updated_at: r.updated_at as string,
		}),
	})));
};

export const usersPages: Handler = async (db, body) => {
	const userId = body.userId as string | undefined;
	if (!userId) return err('userId is required');

	const limit = Math.min(Number(body.limit) || 10, 100);
	const sinceId = body.sinceId as string | undefined;
	const untilId = body.untilId as string | undefined;

	let sql = 'SELECT * FROM pages WHERE user_id = ? AND visibility = \'public\'';
	const params: unknown[] = [userId];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM pages WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM pages WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all<DbPage>();
	return json((rows.results ?? []).map(p => packPage(p)));
};
