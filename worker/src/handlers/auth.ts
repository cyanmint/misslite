/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, err, generateId, hashPassword, verifyPassword, packUser, requireUser, getMeta } from '../helpers.js';
import type { DbUser } from '../types.js';

export const meta: Handler = async (db, _body, env) => {
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>();
	const name = await getMeta(db, 'name') ?? env.INSTANCE_NAME ?? 'MissLite';
	const desc = await getMeta(db, 'description') ?? env.INSTANCE_DESCRIPTION ?? 'A lightweight Misskey-compatible instance';
	const themeColor = await getMeta(db, 'themeColor') ?? env.THEME_COLOR ?? '#86b300';
	const maxNoteLength = Number(await getMeta(db, 'maxNoteLength') ?? env.MAX_NOTE_LENGTH ?? 3000);
	const registrationMode = await getMeta(db, 'registrationMode') ?? env.REGISTRATION_MODE ?? 'invite';
	const bannerUrl = await getMeta(db, 'bannerUrl') ?? null;
	const iconUrl = await getMeta(db, 'iconUrl') ?? null;
	const backgroundImageUrl = await getMeta(db, 'backgroundImageUrl') ?? null;
	const maintainerName = await getMeta(db, 'maintainerName') ?? 'admin';
	const maintainerEmail = await getMeta(db, 'maintainerEmail') ?? '';
	return json({
		maintainerName,
		maintainerEmail,
		version: '2026.3.0',
		name,
		shortName: null,
		uri: 'https://misslite.example',
		description: desc,
		langs: ['en-US'],
		disableRegistration: registrationMode !== 'open',
		emailRequiredForSignup: false,
		enableHcaptcha: false,
		enableRecaptcha: false,
		enableTurnstile: false,
		maxNoteTextLength: maxNoteLength,
		enableEmail: false,
		enableServiceWorker: false,
		proxyAccountName: null,
		themeColor,
		mascotImageUrl: null,
		bannerUrl,
		backgroundImageUrl,
		logoImageUrl: null,
		iconUrl,
		features: {},
		requireSetup: !initialized,
		policies: {
			ltlAvailable: true,
			canPublicNote: true,
			canCreateContent: true,
			canInvite: true,
		},
		ads: [],
		notesCount: 0,
		usersCount: 0,
		federation: 'none',
		cacheRemoteFiles: false,
		cacheRemoteSensitiveFiles: false,
		mediaProxy: '',
	});
};

export const adminAccountsCreate: Handler = async (db, body, env) => {
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first();
	if (initialized) return err('Already initialized', 403);

	const setupToken = (body.token ?? '') as string;
	if (setupToken !== (env.INITIAL_PASSWORD ?? '')) return err('Initial password is incorrect', 403);

	const username = (body.username ?? '') as string;
	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');

	const password = (body.password ?? '') as string;
	if (!password) return err('Password required');

	const id = generateId();
	const pwHash = await hashPassword(username + password);
	await db.prepare('INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, 1)')
		.bind(id, username, pwHash).run();
	await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('initialized', 'true')").run();

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, id).run();

	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	return json({ ...packUser(user!, true), token });
};

export const signin: Handler = async (db, body) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? '') as string;
	if (!username || !password) return err('Missing credentials');

	const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	if (!user) return err('No such user', 401);
	if (user.is_suspended) return err('Account is suspended', 403);

	if (!await verifyPassword(username + password, user.password_hash)) return err('Incorrect password', 401);

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();
	return json({ id: user.id, i: token });
};

export const signout: Handler = async (db, body) => {
	const token = (body.i ?? body.token ?? '') as string;
	if (!token) return err('Authentication required', 401);
	await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
	return json({});
};

export const signup: Handler = async (db, body, env) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? '') as string;
	const inviteCode = (body.invitationCode ?? body.inviteCode ?? '') as string;

	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');
	if (!password) return err('Password required');

	const registrationMode = await getMeta(db, 'registrationMode') ?? env.REGISTRATION_MODE ?? 'invite';
	if (registrationMode !== 'open') {
		if (!inviteCode) return err('Invite code required');
		const invite = await db.prepare('SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL').bind(inviteCode).first();
		if (!invite) return err('Invalid or used invite code');
	}

	const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
	if (existing) return err('Username already taken');

	const id = generateId();
	const pwHash = await hashPassword(username + password);
	await db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
		.bind(id, username, pwHash).run();

	if (inviteCode && registrationMode !== 'open') {
		await db.prepare('UPDATE invite_codes SET used_by = ?, used_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE code = ?')
			.bind(id, inviteCode).run();
	}

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, id).run();

	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	return json({ ...packUser(user!, true), token });
};

export const changePassword: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const currentPassword = (body.currentPassword ?? '') as string;
	const newPassword = (body.newPassword ?? '') as string;
	if (!currentPassword || !newPassword) return err('currentPassword and newPassword required');
	if (newPassword.length < 1) return err('New password too short');

	if (!await verifyPassword(u.username + currentPassword, u.password_hash)) {
		return err('Current password is incorrect', 401);
	}

	const pwHash = await hashPassword(u.username + newPassword);
	await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(pwHash, u.id).run();
	// Invalidate all other sessions
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
	// Issue a new session
	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, u.id).run();
	return json({ i: token });
};
