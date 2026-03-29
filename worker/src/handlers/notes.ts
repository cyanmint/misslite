/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbNote } from '../types.js';
import { json, err, generateId, packNote, requireUser } from '../helpers.js';

export const createNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const text = (body.text ?? '') as string;
	const cw = (body.cw ?? null) as string | null;
	const visibility = (body.visibility ?? 'public') as string;
	const replyId = (body.replyId ?? null) as string | null;
	const renoteId = (body.renoteId ?? null) as string | null;

	if (!text && !renoteId) return err('Text or renoteId required');

	const id = generateId();
	await db.prepare(
		'INSERT INTO notes (id, user_id, text, cw, visibility, reply_id, renote_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(id, u.id, text || null, cw, visibility, replyId, renoteId).run();

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

export const deleteNote: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<DbNote>();
	if (!note) return err('No such note', 404);
	if (note.user_id !== u.id && !u.is_admin && !u.is_moderator) return err('Forbidden', 403);

	await db.prepare('DELETE FROM reactions WHERE note_id = ?').bind(noteId).run();
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

export const createReaction: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const noteId = body.noteId as string;
	const reaction = (body.reaction ?? '❤') as string;
	if (!noteId) return err('noteId required');

	const note = await db.prepare('SELECT id FROM notes WHERE id = ?').bind(noteId).first();
	if (!note) return err('No such note', 404);

	const id = generateId();
	try {
		await db.prepare('INSERT INTO reactions (id, note_id, user_id, reaction) VALUES (?, ?, ?, ?)')
			.bind(id, noteId, u.id, reaction).run();
	} catch {
		return err('Already reacted');
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
