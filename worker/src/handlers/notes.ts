/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbNote } from '../types.js';
import { json, err, generateId, packNote, requireUser, getUser } from '../helpers.js';

export const createNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const text = (body.text ?? '') as string;
	const cw = (body.cw ?? null) as string | null;
	const visibility = (body.visibility ?? 'public') as string;
	const replyId = (body.replyId ?? null) as string | null;
	const renoteId = (body.renoteId ?? null) as string | null;

	if (!text && !renoteId) {
		// Allow empty note creation; text will be stored as null
	}

	const id = generateId();
	await db.prepare(
		'INSERT INTO notes (id, user_id, text, cw, visibility, reply_id, renote_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(id, u.id, text || null, cw, visibility, replyId, renoteId).run();

	// Notify mentioned users (@username)
	if (text) {
		const mentions = [...text.matchAll(/@([a-zA-Z0-9_]{1,20})/g)].map(m => m[1].toLowerCase());
		const unique = [...new Set(mentions)];
		for (const username of unique) {
			const mentioned = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
			if (mentioned && mentioned.id !== u.id) {
				await db.prepare(
					'INSERT INTO notifications (id, user_id, type, notifier_id, note_id) VALUES (?, ?, \'mention\', ?, ?)'
				).bind(generateId(), mentioned.id, u.id, id).run();
			}
		}
	}
	// Notify parent note author of the reply
	if (replyId) {
		const parentNote = await db.prepare('SELECT user_id FROM notes WHERE id = ?').bind(replyId).first<{ user_id: string }>();
		if (parentNote && parentNote.user_id !== u.id) {
			await db.prepare(
				'INSERT INTO notifications (id, user_id, type, notifier_id, note_id) VALUES (?, ?, \'reply\', ?, ?)'
			).bind(generateId(), parentNote.user_id, u.id, id).run();
		}
	}

	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<DbNote>();
	const packed = await packNote(db, note!);
	return json({ createdNote: packed });
};

export const showNote: Handler = async (db, body) => {
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	if (!note) return err('No such note', 404);
	return json(await packNote(db, note));
};

export const showPartialBulk: Handler = async (db, body) => {
	const noteIds = body.noteIds as string[] | undefined;
	if (!Array.isArray(noteIds) || noteIds.length === 0) return json({});
	// Return a map of noteId → packed note (only for notes that exist)
	const result: Record<string, unknown> = {};
	for (const id of noteIds.slice(0, 100)) {
		const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<DbNote>();
		if (note) result[id] = await packNote(db, note);
	}
	return json(result);
};

export const deleteNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	if (!note) return err('No such note', 404);
	if (note.user_id !== u.id && !u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	await db.prepare('DELETE FROM reactions WHERE note_id = ?').bind(noteId).run();
	await db.prepare('DELETE FROM favorites WHERE note_id = ?').bind(noteId).run();
	await db.prepare('DELETE FROM notifications WHERE note_id = ?').bind(noteId).run();
	await db.prepare('DELETE FROM notes WHERE id = ?').bind(noteId).run();
	return json({});
};

export const timeline: Handler = async (db, body) => {
	const limit = Math.min(Number(body.limit) || 10, 100);
	const untilId = body.untilId as string | undefined;
	const sinceId = body.sinceId as string | undefined;

	let sql = 'SELECT * FROM notes WHERE visibility = \'public\'';
	const params: unknown[] = [];

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}

	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const notes = await db.prepare(sql).bind(...params).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

export const userNotes: Handler = async (db, body) => {
	const userId = body.userId as string;
	if (!userId) return err('userId required');
	const limit = Math.min(Number(body.limit) || 10, 100);

	const notes = await db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
		.bind(userId, limit).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

export const searchNotes: Handler = async (db, body) => {
	const query = ((body.query ?? '') as string).trim();
	if (!query) return err('query required');
	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;
	const pattern = '%' + query.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
	const notes = await db.prepare(
		"SELECT * FROM notes WHERE visibility = 'public' AND text LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
	).bind(pattern, limit, offset).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

export const noteState: Handler = async (db, body) => {
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const u = await getUser(db, body);
	if (!u) return json({ isFavorited: false, isWatching: false, isMutedThread: false, myReaction: null });

	const fav = await db.prepare('SELECT id FROM favorites WHERE user_id = ? AND note_id = ?').bind(u.id, noteId).first();
	const reaction = await db.prepare('SELECT reaction FROM reactions WHERE user_id = ? AND note_id = ?').bind(u.id, noteId).first<{ reaction: string }>();
	return json({
		isFavorited: !!fav,
		isWatching: false,
		isMutedThread: false,
		myReaction: reaction?.reaction ?? null,
	});
};

export const noteMentions: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const limit = Math.min(Number(body.limit) || 10, 100);
	const pattern = `%@${u.username}%`;
	const notes = await db.prepare(
		"SELECT * FROM notes WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?"
	).bind(pattern, limit).all<DbNote>();
	const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
	return json(packed);
};

export const noteConversation: Handler = async (db, body) => {
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const limit = Math.min(Number(body.limit) || 10, 30);
	const chain: DbNote[] = [];
	let current = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	while (current?.reply_id && chain.length < limit) {
		const parent = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(current.reply_id).first<DbNote>();
		if (!parent) break;
		chain.push(parent);
		current = parent;
	}
	const packed = await Promise.all(chain.map(n => packNote(db, n)));
	return json(packed);
};

export const createReaction: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	const reaction = (body.reaction ?? '❤') as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT id, user_id FROM notes WHERE id = ?').bind(noteId).first<{ id: string; user_id: string }>();
	if (!note) return err('No such note', 404);

	const id = generateId();
	try {
		await db.prepare('INSERT INTO reactions (id, note_id, user_id, reaction) VALUES (?, ?, ?, ?)')
			.bind(id, noteId, u.id, reaction).run();
	} catch {
		return err('Already reacted');
	}

	// Notify note author
	if (note.user_id !== u.id) {
		await db.prepare(
			'INSERT INTO notifications (id, user_id, type, notifier_id, note_id, reaction) VALUES (?, ?, \'reaction\', ?, ?, ?)'
		).bind(generateId(), note.user_id, u.id, noteId, reaction).run();
	}
	return json({});
};

export const deleteReaction: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');

	await db.prepare('DELETE FROM reactions WHERE note_id = ? AND user_id = ?')
		.bind(noteId, u.id).run();
	return json({});
};

export const listReactions: Handler = async (db, body) => {
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const limit = Math.min(Number(body.limit) || 10, 100);
	const reactions = await db.prepare(
		'SELECT r.*, u.id as uid, u.username, u.name, u.avatar_url FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.note_id = ? ORDER BY r.created_at ASC LIMIT ?'
	).bind(noteId, limit).all();
	return json((reactions.results ?? []).map((r: any) => ({
		id: r.id,
		createdAt: r.created_at,
		user: { id: r.uid, username: r.username, name: r.name || r.username, avatarUrl: r.avatar_url },
		type: r.reaction,
	})));
};

export const createFavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	const note = await db.prepare('SELECT id FROM notes WHERE id = ?').bind(noteId).first();
	if (!note) return err('No such note', 404);
	try {
		await db.prepare('INSERT INTO favorites (id, user_id, note_id) VALUES (?, ?, ?)').bind(generateId(), u.id, noteId).run();
	} catch {
		return err('Already favorited');
	}
	return json({});
};

export const deleteFavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');
	await db.prepare('DELETE FROM favorites WHERE user_id = ? AND note_id = ?').bind(u.id, noteId).run();
	return json({});
};

export const listFavorites: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const limit = Math.min(Number(body.limit) || 10, 100);
	const favs = await db.prepare(
		'SELECT f.note_id FROM favorites f WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT ?'
	).bind(u.id, limit).all<{ note_id: string }>();
	const packed = await Promise.all((favs.results ?? []).map(async f => {
		const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(f.note_id).first<DbNote>();
		return note ? packNote(db, note) : null;
	}));
	return json(packed.filter(Boolean));
};

// ── Additional note endpoints ─────────────────────────────────────────────────

export const notesChildren: Handler = async (db, body) => {
const noteId = body.noteId as string;
if (!noteId) return err('noteId required');
const limit = Math.min(Number(body.limit) || 10, 100);
const notes = await db.prepare('SELECT * FROM notes WHERE reply_id = ? ORDER BY created_at DESC LIMIT ?')
.bind(noteId, limit).all<DbNote>();
const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
return json(packed);
};

export const notesReplies: Handler = async (db, body) => {
const noteId = body.noteId as string;
if (!noteId) return err('noteId required');
const limit = Math.min(Number(body.limit) || 10, 100);
const notes = await db.prepare('SELECT * FROM notes WHERE reply_id = ? ORDER BY created_at DESC LIMIT ?')
.bind(noteId, limit).all<DbNote>();
const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
return json(packed);
};

export const notesRenotes: Handler = async (db, body) => {
const noteId = body.noteId as string;
if (!noteId) return err('noteId required');
const limit = Math.min(Number(body.limit) || 10, 100);
const notes = await db.prepare('SELECT * FROM notes WHERE renote_id = ? ORDER BY created_at DESC LIMIT ?')
.bind(noteId, limit).all<DbNote>();
const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
return json(packed);
};

export const deleteRenote: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const noteId = body.noteId as string;
if (!noteId) return err('noteId required');
await db.prepare('DELETE FROM notes WHERE renote_id = ? AND user_id = ? AND text IS NULL')
.bind(noteId, u.id).run();
return json({});
};

export const searchByTag: Handler = async (db, body) => {
const tag = ((body.tag ?? '') as string).trim();
if (!tag) return err('tag required');
const limit = Math.min(Number(body.limit) || 10, 100);
const pattern = '%#' + tag.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
const notes = await db.prepare(
"SELECT * FROM notes WHERE visibility = 'public' AND text LIKE ? ORDER BY created_at DESC LIMIT ?"
).bind(pattern, limit).all<DbNote>();
const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
return json(packed);
};

export const threadMuteCreate: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const noteId = (body.noteId ?? '') as string;
if (!noteId) return err('noteId required');
const { generateId: genId } = await import('../helpers.js');
try {
await db.prepare('INSERT INTO thread_muting (id, user_id, thread_id) VALUES (?, ?, ?)')
.bind(genId(), u.id, noteId).run();
} catch { /* already muted */ }
return json({});
};

export const threadMuteDelete: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const noteId = (body.noteId ?? '') as string;
if (!noteId) return err('noteId required');
await db.prepare('DELETE FROM thread_muting WHERE user_id = ? AND thread_id = ?')
.bind(u.id, noteId).run();
return json({});
};
