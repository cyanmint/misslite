/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, generateId, requireUser, packUser } from '../helpers.js';

type DbChatMessage = {
	id: string;
	from_user_id: string;
	to_user_id: string | null;
	to_room_id: string | null;
	text: string | null;
	file_id: string | null;
	is_read: number;
	created_at: string;
};

type DbChatRoom = {
	id: string;
	owner_id: string;
	name: string;
	description: string;
	created_at: string;
};

async function packChatMessage(db: D1Database, m: DbChatMessage, viewerId: string): Promise<Record<string, unknown>> {
	const fromUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(m.from_user_id).first<DbUser>();
	let toUser: Record<string, unknown> | null = null;
	if (m.to_user_id) {
		const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(m.to_user_id).first<DbUser>();
		if (u) toUser = packUser(u);
	}
	let toRoom: Record<string, unknown> | null = null;
	if (m.to_room_id) {
		const r = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(m.to_room_id).first<DbChatRoom>();
		if (r) {
			const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.owner_id).first<DbUser>();
			toRoom = { id: r.id, createdAt: r.created_at, ownerId: r.owner_id, owner: owner ? packUser(owner) : null, name: r.name, description: r.description, isMuted: false };
		}
	}
	// isRead: for 1-on-1, only the recipient's perspective matters (sender always "read" their own message)
	const isRead = m.to_user_id
		? (m.from_user_id === viewerId || (m.to_user_id === viewerId && !!m.is_read))
		: !!m.is_read;
	return {
		id: m.id,
		createdAt: m.created_at,
		fromUserId: m.from_user_id,
		fromUser: fromUser ? packUser(fromUser) : null,
		toUserId: m.to_user_id,
		toUser,
		toRoomId: m.to_room_id,
		toRoom,
		text: m.text,
		fileId: m.file_id,
		file: null,
		isRead,
		reactions: [],
	};
}

// ── 1-on-1 messages ───────────────────────────────────────────────────────────

/**
 * GET /chat/messages — list 1-on-1 messages between the current user and userId.
 */
export const chatMessages: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const userId = (body.userId ?? '') as string;
	const roomId = (body.roomId ?? '') as string;
	const limit = Math.min(Number(body.limit) || 30, 100);
	const untilId = (body.untilId ?? '') as string;
	const sinceId = (body.sinceId ?? '') as string;

	if (!userId && !roomId) return err('userId or roomId required');

	let sql: string;
	const params: unknown[] = [];

	if (userId) {
		// 1-on-1 conversation between the current user and the target user
		sql = 'SELECT * FROM chat_messages WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))';
		params.push(u.id, userId, userId, u.id);
	} else {
		// Room messages
		// Check membership
		const member = await db.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?').bind(roomId, u.id).first();
		if (!member) return err('Not a member of this room', 403);
		sql = 'SELECT * FROM chat_messages WHERE to_room_id = ?';
		params.push(roomId);
	}

	if (untilId) {
		const ref = await db.prepare('SELECT created_at FROM chat_messages WHERE id = ?').bind(untilId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
	}
	if (sinceId) {
		const ref = await db.prepare('SELECT created_at FROM chat_messages WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
		if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
	}
	sql += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);

	const rows = await db.prepare(sql).bind(...params).all<DbChatMessage>();
	const packed = await Promise.all((rows.results ?? []).map(m => packChatMessage(db, m, u.id)));
	return json(packed);
};

/**
 * POST /chat/messages/create — send a 1-on-1 or room message.
 */
export const chatMessagesCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const toUserId = (body.userId ?? body.toUserId ?? '') as string;
	const toRoomId = (body.roomId ?? body.toRoomId ?? '') as string;
	const text = (body.text ?? null) as string | null;
	const fileId = (body.fileId ?? null) as string | null;

	if (!toUserId && !toRoomId) return err('userId or roomId required');
	if (!text && !fileId) return err('text or fileId required');

	if (toUserId) {
		if (toUserId === u.id) return err('Cannot message yourself');
		const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(toUserId).first();
		if (!target) return err('No such user', 404);
	}

	if (toRoomId) {
		const member = await db.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?').bind(toRoomId, u.id).first();
		if (!member) return err('Not a member of this room', 403);
	}

	const id = generateId();
	await db.prepare(
		'INSERT INTO chat_messages (id, from_user_id, to_user_id, to_room_id, text, file_id) VALUES (?, ?, ?, ?, ?, ?)'
	).bind(id, u.id, toUserId || null, toRoomId || null, text, fileId).run();

	// Notify recipient for 1-on-1 messages
	if (toUserId) {
		await db.prepare(
			"INSERT INTO notifications (id, user_id, type, notifier_id) VALUES (?, ?, 'chat', ?)"
		).bind(generateId(), toUserId, u.id).run();
	}

	const msg = await db.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(id).first<DbChatMessage>();
	return json(await packChatMessage(db, msg!, u.id));
};

/**
 * POST /chat/messages/delete — delete a message (sender only).
 */
export const chatMessagesDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const messageId = (body.messageId ?? '') as string;
	if (!messageId) return err('messageId required');

	const msg = await db.prepare('SELECT * FROM chat_messages WHERE id = ?').bind(messageId).first<DbChatMessage>();
	if (!msg) return err('No such message', 404);
	if (msg.from_user_id !== u.id && !u.is_admin) return err('Forbidden', 403);

	await db.prepare('DELETE FROM chat_messages WHERE id = ?').bind(messageId).run();
	return json({});
};

/**
 * POST /chat/messages/read — mark a 1-on-1 conversation or room as read.
 */
export const chatMessagesRead: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const userId = (body.userId ?? '') as string;
	const roomId = (body.roomId ?? '') as string;
	const messageId = (body.messageId ?? '') as string;

	if (messageId) {
		await db.prepare('UPDATE chat_messages SET is_read = 1 WHERE id = ? AND to_user_id = ?')
			.bind(messageId, u.id).run();
	} else if (userId) {
		await db.prepare('UPDATE chat_messages SET is_read = 1 WHERE from_user_id = ? AND to_user_id = ?')
			.bind(userId, u.id).run();
	} else if (roomId) {
		await db.prepare('UPDATE chat_messages SET is_read = 1 WHERE to_room_id = ?')
			.bind(roomId).run();
	}
	return json({});
};

/**
 * POST /chat/history — recent conversations the user is part of.
 * Returns one representative (latest) message per conversation partner or room.
 */
export const chatHistory: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const limit = Math.min(Number(body.limit) || 20, 100);

	// 1-on-1: find distinct conversation partners and get latest message per pair
	const rows1on1 = await db.prepare(`
		SELECT m.*
		FROM chat_messages m
		INNER JOIN (
			SELECT
				CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS partner_id,
				MAX(created_at) AS latest
			FROM chat_messages
			WHERE (from_user_id = ? OR to_user_id = ?) AND to_room_id IS NULL
			GROUP BY partner_id
		) latest_msg ON (
			((m.from_user_id = ? AND m.to_user_id = latest_msg.partner_id) OR
			 (m.from_user_id = latest_msg.partner_id AND m.to_user_id = ?))
			AND m.created_at = latest_msg.latest
		)
		ORDER BY m.created_at DESC
		LIMIT ?
	`).bind(u.id, u.id, u.id, u.id, u.id, limit).all<DbChatMessage>();

	// Room messages: latest per room
	const roomRows = await db.prepare(`
		SELECT m.*
		FROM chat_messages m
		INNER JOIN chat_room_members mem ON mem.room_id = m.to_room_id AND mem.user_id = ?
		INNER JOIN (
			SELECT to_room_id, MAX(created_at) AS latest
			FROM chat_messages
			WHERE to_room_id IS NOT NULL
			GROUP BY to_room_id
		) latest_room ON m.to_room_id = latest_room.to_room_id AND m.created_at = latest_room.latest
		ORDER BY m.created_at DESC
		LIMIT ?
	`).bind(u.id, limit).all<DbChatMessage>();

	const all = [...(rows1on1.results ?? []), ...(roomRows.results ?? [])];
	all.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

	const packed = await Promise.all(all.slice(0, limit).map(m => packChatMessage(db, m, u.id)));
	return json(packed);
};

// ── Chat rooms ────────────────────────────────────────────────────────────────

async function packRoom(db: D1Database, r: DbChatRoom, viewerId: string): Promise<Record<string, unknown>> {
	const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.owner_id).first<DbUser>();
	const memberRow = await db.prepare('SELECT is_muted FROM chat_room_members WHERE room_id = ? AND user_id = ?')
		.bind(r.id, viewerId).first<{ is_muted: number }>();
	return {
		id: r.id,
		createdAt: r.created_at,
		ownerId: r.owner_id,
		owner: owner ? packUser(owner) : null,
		name: r.name,
		description: r.description,
		isMuted: !!(memberRow?.is_muted),
	};
}

export const chatRooms: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const rows = await db.prepare(
		'SELECT r.* FROM chat_rooms r JOIN chat_room_members m ON m.room_id = r.id WHERE m.user_id = ? ORDER BY r.created_at DESC'
	).bind(u.id).all<DbChatRoom>();
	const packed = await Promise.all((rows.results ?? []).map(r => packRoom(db, r, u.id)));
	return json(packed);
};

export const chatRoomsCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const name = ((body.name ?? '') as string).trim();
	const description = ((body.description ?? '') as string).trim();
	if (!name) return err('name required');

	const id = generateId();
	await db.prepare('INSERT INTO chat_rooms (id, owner_id, name, description) VALUES (?, ?, ?, ?)')
		.bind(id, u.id, name, description).run();
	// Owner is automatically a member
	await db.prepare('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)')
		.bind(id, u.id).run();

	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(id).first<DbChatRoom>();
	return json(await packRoom(db, room!, u.id));
};

export const chatRoomsShow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	if (!room) return err('No such room', 404);
	const member = await db.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?')
		.bind(roomId, u.id).first();
	if (!member && room.owner_id !== u.id) return err('Not a member of this room', 403);
	return json(await packRoom(db, room, u.id));
};

export const chatRoomsUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	if (!room) return err('No such room', 404);
	if (room.owner_id !== u.id && !u.is_admin) return err('Forbidden', 403);
	const name = ((body.name ?? room.name) as string).trim();
	const description = ((body.description ?? room.description) as string).trim();
	await db.prepare('UPDATE chat_rooms SET name = ?, description = ? WHERE id = ?')
		.bind(name, description, roomId).run();
	const updated = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	return json(await packRoom(db, updated!, u.id));
};

export const chatRoomsDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	if (!room) return err('No such room', 404);
	if (room.owner_id !== u.id && !u.is_admin) return err('Forbidden', 403);
	await db.prepare('DELETE FROM chat_messages WHERE to_room_id = ?').bind(roomId).run();
	await db.prepare('DELETE FROM chat_room_members WHERE room_id = ?').bind(roomId).run();
	await db.prepare('DELETE FROM chat_rooms WHERE id = ?').bind(roomId).run();
	return json({});
};

export const chatRoomsInvite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	const userId = (body.userId ?? '') as string;
	if (!roomId) return err('roomId required');
	if (!userId) return err('userId required');
	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	if (!room) return err('No such room', 404);
	if (room.owner_id !== u.id && !u.is_admin) return err('Forbidden', 403);
	const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
	if (!target) return err('No such user', 404);
	try {
		await db.prepare('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)')
			.bind(roomId, userId).run();
	} catch { /* already a member */ }
	return json({});
};

export const chatRoomsKick: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	const userId = (body.userId ?? '') as string;
	if (!roomId) return err('roomId required');
	if (!userId) return err('userId required');
	const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first<DbChatRoom>();
	if (!room) return err('No such room', 404);
	if (room.owner_id !== u.id && !u.is_admin) return err('Forbidden', 403);
	await db.prepare('DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?')
		.bind(roomId, userId).run();
	return json({});
};

export const chatRoomsLeave: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	await db.prepare('DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?')
		.bind(roomId, u.id).run();
	return json({});
};

export const chatRoomsMembers: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	const member = await db.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?')
		.bind(roomId, u.id).first();
	if (!member) return err('Not a member of this room', 403);
	const rows = await db.prepare(
		'SELECT m.user_id, m.is_muted, m.joined_at FROM chat_room_members m WHERE m.room_id = ? ORDER BY m.joined_at ASC'
	).bind(roomId).all<{ user_id: string; is_muted: number; joined_at: string }>();
	const packed = await Promise.all((rows.results ?? []).map(async m => {
		const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(m.user_id).first<DbUser>();
		return { user: user ? packUser(user) : null, isMuted: !!m.is_muted, joinedAt: m.joined_at };
	}));
	return json(packed);
};

export const chatRoomsMute: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	await db.prepare('UPDATE chat_room_members SET is_muted = 1 WHERE room_id = ? AND user_id = ?')
		.bind(roomId, u.id).run();
	return json({});
};

export const chatRoomsUnmute: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const roomId = (body.roomId ?? '') as string;
	if (!roomId) return err('roomId required');
	await db.prepare('UPDATE chat_room_members SET is_muted = 0 WHERE room_id = ? AND user_id = ?')
		.bind(roomId, u.id).run();
	return json({});
};

export const chatRoomsInvitations: Handler = async (db, body) => {
	// In this implementation, invite = direct add, so no pending invitations
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};
