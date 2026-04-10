/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, requireUser, packUser, packSelf, generateId, getUser } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

const authedNoContent: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return noContent();
};

/* ── Abuse Report Resolvers ── */
export const adminAbuseReportResolverCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), createdAt: new Date().toISOString(),
		name: (body.name as string) ?? '', targetUserPattern: null,
		reporterPattern: null, reportContentPattern: null, expiresAt: null,
		forward: false,
	});
};
export const adminAbuseReportResolverDelete = authedNoContent;
export const adminAbuseReportResolverList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminAbuseReportResolverUpdate = authedNoContent;

/* ── Abuse Report Notification Recipients ── */
function makeNotificationRecipient(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		isActive: true, name: '', method: 'email',
	};
}
export const adminAbuseReportNotificationRecipientCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeNotificationRecipient());
};
export const adminAbuseReportNotificationRecipientDelete = authedNoContent;
export const adminAbuseReportNotificationRecipientList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminAbuseReportNotificationRecipientShow: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeNotificationRecipient());
};
export const adminAbuseReportNotificationRecipientUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeNotificationRecipient());
};

/* ── Admin Accounts Extended ── */
export const adminAccountsDelete = authedNoContent;
export const adminAccountsFindByEmail: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return new Response(JSON.stringify({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
	const email = (body.email ?? '') as string;
	let target: DbUser | null = null;
	if (email) target = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUser>();
	if (!target) target = u;
	return json(packUser(target, true));
};
export const adminAccountsPendingList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminAccountsPendingRevoke = authedNoContent;

/* ── Admin Ads ── */
export const adminAdCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), expiresAt: (body.expiresAt as string | null) ?? null,
		startsAt: new Date().toISOString(), place: (body.place as string) ?? 'header',
		priority: (body.priority as string) ?? 'middle', ratio: 1,
		url: (body.url as string) ?? '', imageUrl: (body.imageUrl as string) ?? '',
		imageBlurhash: null, dayOfWeek: 0, isSensitive: false, memo: '',
	});
};
export const adminAdDelete = authedNoContent;
export const adminAdList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminAdUpdate = authedNoContent;

/* ── Avatar Decorations ── */
export const adminAvatarDecorationsCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		name: (body.name as string) ?? '', description: (body.description as string) ?? '',
		url: (body.url as string) ?? '', roleIdsThatCanBeUsedThisDecoration: [],
	});
};
export const adminAvatarDecorationsDelete = authedNoContent;
export const adminAvatarDecorationsList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminAvatarDecorationsUpdate = authedNoContent;

/* ── Captcha ── */
export const adminCaptchaCurrent: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({ provider: 'none', hcaptcha: null, mcaptcha: null, recaptcha: null, turnstile: null, testcaptcha: null });
};
export const adminCaptchaSave = authedNoContent;

/* ── Drive Admin ── */
export const adminDriveCleanRemoteFiles = authedNoContent;
export const adminDriveCleanup = authedNoContent;
export const adminDriveDeleteAllFilesOfUser = authedNoContent;
export const adminDriveFiles: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminDriveShowFile: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), createdAt: new Date().toISOString(),
		name: 'file.bin', type: 'application/octet-stream',
		md5: '00000000000000000000000000000000', size: 0,
		isSensitive: false, blurhash: null, properties: {},
		url: null, thumbnailUrl: null, webpublicUrl: null, comment: null,
		folderId: null, folder: null, userId: u.id, user: null,
		userHost: null, storedInternal: false,
		accessKey: null, thumbnailAccessKey: null, webpublicAccessKey: null,
		uri: null, src: null, isLink: false,
	});
};

/* ── Emoji Admin ── */
function makeAdminEmoji(): Record<string, unknown> {
	return {
		id: generateId(), aliases: [], name: '', category: null, host: null,
		url: '', isSensitive: false, localOnly: false, license: null,
		roleIdsThatCanBeUsedThisDecoration: [],
	};
}
export const adminEmojiAdd: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeAdminEmoji());
};
export const adminEmojiAddAliasesBulk = authedNoContent;
export const adminEmojiCopy: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({ id: generateId() });
};
export const adminEmojiDelete = authedNoContent;
export const adminEmojiDeleteBulk = authedNoContent;
export const adminEmojiImportZip = authedNoContent;
export const adminEmojiList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminEmojiListRemote: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminEmojiRemoveAliasesBulk = authedNoContent;
export const adminEmojiSetAliasesBulk = authedNoContent;
export const adminEmojiSetCategoryBulk = authedNoContent;
export const adminEmojiSetLicenseBulk = authedNoContent;
export const adminEmojiUpdate = authedNoContent;
export const v2AdminEmojiList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({ emojis: [], count: 0, allCount: 0, allPages: 0 });
};

/* ── Federation Admin ── */
export const adminFederationDeleteAllFiles = authedNoContent;
export const adminFederationRefreshRemoteInstanceMetadata: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({});
};
export const adminFederationRemoveAllFollowing = authedNoContent;
export const adminFederationUpdateInstance = authedNoContent;

/* ── User Admin ── */
export const adminGetUserIps: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};

/* ── IndieAuth ── */
export const adminIndieAuthCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), createdAt: new Date().toISOString(),
		name: (body.name as string) ?? '', redirectUris: (body.redirectUris as string[]) ?? [],
		secretData: {},
	});
};
export const adminIndieAuthDelete = authedNoContent;
export const adminIndieAuthList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminIndieAuthUpdate = authedNoContent;

/* ── Promo / Queue / Relays ── */
export const adminPromoCreate = authedNoContent;
export const adminQueueClear = authedNoContent;
export const adminQueueDeliverDelayed: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminQueueInboxDelayed: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminQueuePromote = authedNoContent;
export const adminQueueStats: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	const q = { waiting: 0, active: 0, delayed: 0, paused: 0 };
	return json({ deliver: { ...q }, inbox: { ...q }, db: { ...q }, objectStorage: { ...q } });
};
export const adminRelaysAdd: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({ id: generateId(), inbox: (body.inbox as string) ?? '', status: 'requesting' });
};
export const adminRelaysList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminRelaysRemove = authedNoContent;
export const adminSendEmail = authedNoContent;

/* ── SSO ── */
export const adminSsoCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json({
		id: generateId(), createdAt: new Date().toISOString(),
		name: (body.name as string) ?? '', type: (body.type as string) ?? 'saml',
		issuer: (body.issuer as string) ?? '',
		audience: null, binding: 'post', acsUrl: null, publicKey: null, signatureAlgorithm: 'sha256',
		wantAuthnRequestsSigned: false, wantAssertionsSigned: false, wantEmailAddressNormalized: false,
	});
};
export const adminSsoDelete = authedNoContent;
export const adminSsoList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminSsoUpdate = authedNoContent;

/* ── System Webhooks ── */
function makeSystemWebhook(): Record<string, unknown> {
	return {
		id: generateId(), isActive: true, updatedAt: new Date().toISOString(),
		latestSentAt: null, latestStatus: null, name: '', url: '', secret: '', on: [],
	};
}
export const adminSystemWebhookCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeSystemWebhook());
};
export const adminSystemWebhookDelete = authedNoContent;
export const adminSystemWebhookList: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};
export const adminSystemWebhookShow: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeSystemWebhook());
};
export const adminSystemWebhookTest = authedNoContent;
export const adminSystemWebhookUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeSystemWebhook());
};

/* ── Misc Admin ── */
export const adminUnsetUserMutualLink = authedNoContent;
export const adminUpdateProxyAccount: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	if (!u.is_admin) return new Response(JSON.stringify({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
	return json(packUser(u, true));
};
