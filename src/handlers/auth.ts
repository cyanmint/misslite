/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, err, generateId, hashPassword, verifyPassword, packSelf, requireUser, getMeta, DEFAULT_POLICIES } from '../helpers.js';
import type { DbUser } from '../types.js';

export const meta: Handler = async (db, _body, env) => {
	const parseMeta = async (key: string): Promise<unknown> => {
		const raw = await getMeta(db, key);
		if (raw == null) return undefined;
		try { return JSON.parse(raw); } catch { return raw; }
	};
	const initialized = await db.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>();
	const name = (await parseMeta('name') ?? env.INSTANCE_NAME ?? 'Misslite') as string;
	const desc = (await parseMeta('description') ?? env.INSTANCE_DESCRIPTION ?? 'A lightweight Misskey-compatible instance') as string;
	const themeColor = (await parseMeta('themeColor') ?? env.THEME_COLOR ?? '#86b300') as string;
	const maxNoteLength = Number(await parseMeta('maxNoteLength') ?? env.MAX_NOTE_LENGTH ?? 3000);
	const registrationMode = String(await parseMeta('registrationMode') ?? env.REGISTRATION_MODE ?? 'invite');
	const bannerUrl = (await parseMeta('bannerUrl') ?? null) as string | null;
	const iconUrl = (await parseMeta('iconUrl') ?? null) as string | null;
	const backgroundImageUrl = (await parseMeta('backgroundImageUrl') ?? null) as string | null;
	const maintainerName = (await parseMeta('maintainerName') ?? 'admin') as string;
	const maintainerEmail = (await parseMeta('maintainerEmail') ?? '') as string;
	const disableRegistration = (await parseMeta('disableRegistration') ?? (registrationMode !== 'open')) as boolean;
	const serverRules = (await parseMeta('serverRules') ?? []) as unknown[];
	const shortName = (await parseMeta('shortName') ?? null) as string | null;
	const uri = (await parseMeta('uri') ?? 'https://misslite.example') as string;
	const tosUrl = (await parseMeta('tosUrl') ?? null) as string | null;
	const privacyPolicyUrl = (await parseMeta('privacyPolicyUrl') ?? null) as string | null;
	const inquiryUrl = (await parseMeta('inquiryUrl') ?? null) as string | null;
	const impressumUrl = (await parseMeta('impressumUrl') ?? null) as string | null;
	const donationUrl = (await parseMeta('donationUrl') ?? null) as string | null;
	const repositoryUrl = (await parseMeta('repositoryUrl') ?? null) as string | null;
	const feedbackUrl = (await parseMeta('feedbackUrl') ?? null) as string | null;
	const logoImageUrl = (await parseMeta('logoImageUrl') ?? null) as string | null;
	const infoImageUrl = (await parseMeta('infoImageUrl') ?? null) as string | null;
	const serverErrorImageUrl = (await parseMeta('serverErrorImageUrl') ?? null) as string | null;
	const notFoundImageUrl = (await parseMeta('notFoundImageUrl') ?? null) as string | null;
	const defaultLightTheme = (await parseMeta('defaultLightTheme') ?? null) as unknown;
	const defaultDarkTheme = (await parseMeta('defaultDarkTheme') ?? null) as unknown;
	const cacheRemoteFiles = (await parseMeta('cacheRemoteFiles') ?? false) as boolean;
	const cacheRemoteSensitiveFiles = (await parseMeta('cacheRemoteSensitiveFiles') ?? false) as boolean;
	const googleAnalyticsId = (await parseMeta('googleAnalyticsId') ?? null) as string | null;
	const wellKnownWebsites = (await parseMeta('wellKnownWebsites') ?? []) as unknown[];
	const notesPerOneAd = Number(await parseMeta('notesPerOneAd') ?? 0);
	const policies = (await parseMeta('policies') ?? DEFAULT_POLICIES) as Record<string, unknown>;
	const maxFileSizeMb = Number(await parseMeta('maxFileSizeMb') ?? policies.maxFileSizeMb ?? DEFAULT_POLICIES.maxFileSizeMb);
	const enableEmail = Boolean(await parseMeta('enableEmail') ?? false);
	const enableServiceWorker = Boolean(await parseMeta('enableServiceWorker') ?? false);
	const swPublickey = (await parseMeta('swPublickey') ?? null) as string | null;
	const enableUrlPreview = Boolean(await parseMeta('urlPreviewEnabled') ?? false);
	return json({
		maintainerName,
		maintainerEmail,
		version: '2026.3.0',
		name,
		shortName,
		uri,
		description: desc,
		langs: ['en-US'],
		tosUrl,
		tosTextUrl: null,
		privacyPolicyUrl,
		inquiryUrl,
		impressumUrl,
		donationUrl,
		repositoryUrl,
		feedbackUrl,
		disableRegistration,
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
		enableEmail,
		enableServiceWorker,
		swPublickey,
		proxyAccountName: null,
		themeColor,
		mascotImageUrl: null,
		bannerUrl,
		backgroundImageUrl,
		logoImageUrl,
		infoImageUrl,
		serverErrorImageUrl,
		notFoundImageUrl,
		iconUrl,
		defaultLightTheme,
		defaultDarkTheme,
		features: {},
		requireSetup: !initialized,
		policies,
		entrancePageStyle: null,
		serverRules,
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
		cacheRemoteFiles,
		cacheRemoteSensitiveFiles,
		mediaProxy: '',
		translatorAvailable: false,
		enableUrlPreview,
		noteSearchableScope: 'local',
		maxFileSize: maxFileSizeMb * 1024 * 1024,
		dimensions: null,
		googleAnalyticsId,
		wellKnownWebsites,
		notesPerOneAd,
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
