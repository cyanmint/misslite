/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser, DbDriveFile } from '../types.js';
import { json, err, packUser, packSelf, requireUser, getUserRoles } from '../helpers.js';
import { getUser } from '../helpers.js';

type UserProfileData = Record<string, unknown>;

async function getUserProfile(db: D1Database, userId: string): Promise<UserProfileData> {
	const row = await db.prepare('SELECT data FROM user_profiles WHERE user_id = ?').bind(userId).first<{ data: string }>();
	if (!row?.data) return {};
	try {
		const parsed = JSON.parse(row.data);
		return parsed && typeof parsed === 'object' ? parsed as UserProfileData : {};
	} catch {
		return {};
	}
}

async function saveUserProfile(db: D1Database, userId: string, patch: UserProfileData): Promise<void> {
	const current = await getUserProfile(db, userId);
	const next = { ...current, ...patch };
	await db.prepare(
		'INSERT INTO user_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
	).bind(userId, JSON.stringify(next), new Date().toISOString()).run();
}

function applyProfileToPacked(packed: Record<string, unknown>, profile: UserProfileData, isSelf = false): Record<string, unknown> {
	const mappedKeys = [
		'followedMessage', 'location', 'birthday', 'lang', 'postingLang', 'viewingLangs',
		'showMediaInAllLanguages', 'showHashtagsInAllLanguages', 'fields', 'isLocked', 'isExplorable',
		'hideOnlineStatus', 'publicReactions', 'carefulBot', 'autoAcceptFollowed', 'noCrawle',
		'preventAiLearning', 'injectFeaturedNote', 'receiveAnnouncementEmail', 'alwaysMarkNsfw',
		'autoSensitive', 'followingVisibility', 'followersVisibility', 'chatScope', 'pinnedPageId',
		'mutedWords', 'mutedInstances', 'notificationRecieveConfig', 'notificationReceiveConfig',
		'emailNotificationTypes', 'alsoKnownAs', 'requireSigninToViewContents',
		'makeNotesFollowersOnlyBefore', 'makeNotesHiddenBefore', 'avatarDecorations',
	];
	for (const key of mappedKeys) {
		if (key in profile) packed[key] = profile[key];
	}
	packed.canChat = (packed.chatScope ?? 'none') !== 'none';
	if (!isSelf) {
		delete packed.hideOnlineStatus;
		delete packed.notificationRecieveConfig;
		delete packed.emailNotificationTypes;
	}
	return packed;
}

export const currentUser: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const token = (body.i ?? body.token ?? '') as string;
	const packed = packSelf(u, token);
	const profile = await getUserProfile(db, u.id);
	return json(applyProfileToPacked(packed, profile, true));
};

export const updateUser: Handler = async (db, body, _env, request) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
	if (typeof body.description === 'string') { sets.push('description = ?'); vals.push(body.description); }
	if (typeof body.isBot === 'boolean') { sets.push('is_bot = ?'); vals.push(body.isBot ? 1 : 0); }
	if (typeof body.isCat === 'boolean') { sets.push('is_cat = ?'); vals.push(body.isCat ? 1 : 0); }
	if (typeof body.avatarUrl === 'string') { sets.push('avatar_url = ?'); vals.push(body.avatarUrl); }
	if (typeof body.avatarId === 'string' && body.avatarId) {
		const file = await db.prepare('SELECT * FROM drive_files WHERE id = ? AND user_id = ?').bind(body.avatarId, u.id).first<DbDriveFile>();
		if (file) {
			let origin = '';
			if (request) {
				try {
					origin = new URL(request.url).origin;
				} catch {
					origin = '';
				}
			}
			const validR2Key = file.r2_key && /^(files\/)?[0-9a-z]+\/[0-9a-z]+$/i.test(file.r2_key);
			const publicPath = validR2Key && file.r2_key
				? (file.r2_key.startsWith('files/') ? file.r2_key.slice('files/'.length) : file.r2_key)
				: null;
			const fallbackUrl = (!file.url && publicPath && origin) ? `${origin}/files/${publicPath}` : null;
			const avatarUrl = file.url ?? fallbackUrl;
			if (avatarUrl) {
				sets.push('avatar_url = ?');
				vals.push(avatarUrl);
			}
		}
	}
	if (body.avatarId === null) { sets.push('avatar_url = ?'); vals.push(null); }

	if (sets.length > 0) {
		vals.push(u.id);
		await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}
	const profileKeys = [
		'followedMessage', 'location', 'birthday', 'lang', 'postingLang', 'viewingLangs',
		'showMediaInAllLanguages', 'showHashtagsInAllLanguages', 'fields', 'isLocked', 'isExplorable',
		'hideOnlineStatus', 'publicReactions', 'carefulBot', 'autoAcceptFollowed', 'noCrawle',
		'preventAiLearning', 'injectFeaturedNote', 'receiveAnnouncementEmail', 'alwaysMarkNsfw',
		'autoSensitive', 'followingVisibility', 'followersVisibility', 'chatScope', 'pinnedPageId',
		'mutedWords', 'mutedInstances', 'notificationRecieveConfig', 'notificationReceiveConfig',
		'emailNotificationTypes', 'alsoKnownAs', 'requireSigninToViewContents',
		'makeNotesFollowersOnlyBefore', 'makeNotesHiddenBefore', 'avatarDecorations',
	];
	const profilePatch: UserProfileData = {};
	for (const key of profileKeys) {
		if (key in body) profilePatch[key] = body[key] as unknown;
	}
	if (Object.keys(profilePatch).length > 0) {
		await saveUserProfile(db, u.id, profilePatch);
	}

	const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<DbUser>();
	const token = (body.i ?? body.token ?? '') as string;
	const packed = packSelf(updated!, token);
	const profile = await getUserProfile(db, u.id);
	return json(applyProfileToPacked(packed, profile, true));
};

export const showUser: Handler = async (db, body) => {
	const userId = body.userId as string | undefined;
	const userIds = body.userIds as string[] | undefined;
	const username = body.username as string | undefined;
	const viewer = await getUser(db, body);

	const applyViewerRelation = async (target: DbUser): Promise<Record<string, unknown>> => {
		const packed = packUser(target, true);
		if (!viewer || viewer.id === target.id) return packed;
		const [following, followedBy, blocking, blocked, muting, renoteMuting] = await Promise.all([
			db.prepare('SELECT 1 FROM following WHERE follower_id = ? AND followee_id = ?').bind(viewer.id, target.id).first(),
			db.prepare('SELECT 1 FROM following WHERE follower_id = ? AND followee_id = ?').bind(target.id, viewer.id).first(),
			db.prepare('SELECT 1 FROM blocking WHERE blocker_id = ? AND blockee_id = ?').bind(viewer.id, target.id).first(),
			db.prepare('SELECT 1 FROM blocking WHERE blocker_id = ? AND blockee_id = ?').bind(target.id, viewer.id).first(),
			db.prepare('SELECT 1 FROM muting WHERE muter_id = ? AND mutee_id = ?').bind(viewer.id, target.id).first(),
			db.prepare('SELECT 1 FROM renote_muting WHERE muter_id = ? AND mutee_id = ?').bind(viewer.id, target.id).first(),
		]);
		packed.isFollowing = !!following;
		packed.isFollowed = !!followedBy;
		packed.hasPendingFollowRequestFromYou = false;
		packed.hasPendingFollowRequestToYou = false;
		packed.isBlocking = !!blocking;
		packed.isBlocked = !!blocked;
		packed.isMuted = !!muting;
		packed.isRenoteMuted = !!renoteMuting;
		return packed;
	};

	// Batch lookup
	if (Array.isArray(userIds)) {
		const results = await Promise.all(userIds.map(id =>
			db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>()
		));
		const users = results.filter(Boolean) as DbUser[];
		if (!viewer || users.length === 0) {
			return json(users.map(u => packUser(u, true)));
		}

		const targetIds = users.map(u => u.id).filter(id => id !== viewer.id);
		if (targetIds.length === 0) {
			return json(users.map(u => packUser(u, true)));
		}

		const placeholders = targetIds.map(() => '?').join(', ');
		const fetchSet = async (sql: string, binds: unknown[]): Promise<Set<string>> => {
			const rows = await db.prepare(sql).bind(...binds).all<{ id: string }>();
			return new Set((rows.results ?? []).map(r => r.id));
		};

		const [followingSet, followedBySet, blockingSet, blockedSet, mutingSet, renoteMutingSet] = await Promise.all([
			fetchSet(`SELECT followee_id AS id FROM following WHERE follower_id = ? AND followee_id IN (${placeholders})`, [viewer.id, ...targetIds]),
			fetchSet(`SELECT follower_id AS id FROM following WHERE followee_id = ? AND follower_id IN (${placeholders})`, [viewer.id, ...targetIds]),
			fetchSet(`SELECT blockee_id AS id FROM blocking WHERE blocker_id = ? AND blockee_id IN (${placeholders})`, [viewer.id, ...targetIds]),
			fetchSet(`SELECT blocker_id AS id FROM blocking WHERE blockee_id = ? AND blocker_id IN (${placeholders})`, [viewer.id, ...targetIds]),
			fetchSet(`SELECT mutee_id AS id FROM muting WHERE muter_id = ? AND mutee_id IN (${placeholders})`, [viewer.id, ...targetIds]),
			fetchSet(`SELECT mutee_id AS id FROM renote_muting WHERE muter_id = ? AND mutee_id IN (${placeholders})`, [viewer.id, ...targetIds]),
		]);

		return json(users.map(u => {
			const packed = packUser(u, true);
			if (u.id === viewer.id) return packed;
			packed.isFollowing = followingSet.has(u.id);
			packed.isFollowed = followedBySet.has(u.id);
			packed.hasPendingFollowRequestFromYou = false;
			packed.hasPendingFollowRequestToYou = false;
			packed.isBlocking = blockingSet.has(u.id);
			packed.isBlocked = blockedSet.has(u.id);
			packed.isMuted = mutingSet.has(u.id);
			packed.isRenoteMuted = renoteMutingSet.has(u.id);
			return packed;
		}));
	}
	if (!userId && !username) return json([]);
	let user: DbUser | null = null;
	if (userId) {
		user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
	} else if (username) {
		user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	}
	if (!user) return err('No such user', 404);
	const packed = await applyViewerRelation(user);
	const profile = await getUserProfile(db, user.id);
	const roles = await getUserRoles(db, user.id);
	const result = applyProfileToPacked(packed, profile, false);
	result.roles = roles;
	return json(result);
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

import { generateId } from '../helpers.js';

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
const profile = await getUserProfile(db, u.id);
return json({
	twoFactorEnabled: !!profile.twoFactorEnabled,
	usePasswordLessLogin: !!profile.usePasswordLessLogin,
	securityKeys: Array.isArray(profile.securityKeys) ? profile.securityKeys : [],
});
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
