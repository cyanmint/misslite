import type { Handler } from '../types.js';
import type { DbUser, DbChannel, DbNote } from '../types.js';
import { json, err, generateId, packUser, packNote, requireUser, getUser } from '../helpers.js';

function packChannel(c: DbChannel, isFollowing = false, isFavorited = false): Record<string, unknown> {
	return {
		id: c.id, createdAt: c.created_at, lastNotedAt: null,
		name: c.name, description: c.description, userId: c.user_id,
		bannerUrl: c.banner_url, pinnedNoteIds: [], color: c.color,
		isArchived: !!c.is_archived, usersCount: 0, notesCount: 0,
		isSensitive: false, allowRenoteToExternal: true,
		isFollowing, isFavorited,
	};
}

// channels/create
export const channelsCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const name = body.name as string | undefined;
	if (!name) return err('name is required');

	const description = (body.description as string | undefined) ?? null;
	const color = (body.color as string | undefined) ?? '#000000';
	const bannerUrl = (body.bannerUrl as string | undefined) ?? null;
	const id = generateId();
	const now = new Date().toISOString();

	await db.prepare(
		'INSERT INTO channels (id, user_id, name, description, color, banner_url, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
	).bind(id, u.id, name, description, color, bannerUrl, now).run();

	const channel: DbChannel = { id, user_id: u.id, name, description, color, banner_url: bannerUrl, is_archived: 0, created_at: now };
	return json(packChannel(channel));
};

// channels/show
export const channelsShow: Handler = async (db, body) => {
	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	const channel = await db.prepare('SELECT * FROM channels WHERE id = ?').bind(channelId).first<DbChannel>();
	if (!channel) return err('Channel not found');

	let isFollowing = false;
	let isFavorited = false;
	const u = await getUser(db, body);
	if (u) {
		const fol = await db.prepare('SELECT id FROM channel_following WHERE user_id = ? AND channel_id = ?').bind(u.id, channelId).first();
		isFollowing = !!fol;
		const fav = await db.prepare('SELECT id FROM channel_favorites WHERE user_id = ? AND channel_id = ?').bind(u.id, channelId).first();
		isFavorited = !!fav;
	}

	return json(packChannel(channel, isFollowing, isFavorited));
};

// channels/update
export const channelsUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	const channel = await db.prepare('SELECT * FROM channels WHERE id = ?').bind(channelId).first<DbChannel>();
	if (!channel) return err('Channel not found');
	if (channel.user_id !== u.id) return err('You do not own this channel', 403);

	const name = (body.name as string | undefined) ?? channel.name;
	const description = body.description !== undefined ? (body.description as string | null) : channel.description;
	const color = (body.color as string | undefined) ?? channel.color;
	const bannerUrl = body.bannerUrl !== undefined ? (body.bannerUrl as string | null) : channel.banner_url;
	const isArchived = body.isArchived !== undefined ? (body.isArchived ? 1 : 0) : channel.is_archived;

	await db.prepare(
		'UPDATE channels SET name = ?, description = ?, color = ?, banner_url = ?, is_archived = ? WHERE id = ?',
	).bind(name, description, color, bannerUrl, isArchived, channelId).run();

	const updated: DbChannel = { ...channel, name, description, color, banner_url: bannerUrl, is_archived: isArchived };
	return json(packChannel(updated));
};

// channels/follow
export const channelsFollow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	const id = generateId();
	const now = new Date().toISOString();
	try {
		await db.prepare(
			'INSERT INTO channel_following (id, user_id, channel_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, channelId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return json({});
		throw e;
	}

	return json({});
};

// channels/unfollow
export const channelsUnfollow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	await db.prepare('DELETE FROM channel_following WHERE user_id = ? AND channel_id = ?').bind(u.id, channelId).run();

	return json({});
};

// channels/followed
export const channelsFollowed: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;

	const rows = await db.prepare(
		'SELECT c.* FROM channel_following cf JOIN channels c ON c.id = cf.channel_id WHERE cf.user_id = ? ORDER BY cf.created_at DESC LIMIT ? OFFSET ?',
	).bind(u.id, limit, offset).all<DbChannel>();

	const packed = (rows.results ?? []).map(c => packChannel(c, true));
	return json(packed);
};

// channels/featured
export const channelsFeatured: Handler = async (db) => {
	const rows = await db.prepare(
		'SELECT * FROM channels WHERE is_archived = 0 ORDER BY created_at DESC LIMIT 10',
	).all<DbChannel>();

	const packed = (rows.results ?? []).map(c => packChannel(c));
	return json(packed);
};

// channels/favorite
export const channelsFavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	const id = generateId();
	const now = new Date().toISOString();
	try {
		await db.prepare(
			'INSERT INTO channel_favorites (id, user_id, channel_id, created_at) VALUES (?, ?, ?, ?)',
		).bind(id, u.id, channelId, now).run();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (msg.includes('UNIQUE constraint failed')) return json({});
		throw e;
	}

	return json({});
};

// channels/unfavorite
export const channelsUnfavorite: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	await db.prepare('DELETE FROM channel_favorites WHERE user_id = ? AND channel_id = ?').bind(u.id, channelId).run();

	return json({});
};

// channels/my-favorites
export const channelsMyFavorites: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const rows = await db.prepare(
		'SELECT c.* FROM channel_favorites cf JOIN channels c ON c.id = cf.channel_id WHERE cf.user_id = ? ORDER BY cf.created_at DESC',
	).bind(u.id).all<DbChannel>();

	const packed = (rows.results ?? []).map(c => packChannel(c, false, true));
	return json(packed);
};

// channels/owned
export const channelsOwned: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;

	const rows = await db.prepare(
		'SELECT * FROM channels WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
	).bind(u.id, limit, offset).all<DbChannel>();

	const packed = (rows.results ?? []).map(c => packChannel(c));
	return json(packed);
};

// channels/search
export const channelsSearch: Handler = async (db, body) => {
	const query = body.query as string | undefined;
	if (!query) return err('query is required');

	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;

	const rows = await db.prepare(
		'SELECT * FROM channels WHERE name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
	).bind(`%${query}%`, limit, offset).all<DbChannel>();

	const packed = (rows.results ?? []).map(c => packChannel(c));
	return json(packed);
};

// channels/timeline
export const channelsTimeline: Handler = async (db, body) => {
	const channelId = body.channelId as string | undefined;
	if (!channelId) return err('channelId is required');

	// Notes don't have a channel_id column yet
	return json([]);
};

// channels/featured-games
export const channelsFeaturedGames: Handler = async () => {
	return json([]);
};
