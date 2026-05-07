/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, err, generateId, hashPassword, verifyPassword, packSelf, requireUser, getMeta, DEFAULT_POLICIES } from '../helpers.js';
import type { DbUser } from '../types.js';

export const meta: Handler = async (db, _body, env) => {
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>();
	const name = await getMeta(db, 'name') ?? env.INSTANCE_NAME ?? 'Misslite';
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
		tosUrl: null,
		tosTextUrl: null,
		privacyPolicyUrl: null,
		inquiryUrl: null,
		impressumUrl: null,
		donationUrl: null,
		repositoryUrl: null,
		feedbackUrl: null,
		disableRegistration: registrationMode !== 'open',
		approvalRequiredForSignup: false,
		emailRequiredForSignup: false,
		enableHcaptcha: false,
		hcaptchaSiteKey: null,
		enableMcaptcha: false,
		mcaptchaSiteKey: null,
		mcaptchaInstanceUrl: null,
		enableRecaptcha: false,
		recaptchaSiteKey: null,
		enableTurnstile: false,
		turnstileSiteKey: null,
		enableTestcaptcha: false,
		maxNoteTextLength: maxNoteLength,
		enableEmail: false,
		enableServiceWorker: false,
		swPublickey: null,
		proxyAccountName: null,
		themeColor,
		mascotImageUrl: null,
		bannerUrl,
		backgroundImageUrl,
		logoImageUrl: null,
		infoImageUrl: null,
		serverErrorImageUrl: null,
		notFoundImageUrl: null,
		iconUrl,
		defaultLightTheme: null,
		defaultDarkTheme: null,
		features: {},
		requireSetup: !initialized,
		policies: DEFAULT_POLICIES,
		entrancePageStyle: null,
		serverRules: [],
		pinnedUsers: [],
		ads: [],
		notesCount: 0,
		usersCount: 0,
		reactionsCount: 0,
		localPostsCount: 0,
		localUsersCount: 0,
		instances: 0,
		driveCapacityPerLocalUserMb: 0,
		driveCapacityPerRemoteUserMb: 0,
		federation: 'none',
		cacheRemoteFiles: false,
		cacheRemoteSensitiveFiles: false,
		mediaProxy: '',
		translatorAvailable: false,
		enableUrlPreview: false,
		noteSearchableScope: 'local',
		maxFileSize: 0,
		dimensions: null,
		googleAnalyticsId: null,
		wellKnownWebsites: [],
		notesPerOneAd: 0,
		sentryForFrontend: null,
		enableSkebStatus: false,
		clientOptions: {
			entrancePageStyle: null,
			showTimelineForVisitor: false,
			showActivitiesForVisitor: false,
		},
	});
};

export const adminAccountsCreate: Handler = async (db, body, env) => {
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first();
	if (initialized) return err('Already initialized', 403);

	// setupPassword is the server-side setup secret; password is the admin's login credential.
	// Mirrors the Misskey frontend field name: body.setupPassword (welcome.setup.vue).
	const setupPassword = (body.setupPassword ?? null) as string | null;
	const expectedPassword = (env.INITIAL_PASSWORD ?? null) as string | null;
	if (expectedPassword != null) {
		if (setupPassword !== expectedPassword) return err('Initial password is incorrect', 403);
	} else if (setupPassword != null && setupPassword.trim() !== '') {
		return err('Initial password is incorrect', 403);
	}

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
	return json(packSelf(user!, token));
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

export const signinFlow: Handler = async (db, body) => {
	const username = (body.username ?? '') as string;
	const password = (body.password ?? null) as string | null;

	if (!username) return err('Username required');

	const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<DbUser>();
	if (!user) return err('No such user', 401);
	if (user.is_suspended) return err('Account is suspended', 403);

	// First step: only username provided → tell frontend to ask for password
	if (!password) {
		return json({ id: user.id, next: 'password', finished: false });
	}

	// Second step: validate password
	if (!await verifyPassword(username + password, user.password_hash)) {
		return err('Incorrect password', 401);
	}

	const token = generateId() + generateId();
	await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();
	// Return MeDetailed + finished flag. Include both `token` and `i` so all
	// frontend code paths can find the session credential.
	return json({ ...packSelf(user, token), i: token, finished: true });
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
	return json(packSelf(user!, token));
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
