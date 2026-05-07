/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser, DbDriveFile } from '../types.js';
import { json, err, packUser, packSelf, requireUser } from '../helpers.js';

export const currentUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const token = (body.i ?? body.token ?? '') as string;
	return json(packSelf(u, token));
};

export const updateUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
	if (typeof body.description === 'string') { sets.push('description = ?'); vals.push(body.description); }
	if (typeof body.avatarUrl === 'string') { sets.push('avatar_url = ?'); vals.push(body.avatarUrl); }
	if (typeof body.avatarId === 'string' && body.avatarId) {
		const file = await db.prepare('SELECT * FROM drive_files WHERE id = ? AND user_id = ?').bind(body.avatarId, u.id).first<DbDriveFile>();
		if (file?.url) { sets.push('avatar_url = ?'); vals.push(file.url); }
	}
	if (body.avatarId === null) { sets.push('avatar_url = ?'); vals.push(null); }

	if (sets.length > 0) {
		vals.push(u.id);
		await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}

	const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<DbUser>();
	const token = (body.i ?? body.token ?? '') as string;
	return json(packSelf(updated!, token));
};

export const showUser: Handler = async (db, body) => {
	const userId = body.userId as string | undefined;
	const userIds = body.userIds as string[] | undefined;
	const username = body.username as string | undefined;
	// Batch lookup
	if (Array.isArray(userIds)) {
		const results = await Promise.all(userIds.map(id =>
			db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>()
		));
		return json(results.filter(Boolean).map(u => packUser(u!, true)));
	}
	if (!userId && !username) return json([]);
	let user: DbUser | null = null;
	if (userId) {
		user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
	} else if (username) {
		user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	}
	if (!user) return err('No such user', 404);
	return json(packUser(user, true));
};

export const searchUsers: Handler = async (db, body) => {
	const query = ((body.query ?? body.username ?? '') as string).trim();
	if (!query) return err('query required');
	const limit = Math.min(Number(body.limit) || 10, 100);
	const offset = Number(body.offset) || 0;
	const pattern = '%' + query.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
	const users = await db.prepare(
		'SELECT * FROM users WHERE (username LIKE ? OR name LIKE ?) ORDER BY username ASC LIMIT ? OFFSET ?'
	).bind(pattern, pattern, limit, offset).all<DbUser>();
	return json((users.results ?? []).map(u => packUser(u, true)));
};

// ── Additional user endpoints ─────────────────────────────────────────────────

import { generateId, getUser } from '../helpers.js';

export const userRelation: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const targetId = (body.userId ?? '') as string;
if (!targetId) return err('userId required');
const following = await db.prepare('SELECT id FROM following WHERE follower_id = ? AND followee_id = ?').bind(u.id, targetId).first();
const followedBy = await db.prepare('SELECT id FROM following WHERE follower_id = ? AND followee_id = ?').bind(targetId, u.id).first();
const blocking = await db.prepare('SELECT id FROM blocking WHERE blocker_id = ? AND blockee_id = ?').bind(u.id, targetId).first();
const blocked = await db.prepare('SELECT id FROM blocking WHERE blocker_id = ? AND blockee_id = ?').bind(targetId, u.id).first();
const muting = await db.prepare('SELECT id FROM muting WHERE muter_id = ? AND mutee_id = ?').bind(u.id, targetId).first();
const renoteMuting = await db.prepare('SELECT id FROM renote_muting WHERE muter_id = ? AND mutee_id = ?').bind(u.id, targetId).first();
return json({
id: targetId,
isFollowing: !!following,
isFollowed: !!followedBy,
hasPendingFollowRequestFromYou: false,
hasPendingFollowRequestToYou: false,
isBlocking: !!blocking,
isBlocked: !!blocked,
isMuted: !!muting,
isRenoteMuted: !!renoteMuting,
});
};

export const userStats: Handler = async (db, body) => {
const userId = (body.userId ?? '') as string;
if (!userId) return err('userId required');
const notes = await db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?').bind(userId).first<{ c: number }>();
const following = await db.prepare('SELECT COUNT(*) as c FROM following WHERE follower_id = ?').bind(userId).first<{ c: number }>();
const followers = await db.prepare('SELECT COUNT(*) as c FROM following WHERE followee_id = ?').bind(userId).first<{ c: number }>();
return json({
notesCount: notes?.c ?? 0,
repliesCount: 0, renotesCount: 0,
repliedCount: 0, renotedCount: 0,
pollVotesCount: 0, pollVotedCount: 0,
localFollowingCount: following?.c ?? 0,
remoteFollowingCount: 0,
localFollowersCount: followers?.c ?? 0,
remoteFollowersCount: 0,
followingCount: following?.c ?? 0,
followersCount: followers?.c ?? 0,
sentReactionsCount: 0, receivedReactionsCount: 0,
driveUsage: 0, driveFilesCount: 0,
});
};

export const usersSearchByUsernameAndHost: Handler = async (db, body) => {
const username = ((body.username ?? '') as string).trim();
if (!username) return json([]);
const limit = Math.min(Number(body.limit) || 10, 100);
const pattern = username.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
const users = await db.prepare('SELECT * FROM users WHERE username LIKE ? ORDER BY username ASC LIMIT ?')
.bind(pattern, limit).all<DbUser>();
return json((users.results ?? []).map(u2 => packUser(u2, true)));
};

export const userAchievements: Handler = async () => json([]);

export const userFeaturedNotes: Handler = async (db, body) => {
const userId = (body.userId ?? '') as string;
if (!userId) return err('userId required');
const notes = await db.prepare("SELECT * FROM notes WHERE user_id = ? AND visibility = 'public' ORDER BY created_at DESC LIMIT 10")
.bind(userId).all<import('../types.js').DbNote>();
const { packNote } = await import('../helpers.js');
const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
return json(packed);
};

export const usersRecommendation: Handler = async () => json([]);

export const usersReportAbuse: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const targetUserId = (body.userId ?? '') as string;
const comment = (body.comment ?? '') as string;
if (!targetUserId) return err('userId required');
if (!comment) return err('comment required');
await db.prepare('INSERT INTO abuse_reports (id, reporter_id, target_user_id, comment) VALUES (?, ?, ?, ?)')
.bind(generateId(), u.id, targetUserId, comment).run();
return json({});
};

export const usersUpdateMemo: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
const targetUserId = (body.userId ?? '') as string;
const memo = (body.memo ?? '') as string;
if (!targetUserId) return err('userId required');
await db.prepare('INSERT OR REPLACE INTO user_memos (user_id, target_user_id, memo) VALUES (?, ?, ?)')
.bind(u.id, targetUserId, memo).run();
return json({});
};

export const usersGetSecurityInfo: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json({ twoFactorEnabled: false, usePasswordLessLogin: false, securityKeys: [] });
};

export const listUsers: Handler = async (db, body) => {
const limit = Math.min(Number(body.limit) || 10, 100);
const offset = Number(body.offset) || 0;
const users = await db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
.bind(limit, offset).all<DbUser>();
return json((users.results ?? []).map(u2 => packUser(u2)));
};

export const usersReactions: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json([]);
};

export const usersGetFrequentlyRepliedUsers: Handler = async (db, body) => {
return json([]);
};

export const usersGetFollowingBirthdayUsers: Handler = async (db, body) => {
const u = await requireUser(db, body);
if (u instanceof Response) return u;
return json([]);
};

export const usersGetSkebStatus: Handler = async () => json({
	screenName: '', isCreator: false, isAcceptable: false,
	creatorRequestCount: 0, clientRequestCount: 0, skills: [],
});
