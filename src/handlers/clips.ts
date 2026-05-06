import type { Handler } from '../types.js';
import type { DbUser, DbClip, DbNote } from '../types.js';
import { json, err, generateId, packUser, packNote, requireUser, getUser } from '../helpers.js';

function packClip(c: DbClip, user?: Record<string, unknown>): Record<string, unknown> {
	return {
		id: c.id, createdAt: c.created_at, name: c.name,
		isPublic: !!c.is_public, description: c.description,
		userId: c.user_id, user: user ?? null,
		favoritedCount: 0, isFavorited: false,
		notesCount: 0, lastClippedAt: null,
	};
}

// clips/create
export const clipsCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const name = body.name as string | undefined;
	if (!name) return err('name is required');

	const isPublic = body.isPublic ? 1 : 0;
	const description = (body.description as string | undefined) ?? null;
	const id = generateId();
	const now = new Date().toISOString();

	await db.prepare(
		'INSERT INTO clips (id, user_id, name, is_public, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
	).bind(id, u.id, name, isPublic, description, now).run();

	const clip: DbClip = { id, user_id: u.id, name, is_public: isPublic, description, created_at: now };
	return json(packClip(clip, packUser(u)));
};

// clips/delete
export const clipsDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');
	if (clip.user_id !== u.id) return err('You do not own this clip', 403);

	await db.prepare('DELETE FROM clip_notes WHERE clip_id = ?').bind(clipId).run();
	await db.prepare('DELETE FROM clip_favorites WHERE clip_id = ?').bind(clipId).run();
	await db.prepare('DELETE FROM clips WHERE id = ?').bind(clipId).run();

	return json({});
};

// clips/show
export const clipsShow: Handler = async (db, body) => {
	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');

	if (!clip.is_public) {
		const u = await requireUser(db, body);
		if (u instanceof Response) return u;
		if (clip.user_id !== u.id) return err('Clip not found', 403);
	}

	const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(clip.user_id).first<DbUser>();
	return json(packClip(clip, owner ? packUser(owner) : undefined));
};

// clips/update
export const clipsUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');
	if (clip.user_id !== u.id) return err('You do not own this clip', 403);

	const name = (body.name as string | undefined) ?? clip.name;
	const isPublic = body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : clip.is_public;
	const description = body.description !== undefined ? (body.description as string | null) : clip.description;

	await db.prepare(
		'UPDATE clips SET name = ?, is_public = ?, description = ? WHERE id = ?',
	).bind(name, isPublic, description, clipId).run();

	const updated: DbClip = { ...clip, name, is_public: isPublic, description };
	return json(packClip(updated, packUser(u)));
};

// clips/list
export const clipsList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clips = await db.prepare('SELECT * FROM clips WHERE user_id = ? ORDER BY created_at DESC').bind(u.id).all<DbClip>();
	const packed = (clips.results ?? []).map(c => packClip(c, packUser(u)));
	return json(packed);
};

// clips/add-note
export const clipsAddNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	const noteId = body.noteId as string | undefined;
	if (!clipId) return err('clipId is required');
	if (!noteId) return err('noteId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');
	if (clip.user_id !== u.id) return err('You do not own this clip', 403);

	const id = generateId();
	const now = new Date().toISOString();
	try {
		await db.prepare(
			'INSERT INTO clip_notes (id, clip_id, note_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, clipId, noteId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already clipped');
		throw e;
	}

	return json({});
};

// clips/remove-note
export const clipsRemoveNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	const noteId = body.noteId as string | undefined;
	if (!clipId) return err('clipId is required');
	if (!noteId) return err('noteId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');
	if (clip.user_id !== u.id) return err('You do not own this clip', 403);

	await db.prepare('DELETE FROM clip_notes WHERE clip_id = ? AND note_id = ?').bind(clipId, noteId).run();

	return json({});
};

// clips/notes
export const clipsNotes: Handler = async (db, body) => {
	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(clipId).first<DbClip>();
	if (!clip) return err('Clip not found');

	if (!clip.is_public) {
		const u = await requireUser(db, body);
		if (u instanceof Response) return u;
		if (clip.user_id !== u.id) return err('Clip not found', 403);
	}

	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;

	const notes = await db.prepare(
		'SELECT n.* FROM clip_notes cn JOIN notes n ON n.id = cn.note_id WHERE cn.clip_id = ? ORDER BY cn.created_at DESC LIMIT ? OFFSET ?',
	).bind(clipId, limit, offset).all<DbNote>();

	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

// clips/favorite
export const clipsFavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	const id = generateId();
	const now = new Date().toISOString();
	try {
		await db.prepare(
			'INSERT INTO clip_favorites (id, user_id, clip_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, clipId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return err('Already favorited');
		throw e;
	}

	return json({});
};

// clips/unfavorite
export const clipsUnfavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clipId = body.clipId as string | undefined;
	if (!clipId) return err('clipId is required');

	await db.prepare('DELETE FROM clip_favorites WHERE user_id = ? AND clip_id = ?').bind(u.id, clipId).run();

	return json({});
};

// clips/my-favorites
export const clipsMyFavorites: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const rows = await db.prepare(
		'SELECT c.* FROM clip_favorites cf JOIN clips c ON c.id = cf.clip_id WHERE cf.user_id = ? ORDER BY cf.created_at DESC',
	).bind(u.id).all<DbClip>();

	const packed = (rows.results ?? []).map(c => packClip(c));
	return json(packed);
};

// i/clips (same as clipsList)
export const iClips: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const clips = await db.prepare('SELECT * FROM clips WHERE user_id = ? ORDER BY created_at DESC').bind(u.id).all<DbClip>();
	const packed = (clips.results ?? []).map(c => packClip(c, packUser(u)));
	return json(packed);
};

// users/clips
export const usersClips: Handler = async (db, body) => {
	const userId = body.userId as string | undefined;
	if (!userId) return err('userId is required');

	const clips = await db.prepare(
		'SELECT * FROM clips WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC',
	).bind(userId).all<DbClip>();

	const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
	const packedUser = owner ? packUser(owner) : undefined;
	const packed = (clips.results ?? []).map(c => packClip(c, packedUser));
	return json(packed);
};

// notes/clips
export const notesClips: Handler = async (db, body) => {
	const noteId = body.noteId as string | undefined;
	if (!noteId) return err('noteId is required');

	const clips = await db.prepare(
		'SELECT c.* FROM clip_notes cn JOIN clips c ON c.id = cn.clip_id WHERE cn.note_id = ? AND c.is_public = 1 ORDER BY c.created_at DESC',
	).bind(noteId).all<DbClip>();

	const packed = (clips.results ?? []).map(c => packClip(c));
	return json(packed);
};
