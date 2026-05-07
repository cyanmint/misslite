/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, requireUser, getUser, packUser, packSelf, generateId } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

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
	return json({ backupCodes: [] });
};

export const i2faKeyDone: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({ id: generateId(), name: 'Security Key' });
};

export const i2faPasswordLess: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
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
	return noContent();
};

export const i2faUnregister: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const i2faUpdateKey: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
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
	const token = (body.i ?? body.token ?? '') as string;
	return json(packSelf(u, token));
};
