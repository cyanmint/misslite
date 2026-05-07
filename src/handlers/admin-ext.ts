/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, requireUser, packUser, packSelf, generateId, getUser, getMeta } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

const authedNoContent: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return noContent();
};

async function requireModeratorUser(db: D1Database, body: Record<string, unknown>): Promise<DbUser | Response> {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);
	return u;
}

function toIsoNow(): string {
	return new Date().toISOString();
}

/* ── Abuse Report Resolvers ── */
export const adminAbuseReportResolverCreate: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = generateId();
	const now = toIsoNow();
	const name = ((body.name ?? '') as string).trim();
	const targetUserPattern = ((body.targetUserPattern ?? null) as string | null);
	const reporterPattern = ((body.reporterPattern ?? null) as string | null);
	const reportContentPattern = ((body.reportContentPattern ?? null) as string | null);
	const expiresAt = ((body.expiresAt ?? null) as string | null);
	const forward = body.forward ? 1 : 0;
	await db.prepare(
		'INSERT INTO abuse_report_resolvers (id, created_at, updated_at, name, target_user_pattern, reporter_pattern, report_content_pattern, expires_at, forward) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(id, now, now, name, targetUserPattern, reporterPattern, reportContentPattern, expiresAt, forward).run();
	return json({ id, createdAt: now, updatedAt: now, name, targetUserPattern, reporterPattern, reportContentPattern, expiresAt, forward: !!forward });
};
export const adminAbuseReportResolverDelete: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = ((body.id ?? body.resolverId ?? '') as string).trim();
	if (!id) return err('id required');
	await db.prepare('DELETE FROM abuse_report_resolvers WHERE id = ?').bind(id).run();
	return noContent();
};
export const adminAbuseReportResolverList: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const rows = await db.prepare('SELECT * FROM abuse_report_resolvers ORDER BY created_at DESC').all<Record<string, unknown>>();
	return json((rows.results ?? []).map((r) => ({
		id: r.id,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		name: r.name,
		targetUserPattern: r.target_user_pattern,
		reporterPattern: r.reporter_pattern,
		reportContentPattern: r.report_content_pattern,
		expiresAt: r.expires_at,
		forward: !!r.forward,
	})));
};
export const adminAbuseReportResolverUpdate: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = ((body.id ?? body.resolverId ?? '') as string).trim();
	if (!id) return err('id required');
	const row = await db.prepare('SELECT * FROM abuse_report_resolvers WHERE id = ?').bind(id).first<Record<string, unknown>>();
	if (!row) return err('No such resolver', 404);
	const now = toIsoNow();
	const name = (body.name ?? row.name) as string;
	const targetUserPattern = (body.targetUserPattern ?? row.target_user_pattern ?? null) as string | null;
	const reporterPattern = (body.reporterPattern ?? row.reporter_pattern ?? null) as string | null;
	const reportContentPattern = (body.reportContentPattern ?? row.report_content_pattern ?? null) as string | null;
	const expiresAt = (body.expiresAt ?? row.expires_at ?? null) as string | null;
	const forward = body.forward === undefined ? (row.forward ? 1 : 0) : (body.forward ? 1 : 0);
	await db.prepare(
		'UPDATE abuse_report_resolvers SET updated_at = ?, name = ?, target_user_pattern = ?, reporter_pattern = ?, report_content_pattern = ?, expires_at = ?, forward = ? WHERE id = ?'
	).bind(now, name, targetUserPattern, reporterPattern, reportContentPattern, expiresAt, forward, id).run();
	return noContent();
};

/* ── Abuse Report Notification Recipients ── */
function makeNotificationRecipient(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		isActive: true, name: '', method: 'email',
	};
}
export const adminAbuseReportNotificationRecipientCreate: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = generateId();
	const now = toIsoNow();
	const name = ((body.name ?? '') as string).trim();
	const method = (((body.method ?? 'email') as string) || 'email').trim();
	const isActive = body.isActive === undefined ? 1 : (body.isActive ? 1 : 0);
	const webhookUrl = ((body.webhookUrl ?? null) as string | null);
	const emailAddress = ((body.emailAddress ?? body.email ?? null) as string | null);
	await db.prepare(
		'INSERT INTO abuse_report_notification_recipients (id, created_at, updated_at, is_active, name, method, webhook_url, email_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(id, now, now, isActive, name, method, webhookUrl, emailAddress).run();
	return json({ id, createdAt: now, updatedAt: now, isActive: !!isActive, name, method, webhookUrl, emailAddress });
};
export const adminAbuseReportNotificationRecipientDelete: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = ((body.id ?? body.recipientId ?? '') as string).trim();
	if (!id) return err('id required');
	await db.prepare('DELETE FROM abuse_report_notification_recipients WHERE id = ?').bind(id).run();
	return noContent();
};
export const adminAbuseReportNotificationRecipientList: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const rows = await db.prepare('SELECT * FROM abuse_report_notification_recipients ORDER BY created_at DESC').all<Record<string, unknown>>();
	return json((rows.results ?? []).map((r) => ({
		id: r.id,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
		isActive: !!r.is_active,
		name: r.name,
		method: r.method,
		webhookUrl: r.webhook_url,
		emailAddress: r.email_address,
	})));
};
export const adminAbuseReportNotificationRecipientShow: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = ((body.id ?? body.recipientId ?? '') as string).trim();
	if (!id) return err('id required');
	const row = await db.prepare('SELECT * FROM abuse_report_notification_recipients WHERE id = ?').bind(id).first<Record<string, unknown>>();
	if (!row) return err('No such recipient', 404);
	return json({
		id: row.id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		isActive: !!row.is_active,
		name: row.name,
		method: row.method,
		webhookUrl: row.webhook_url,
		emailAddress: row.email_address,
	});
};
export const adminAbuseReportNotificationRecipientUpdate: Handler = async (db, body) => {
	const u = await requireModeratorUser(db, body); if (u instanceof Response) return u;
	const id = ((body.id ?? body.recipientId ?? '') as string).trim();
	if (!id) return err('id required');
	const row = await db.prepare('SELECT * FROM abuse_report_notification_recipients WHERE id = ?').bind(id).first<Record<string, unknown>>();
	if (!row) return err('No such recipient', 404);
	const now = toIsoNow();
	const isActive = body.isActive === undefined ? (row.is_active ? 1 : 0) : (body.isActive ? 1 : 0);
	const name = (body.name ?? row.name) as string;
	const method = (body.method ?? row.method) as string;
	const webhookUrl = (body.webhookUrl ?? row.webhook_url ?? null) as string | null;
	const emailAddress = (body.emailAddress ?? body.email ?? row.email_address ?? null) as string | null;
	await db.prepare(
		'UPDATE abuse_report_notification_recipients SET updated_at = ?, is_active = ?, name = ?, method = ?, webhook_url = ?, email_address = ? WHERE id = ?'
	).bind(now, isActive, name, method, webhookUrl, emailAddress, id).run();
	return json({
		id,
		updatedAt: now,
		isActive: !!isActive,
		name,
		method,
		webhookUrl,
		emailAddress,
	});
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
export const adminPromoCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);
	return noContent();
};
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
export const adminSendEmail: Handler = async (db, body, env) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	if (!u.is_admin) return err('Forbidden', 403);
	if (!env.SEND_EMAIL) return err('Email service not configured', 503);
	const to = ((body.to ?? body.email ?? '') as string).trim();
	const subject = ((body.subject ?? '') as string).trim();
	const text = ((body.text ?? body.body ?? body.message ?? '') as string);
	const html = ((body.html ?? '') as string).trim();
	const replyTo = ((body.replyTo ?? '') as string).trim();
	if (!to) return err('to required');
	if (!subject) return err('subject required');
	if (!text && !html) return err('text or html required');
	const fromEmail = env.SEND_EMAIL_FROM ?? 'noreply@misslite.example';
	const instanceName = (await getMeta(db, 'name')) ?? env.INSTANCE_NAME ?? 'Misslite';
	const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
	const headers = [
		`From: ${instanceName} <${fromEmail}>`,
		`To: ${to}`,
		`Subject: ${subject}`,
		`MIME-Version: 1.0`,
		`Content-Type: ${contentType}`,
	];
	if (replyTo) headers.push(`Reply-To: ${replyTo}`);
	const payload = [...headers, ``, html || text].join('\r\n');
	try {
		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();
		await writer.write(new TextEncoder().encode(payload));
		await writer.close();
		// @ts-ignore cloudflare email runtime module
		const { EmailMessage } = await import('cloudflare:email');
		const message = new EmailMessage(fromEmail, to, readable);
		await env.SEND_EMAIL.send(message);
		return json({});
	} catch {
		return err('Failed to send email', 502);
	}
};

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
