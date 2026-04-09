import type { Handler } from '../types.js';
import type { DbAntenna } from '../types.js';
import { json, err, generateId, requireUser } from '../helpers.js';

function packAntenna(a: DbAntenna): Record<string, unknown> {
	return {
		id: a.id, createdAt: a.created_at, name: a.name,
		keywords: JSON.parse(a.keywords || '[]'),
		excludeKeywords: JSON.parse(a.exclude_keywords || '[]'),
		src: a.src, userListId: a.users_list_id,
		caseSensitive: !!a.case_sensitive, localOnly: !!a.local_only,
		excludeBots: !!a.exclude_bots, withReplies: !!a.with_replies,
		withFile: !!a.with_file, isActive: !!a.is_active,
		hasUnreadNote: false, notify: false,
	};
}

export const antennasCreate: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const name = body.name as string | undefined;
	if (!name) return err('name required');

	const src = (body.src ?? 'all') as string;
	const keywords = body.keywords ? JSON.stringify(body.keywords) : '[]';
	const excludeKeywords = body.excludeKeywords ? JSON.stringify(body.excludeKeywords) : '[]';
	const userListId = (body.userListId ?? null) as string | null;
	const caseSensitive = body.caseSensitive ? 1 : 0;
	const localOnly = body.localOnly ? 1 : 0;
	const excludeBots = body.excludeBots ? 1 : 0;
	const withReplies = body.withReplies ? 1 : 0;
	const withFile = body.withFile ? 1 : 0;

	const id = generateId();
	const now = new Date().toISOString();

	await db.prepare(
		`INSERT INTO antennas (id, user_id, name, src, keywords, exclude_keywords, users_list_id, case_sensitive, local_only, exclude_bots, with_replies, with_file, is_active, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
	).bind(id, u.id, name, src, keywords, excludeKeywords, userListId, caseSensitive, localOnly, excludeBots, withReplies, withFile, now).run();

	const antenna = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(id).first<DbAntenna>();
	if (!antenna) return err('Failed to create antenna', 500);

	return json(packAntenna(antenna));
};

export const antennasDelete: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const antennaId = body.antennaId as string | undefined;
	if (!antennaId) return err('antennaId required');

	const antenna = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(antennaId).first<DbAntenna>();
	if (!antenna) return err('No such antenna', 404);
	if (antenna.user_id !== u.id) return err('Forbidden', 403);

	await db.prepare('DELETE FROM antennas WHERE id = ?').bind(antennaId).run();

	return json({});
};

export const antennasShow: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const antennaId = body.antennaId as string | undefined;
	if (!antennaId) return err('antennaId required');

	const antenna = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(antennaId).first<DbAntenna>();
	if (!antenna) return err('No such antenna', 404);
	if (antenna.user_id !== u.id) return err('Forbidden', 403);

	return json(packAntenna(antenna));
};

export const antennasUpdate: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const antennaId = body.antennaId as string | undefined;
	if (!antennaId) return err('antennaId required');

	const antenna = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(antennaId).first<DbAntenna>();
	if (!antenna) return err('No such antenna', 404);
	if (antenna.user_id !== u.id) return err('Forbidden', 403);

	const sets: string[] = [];
	const vals: unknown[] = [];

	if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name as string); }
	if (body.src !== undefined) { sets.push('src = ?'); vals.push(body.src as string); }
	if (body.keywords !== undefined) { sets.push('keywords = ?'); vals.push(JSON.stringify(body.keywords)); }
	if (body.excludeKeywords !== undefined) { sets.push('exclude_keywords = ?'); vals.push(JSON.stringify(body.excludeKeywords)); }
	if (body.userListId !== undefined) { sets.push('users_list_id = ?'); vals.push(body.userListId as string | null); }
	if (body.caseSensitive !== undefined) { sets.push('case_sensitive = ?'); vals.push(body.caseSensitive ? 1 : 0); }
	if (body.localOnly !== undefined) { sets.push('local_only = ?'); vals.push(body.localOnly ? 1 : 0); }
	if (body.excludeBots !== undefined) { sets.push('exclude_bots = ?'); vals.push(body.excludeBots ? 1 : 0); }
	if (body.withReplies !== undefined) { sets.push('with_replies = ?'); vals.push(body.withReplies ? 1 : 0); }
	if (body.withFile !== undefined) { sets.push('with_file = ?'); vals.push(body.withFile ? 1 : 0); }
	if (body.isActive !== undefined) { sets.push('is_active = ?'); vals.push(body.isActive ? 1 : 0); }

	if (sets.length > 0) {
		vals.push(antennaId);
		await db.prepare(`UPDATE antennas SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}

	const updated = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(antennaId).first<DbAntenna>();
	if (!updated) return err('No such antenna', 404);

	return json(packAntenna(updated));
};

export const antennasList: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const rows = await db.prepare('SELECT * FROM antennas WHERE user_id = ?').bind(u.id).all<DbAntenna>();

	return json(rows.results.map(packAntenna));
};

export const antennasNotes: Handler = async (db, body, _env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const antennaId = body.antennaId as string | undefined;
	if (!antennaId) return err('antennaId required');

	const antenna = await db.prepare('SELECT * FROM antennas WHERE id = ?').bind(antennaId).first<DbAntenna>();
	if (!antenna) return err('No such antenna', 404);
	if (antenna.user_id !== u.id) return err('Forbidden', 403);

	// Antenna note matching requires background processing; return empty for now
	return json([]);
};
