/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// @ts-ignore — cloudflare:email is a Cloudflare Workers built-in module
import { EmailMessage } from 'cloudflare:email';

import type { DbUser, DbNote } from './types.js';

export function generateId(): string {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	let id = '';
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	for (const b of arr) id += chars[b % chars.length];
	return id;
}

export function generateRandomPassword(length = 8): string {
	// Uses full alphanumeric set to maximise entropy within the 8-char constraint
	// imposed by the Misskey API spec (minLength: 8, maxLength: 8).
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const arr = new Uint8Array(length);
	crypto.getRandomValues(arr);
	return Array.from(arr, b => chars[b % chars.length]).join('');
}

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_BITS = 256;

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
	const pairs = hex.match(/.{2}/g) ?? [];
	return new Uint8Array(pairs.map(h => parseInt(h, 16)));
}

async function pbkdf2(pw: string, salt: Uint8Array): Promise<string> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(pw),
		'PBKDF2',
		false,
		['deriveBits'],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
		keyMaterial,
		PBKDF2_BITS,
	);
	return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(pw: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(pw, salt);
	return `${bytesToHex(salt)}:${hash}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
	const parts = stored.split(':');
	if (parts.length !== 2) return false;
	const [saltHex, expectedHash] = parts;
	const salt = hexToBytes(saltHex);
	const actualHash = await pbkdf2(pw, salt);
	return actualHash === expectedHash;
}

export function cors(headers?: HeadersInit): Headers {
	const h = new Headers(headers);
	h.set('Access-Control-Allow-Origin', '*');
	h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	h.set('Access-Control-Allow-Headers', '*');
	h.set('Access-Control-Expose-Headers', '*');
	h.set('Access-Control-Max-Age', '86400');
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

/** Full set of user-level policies returned with every MeDetailed response. */
export const DEFAULT_POLICIES = {
	gtlAvailable: true,
	ltlAvailable: true,
	canPublicNote: true,
	canEditNote: true,
	canInvite: true,
	inviteLimit: 0,
	inviteLimitCycle: 0,
	inviteExpirationTime: 0,
	canManageCustomEmojis: false,
	canManageAvatarDecorations: false,
	canCreateContent: true,
	canUpdateContent: true,
	canDeleteContent: true,
	canHideAds: false,
	driveCapacityMb: 0,
	alwaysMarkNsfw: false,
	pinLimit: 10,
	antennaLimit: 5,
	wordMuteLimit: 200,
	webhookLimit: 3,
	clipLimit: 10,
	noteEachClipsLimit: 200,
	userListLimit: 10,
	userEachUserListsLimit: 50,
	rateLimitFactor: 1,
	canSearchNotes: true,
	canSearchUsers: true,
	canUseTranslator: false,
	chatAvailability: 'available',
	maxFileSizeMb: 100,
	scheduledNoteLimit: 0,
	watermarkAvailable: false,
};

export function packUser(u: DbUser, detail = false): Record<string, unknown> {
	const packed: Record<string, unknown> = {
		id: u.id,
		name: u.name || u.username,
		username: u.username,
		host: null,
		avatarUrl: u.avatar_url,
		avatarBlurhash: null,
		avatarDecorations: [],
		emojis: {},
		url: null,
		uri: null,
		isBot: !!u.is_bot,
		isCat: !!u.is_cat,
		onlineStatus: 'unknown',
		isAdmin: !!u.is_admin,
		isModerator: !!u.is_moderator,
		isSuspended: !!u.is_suspended,
		createdAt: u.created_at,
		updatedAt: u.created_at,
	};
	if (detail) {
		packed.description = u.description;
		packed.followersCount = 0;
		packed.followingCount = 0;
		packed.notesCount = 0;
		packed.bannerUrl = u.banner_url ?? null;
		packed.bannerBlurhash = null;
		packed.fields = [];
		packed.verifiedLinks = [];
		packed.pinnedNotes = [];
		packed.pinnedNoteIds = [];
		packed.isLocked = false;
		packed.isExplorable = true;
		packed.noIndex = false;
		packed.isRenoteMuted = false;
		packed.isSilenced = false;
		packed.isLimited = false;
		packed.movedTo = null;
		packed.alsoKnownAs = null;
		packed.lastFetchedAt = null;
		packed.memo = null;
		packed.moderationNote = null;
		packed.roles = [];
		packed.policies = DEFAULT_POLICIES;
		packed.mutualLinkSections = [];
		packed.followingVisibility = 'public';
		packed.followersVisibility = 'public';
		packed.chatScope = 'local';
		packed.canChat = true;
		packed.publicReactions = true;
		packed.pinnedPage = null;
		packed.pinnedPageId = null;
		packed.location = null;
		packed.birthday = null;
		packed.lang = null;
		packed.avatarId = null;
		packed.bannerId = null;
		packed.followedMessage = null;
		// Admin-visible user settings
		packed.injectFeaturedNote = true;
		packed.receiveAnnouncementEmail = true;
		packed.alwaysMarkNsfw = false;
		packed.autoSensitive = false;
		packed.carefulBot = false;
		packed.autoAcceptFollowed = true;
		packed.noCrawle = false;
		packed.preventAiLearning = false;
		packed.isDeleted = false;
		packed.twoFactorBackupCodesStock = 'none';
		// Self/admin notification fields
		packed.hideOnlineStatus = false;
		packed.hasUnreadSpecifiedNotes = false;
		packed.hasUnreadMentions = false;
		packed.hasUnreadAnnouncement = false;
		packed.unreadAnnouncements = [];
		packed.hasUnreadAntenna = false;
		packed.hasUnreadChannel = false;
		packed.hasUnreadChatMessages = false;
		packed.hasUnreadNotification = false;
		packed.hasPendingReceivedFollowRequest = false;
		packed.unreadNotificationsCount = 0;
		// User preferences
		packed.mutedWords = [];
		packed.mutedInstances = [];
		packed.postingLang = null;
		packed.viewingLangs = [];
		packed.showMediaInAllLanguages = false;
		packed.showHashtagsInAllLanguages = false;
		packed.notificationRecieveConfig = {};
		packed.emailNotificationTypes = [];
		packed.achievements = [];
		packed.loggedInDays = 0;
		packed.twoFactorEnabled = false;
		packed.usePasswordLessLogin = false;
		packed.securityKeys = [];
	}
	return packed;
}

/**
 * Pack a user object as the authenticated user's own profile (MeDetailed).
 * Extends packUser(detail=true) with self-only fields like token, mutes, etc.
 */
export function packSelf(u: DbUser, token: string): Record<string, unknown> {
	return {
		...packUser(u, true),
		token,
		email: u.email ?? null,
		emailVerified: false,
		twoFactorEnabled: false,
		twoFactorBackupCodesStock: 'none',
		usePasswordLessLogin: false,
		securityKeys: [],
		mutedWords: [],
		hardMutedWords: [],
		mutedInstances: [],
		notificationRecieveConfig: {},
		emailNotificationTypes: [],
		achievements: [],
		loggedInDays: 0,
		hideOnlineStatus: false,
		hasUnreadSpecifiedNotes: false,
		hasUnreadMentions: false,
		hasUnreadAnnouncement: false,
		unreadAnnouncements: [],
		hasUnreadAntenna: false,
		hasUnreadChannel: false,
		hasUnreadChatMessages: false,
		hasUnreadNotification: false,
		hasPendingReceivedFollowRequest: false,
		unreadNotificationsCount: 0,
		isDeleted: false,
		injectFeaturedNote: false,
		receiveAnnouncementEmail: false,
		alwaysMarkNsfw: false,
		autoSensitive: false,
		carefulBot: false,
		autoAcceptFollowed: false,
		noCrawle: false,
		preventAiLearning: false,
		noIndex: false,
		showMediaInAllLanguages: false,
		showHashtagsInAllLanguages: false,
		postingLang: null,
		viewingLangs: [],
	};
}

export async function packNote(
	db: D1Database,
	n: DbNote,
	options: { includeRenote?: boolean; viewerId?: string } = {},
): Promise<Record<string, unknown>> {
	const includeRenote = options.includeRenote !== false;
	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(n.user_id).first<DbUser>();
	const reactions = await db.prepare('SELECT reaction, COUNT(*) as count FROM reactions WHERE note_id = ? GROUP BY reaction').bind(n.id).all();
	const reactionMap: Record<string, number> = {};
	for (const r of reactions.results ?? []) {
		reactionMap[r.reaction as string] = r.count as number;
	}
	let myReaction: string | null = null;
	if (options.viewerId) {
		const mine = await db.prepare('SELECT reaction FROM reactions WHERE note_id = ? AND user_id = ?')
			.bind(n.id, options.viewerId).first<{ reaction: string }>();
		myReaction = mine?.reaction ?? null;
	}
	let renote: Record<string, unknown> | null = null;
	if (includeRenote && n.renote_id) {
		const renoteNote = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(n.renote_id).first<DbNote>();
		renote = renoteNote ? await packNote(db, renoteNote, { includeRenote: false, viewerId: options.viewerId }) : null;
	}
	const pollBase = await db.prepare(
		'SELECT multiple, expires_at FROM note_polls WHERE note_id = ?'
	).bind(n.id).first<{ multiple: number; expires_at: string | null }>();
	let poll: Record<string, unknown> | null = null;
	if (pollBase) {
		const choices = await db.prepare(
			'SELECT choice_index, text, votes_count FROM note_poll_choices WHERE note_id = ? ORDER BY choice_index ASC'
		).bind(n.id).all<{ choice_index: number; text: string; votes_count: number }>();
		poll = {
			multiple: !!pollBase.multiple,
			expiresAt: pollBase.expires_at,
			expired: !!pollBase.expires_at && new Date(pollBase.expires_at).getTime() < Date.now(),
			choices: (choices.results ?? []).map(c => ({
				text: c.text,
				votes: c.votes_count,
				isVoted: false,
			})),
			totalVotes: (choices.results ?? []).reduce((a, c) => a + Number(c.votes_count || 0), 0),
		};
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
		renote,
		reactions: reactionMap,
		myReaction,
		repliesCount: 0,
		renoteCount: 0,
		emojis: {},
		fileIds: [],
		files: [],
		poll,
		localOnly: false,
	};
}

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
	const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>();
	return row?.value ?? null;
}

export async function getMetaAll(db: D1Database): Promise<Record<string, string>> {
	const rows = await db.prepare('SELECT key, value FROM meta').all<{ key: string; value: string }>();
	const result: Record<string, string> = {};
	for (const row of rows.results ?? []) {
		result[row.key] = row.value;
	}
	return result;
}

export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
	await db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(key, value).run();
}

/** Fetch the RoleLite objects assigned to a user. */
export async function getUserRoles(db: D1Database, userId: string): Promise<Record<string, unknown>[]> {
	const rows = await db.prepare(
		`SELECT r.id, r.name, r.color, r.icon_url, r.description,
		        r.is_moderator, r.is_administrator, r.display_order
		 FROM roles r
		 JOIN role_assignments ra ON ra.role_id = r.id
		 WHERE ra.user_id = ?
		 ORDER BY r.display_order ASC`
	).bind(userId).all<{
		id: string; name: string; color: string | null; icon_url: string | null;
		description: string; is_moderator: number; is_administrator: number; display_order: number;
	}>();
	return (rows.results ?? []).map(r => ({
		id: r.id,
		name: r.name,
		color: r.color,
		iconUrl: r.icon_url,
		description: r.description,
		isModerator: !!r.is_moderator,
		isAdministrator: !!r.is_administrator,
		displayOrder: r.display_order,
	}));
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

interface SendEmailBinding {
	send(message: unknown): Promise<void>;
}

export interface WorkerEmailOptions {
	to: string;
	from: string;
	fromName?: string;
	subject: string;
	text?: string;
	html?: string;
	replyTo?: string;
}

/**
 * Send an email via Cloudflare Workers Email (Send Email binding).
 * Constructs a valid RFC 2822 message and delivers it via the
 * cloudflare:email runtime module's EmailMessage API.
 */
export async function sendWorkerEmail(binding: SendEmailBinding, opts: WorkerEmailOptions): Promise<void> {
	const { to, from, fromName, subject, text, html, replyTo } = opts;
	const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
	const fromHeader = fromName ? `${fromName} <${from}>` : from;
	const date = new Date().toUTCString();
	const headerLines = [
		`Date: ${date}`,
		`From: ${fromHeader}`,
		`To: ${to}`,
		`Subject: ${subject}`,
		`MIME-Version: 1.0`,
		`Content-Type: ${contentType}`,
	];
	if (replyTo) headerLines.push(`Reply-To: ${replyTo}`);
	const payload = html ?? text ?? '';
	const raw = `${headerLines.join('\r\n')}\r\n\r\n${payload}`;

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	await writer.write(new TextEncoder().encode(raw));
	await writer.close();

	// @ts-ignore — EmailMessage is statically imported from cloudflare:email above
	const message = new EmailMessage(from, to, readable);
	await binding.send(message);
}

