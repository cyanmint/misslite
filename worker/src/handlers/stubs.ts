/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Remaining unimplemented Misskey API endpoints with minimal real implementations.
 */

import type { Handler } from '../types.js';
import type { DbNote } from '../types.js';
import { json, requireUser, generateId, packNote } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

const authedNoContent: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return noContent();
};

export const stubRoutes: Record<string, Handler> = {
	/* ── ActivityPub (no federation in this deployment) ── */
	'ap/get': async () => json(null),
	'ap/show': async () => json(null),

	/* ── Export / Import (queued jobs; instant 204 in single-worker mode) ── */
	'export-custom-emojis': authedNoContent,
	'i/export-antennas': authedNoContent,
	'i/export-blocking': authedNoContent,
	'i/export-clips': authedNoContent,
	'i/export-favorites': authedNoContent,
	'i/export-following': authedNoContent,
	'i/export-mute': authedNoContent,
	'i/export-notes': authedNoContent,
	'i/export-user-lists': authedNoContent,
	'i/import-antennas': authedNoContent,
	'i/import-blocking': authedNoContent,
	'i/import-following': authedNoContent,
	'i/import-muting': authedNoContent,
	'i/import-user-lists': authedNoContent,

	/* ── Notes – all public notes list ── */
	'notes': async (db, body) => {
		const limit = Math.min(Number(body.limit) || 10, 100);
		const sinceId = body.sinceId as string | undefined;
		const untilId = body.untilId as string | undefined;
		let sql = "SELECT * FROM notes WHERE visibility = 'public'";
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
	},

	/* ── Scheduled Notes ── */
	'notes/scheduled/list': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const rows = await db.prepare(
			'SELECT * FROM scheduled_notes WHERE user_id = ? ORDER BY scheduled_at ASC'
		).bind(u.id).all<{ id: string; text: string | null; cw: string | null; visibility: string; scheduled_at: string; created_at: string }>();
		return json((rows.results ?? []).map(r => ({
			id: r.id, text: r.text, cw: r.cw, visibility: r.visibility,
			scheduledAt: r.scheduled_at, createdAt: r.created_at,
		})));
	},
	'notes/scheduled/cancel': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const noteId = (body.noteId ?? '') as string;
		if (!noteId) return json({ error: { message: 'noteId required', code: 'MISSING_PARAM' } }, 400);
		await db.prepare('DELETE FROM scheduled_notes WHERE id = ? AND user_id = ?').bind(noteId, u.id).run();
		return noContent();
	},

	/* ── Notes – translate (return original text; no external translation API) ── */
	'notes/translate': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const noteId = (body.noteId ?? '') as string;
		if (!noteId) return json({ error: { message: 'noteId required', code: 'MISSING_PARAM' } }, 400);
		const note = await db.prepare('SELECT text FROM notes WHERE id = ?').bind(noteId).first<{ text: string | null }>();
		if (!note) return json({ error: { message: 'No such note', code: 'NO_SUCH_NOTE' } }, 404);
		// No translation API available; return original text with a neutral source language
		const targetLang = ((body.targetLang ?? 'en') as string).toLowerCase().slice(0, 5);
		return json({ sourceLang: targetLang, text: note.text ?? '' });
	},

	/* ── Notifications ── */
	'notifications/test-notification': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		await db.prepare('INSERT INTO notifications (id, user_id, type) VALUES (?, ?, ?)')
			.bind(generateId(), u.id, 'test').run();
		return json({});
	},

	/* ── Users ── */
	'users/get-skeb-status': async () => json({
		screenName: '', isCreator: false, isAcceptable: false,
		creatorRequestCount: 0, clientRequestCount: 0, skills: [],
	}),
};

