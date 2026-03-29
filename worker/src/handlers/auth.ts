/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { ensureSchema } from '../schema.js';
import { json, err, generateId, hashPassword, packUser } from '../helpers.js';
import type { DbUser } from '../types.js';

export const meta: Handler = async (db) => {
	await ensureSchema(db);
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>();
	const name = await db.prepare("SELECT value FROM meta WHERE key = 'name'").first<{ value: string }>();
	const desc = await db.prepare("SELECT value FROM meta WHERE key = 'description'").first<{ value: string }>();
	return json({
		maintainerName: 'admin',
		maintainerEmail: '',
		version: '2026.3.0',
		name: name?.value ?? 'MissLite',
		shortName: null,
		uri: 'https://misslite.example',
		description: desc?.value ?? 'A MissLite instance',
		langs: ['en-US'],
		disableRegistration: true,
		emailRequiredForSignup: false,
		enableHcaptcha: false,
		enableRecaptcha: false,
		enableTurnstile: false,
		maxNoteTextLength: 3000,
		enableEmail: false,
		enableServiceWorker: false,
		proxyAccountName: null,
		themeColor: '#86b300',
		mascotImageUrl: null,
		bannerUrl: null,
		backgroundImageUrl: null,
		logoImageUrl: null,
		iconUrl: null,
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
	await ensureSchema(db);
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first();
	if (initialized) return err('Already initialized', 403);

	const password = (body.password ?? '') as string;
	if (password !== env.INITIAL_PASSWORD) return err('Initial password is incorrect', 403);

	const username = (body.username ?? '') as string;
	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');

	const id = generateId();
	const pwHash = await hashPassword(password);
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

	const pwHash = await hashPassword(password);
	if (user.password_hash !== pwHash) return err('Incorrect password', 401);

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();
	return json({ id: user.id, i: token });
};

export const signup: Handler = async (db, body) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? '') as string;
	const inviteCode = (body.invitationCode ?? body.inviteCode ?? '') as string;

	if (!username || !/^[a-zA-Z0-9_]{1,20}$/.test(username)) return err('Invalid username');
	if (!password) return err('Password required');
	if (!inviteCode) return err('Invite code required');

	const invite = await db.prepare('SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL').bind(inviteCode).first();
	if (!invite) return err('Invalid or used invite code');

	const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
	if (existing) return err('Username already taken');

	const id = generateId();
	const pwHash = await hashPassword(password);
	await db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
		.bind(id, username, pwHash).run();
	await db.prepare('UPDATE invite_codes SET used_by = ?, used_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE code = ?')
		.bind(id, inviteCode).run();

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, id).run();

	const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
	return json({ ...packUser(user!, true), token });
};
