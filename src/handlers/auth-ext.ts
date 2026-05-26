/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, err, requireUser, getUser, packUser, packSelf, generateId } from '../helpers.js';
import { packCurrentUser } from './users.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
const SECURITY_KEY_DEFAULT_NAME = 'Security Key';

function makeApp(): Record<string, unknown> {
	return { id: generateId(), name: 'app', callbackUrl: null, permission: [], isAuthorized: false };
}

function makeWebhook(userId: string): Record<string, unknown> {
	return {
		id: generateId(), userId, name: '', on: [], url: '', secret: null,
		active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		latestSentAt: null, latestStatus: null,
	};
}

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

async function patchUserProfile(db: D1Database, userId: string, patch: UserProfileData): Promise<UserProfileData> {
	const current = await getUserProfile(db, userId);
	const next = { ...current, ...patch };
	await db.prepare(
		'INSERT INTO user_profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
	).bind(userId, JSON.stringify(next), new Date().toISOString()).run();
	return next;
}

/* ── App ── */

export const appCreate: Handler = async () => json(makeApp());

export const appShow: Handler = async () => json(makeApp());

/* ── Auth (legacy OAuth-style) ── */

export const authAccept: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const authSessionGenerate: Handler = async () =>
	json({ token: generateId(), url: 'https://misslite.example/auth' });

export const authSessionShow: Handler = async () =>
	json({ id: generateId(), app: makeApp(), token: generateId() });

export const authSessionUserkey: Handler = async (db, body) => {
	const me = await getUser(db, body);
	return json({ accessToken: generateId(), user: me ? packUser(me) : {} });
};

/* ── 2FA ── */

export const i2faDone: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	await patchUserProfile(db, u.id, { twoFactorEnabled: true });
	return json({ backupCodes: [] });
};

export const i2faKeyDone: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const key = { id: generateId(), name: ((body.name ?? SECURITY_KEY_DEFAULT_NAME) as string) };
	const current = await getUserProfile(db, u.id);
	const keys = Array.isArray(current.securityKeys) ? current.securityKeys as Array<Record<string, unknown>> : [];
	await patchUserProfile(db, u.id, { securityKeys: [...keys, key], twoFactorEnabled: true });
	return json(key);
};

export const i2faPasswordLess: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const enabled = Boolean(body.enabled ?? body.usePasswordLessLogin ?? true);
	await patchUserProfile(db, u.id, { usePasswordLessLogin: enabled });
	return noContent();
};

export const i2faRegister: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({ qr: '', url: '', secret: '', label: u.username, issuer: 'Misslite' });
};

export const i2faRegisterKey: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({
		rp: { id: 'misslite.example', name: 'Misslite' },
		user: { id: u.id, name: u.username },
		challenge: generateId(), pubKeyCredParams: [], timeout: 60000,
		excludeCredentials: [], authenticatorSelection: {}, attestation: 'none', extensions: {},
	});
};

export const i2faRemoveKey: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const keyId = ((body.keyId ?? body.id ?? '') as string).trim();
	if (!keyId) return err('keyId required');
	const current = await getUserProfile(db, u.id);
	const keys = Array.isArray(current.securityKeys) ? current.securityKeys as Array<Record<string, unknown>> : [];
	await patchUserProfile(db, u.id, {
		securityKeys: keys.filter((k) => String(k.id ?? '') !== keyId),
	});
	return noContent();
};

export const i2faUnregister: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	await patchUserProfile(db, u.id, { twoFactorEnabled: false, securityKeys: [] });
	return noContent();
};

export const i2faUpdateKey: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const keyId = ((body.keyId ?? body.id ?? '') as string).trim();
	if (!keyId) return err('keyId required');
	const nextName = ((body.name ?? '') as string).trim();
	const current = await getUserProfile(db, u.id);
	const keys = Array.isArray(current.securityKeys) ? current.securityKeys as Array<Record<string, unknown>> : [];
	await patchUserProfile(db, u.id, {
		securityKeys: keys.map((k) => String(k.id ?? '') === keyId ? { ...k, name: nextName || String(k.name ?? SECURITY_KEY_DEFAULT_NAME) } : k),
	});
	return noContent();
};

/* ── User-scoped apps / authorized apps ── */

export const iApps: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const iAuthorizedApps: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

/* ── Webhooks ── */

export const iWebhooksCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeWebhook(u.id));
};

export const iWebhooksDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const iWebhooksList: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const iWebhooksShow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeWebhook(u.id));
};

export const iWebhooksTest: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const iWebhooksUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

/* ── MiAuth ── */

export const miauthGenToken: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const newToken = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(newToken, u.id).run();
	return json({ token: newToken });
};

/* ── My Apps ── */

export const myApps: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

/* ── i/update-email ── */

export const iUpdateEmail: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const email = ((body.email ?? '') as string).trim();
	if (!email) return err('email required');
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email');
	const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
		.bind(email, u.id).first<{ id: string }>();
	if (existing) return err('Email already used');
	await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, u.id).run();
	const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<DbUser>();
	const token = (body.i ?? body.token ?? '') as string;
	return json(await packCurrentUser(db, updated ?? u, token));
};
