/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DbUser, DbNote } from './types.js';

export function generateId(): string {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	let id = '';
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	for (const b of arr) id += chars[b % chars.length];
	return id;
}

export async function hashPassword(pw: string): Promise<string> {
	const data = new TextEncoder().encode(pw);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function cors(headers?: HeadersInit): Headers {
	const h = new Headers(headers);
	h.set('Access-Control-Allow-Origin', '*');
	h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	return h;
}

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: cors({ 'Content-Type': 'application/json' }),
	});
}

export function err(message: string, status = 400): Response {
	return json({ error: { message, code: status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST' } }, status);
}

export function packUser(u: DbUser, detail = false): Record<string, unknown> {
	const packed: Record<string, unknown> = {
		id: u.id,
		name: u.name || u.username,
		username: u.username,
		host: null,
		avatarUrl: u.avatar_url,
		isBot: false,
		isCat: false,
		onlineStatus: 'unknown',
		isAdmin: !!u.is_admin,
		isModerator: !!u.is_moderator,
		isSuspended: !!u.is_suspended,
		createdAt: u.created_at,
	};
	if (detail) {
		packed.description = u.description;
		packed.followersCount = 0;
		packed.followingCount = 0;
		packed.notesCount = 0;
		packed.avatarBlurhash = null;
		packed.bannerUrl = null;
		packed.bannerBlurhash = null;
		packed.fields = [];
		packed.pinnedNotes = [];
		packed.pinnedNoteIds = [];
	}
	return packed;
}

export async function packNote(db: D1Database, n: DbNote): Promise<Record<string, unknown>> {
	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(n.user_id).first<DbUser>();
	const reactions = await db.prepare('SELECT reaction, COUNT(*) as count FROM reactions WHERE note_id = ? GROUP BY reaction').bind(n.id).all();
	const reactionMap: Record<string, number> = {};
	for (const r of reactions.results ?? []) {
		reactionMap[r.reaction as string] = r.count as number;
	}
	return {
		id: n.id,
		createdAt: n.created_at,
		text: n.text,
		cw: n.cw,
		userId: n.user_id,
		user: user ? packUser(user) : null,
		visibility: n.visibility,
		replyId: n.reply_id,
		renoteId: n.renote_id,
		reactions: reactionMap,
		repliesCount: 0,
		renoteCount: 0,
		emojis: {},
		fileIds: [],
		files: [],
		localOnly: false,
	};
}

export async function getUser(db: D1Database, body: Record<string, unknown>): Promise<DbUser | null> {
	const token = (body.i ?? body.token ?? '') as string;
	if (!token) return null;
	const session = await db.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first<{ user_id: string }>();
	if (!session) return null;
	return db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<DbUser>();
}

export async function requireUser(db: D1Database, body: Record<string, unknown>): Promise<DbUser | Response> {
	const u = await getUser(db, body);
	if (!u) return err('Authentication required', 401);
	if (u.is_suspended) return err('Account is suspended', 403);
	return u;
}
