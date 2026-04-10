/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Auto-generated stub routes for unimplemented Misskey API endpoints.
 */

import type { Handler } from '../types.js';
import type { DbUser } from '../types.js';
import { json, requireUser, getUser, packUser, packSelf, generateId } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

const emptyArr: Handler = async () => json([]);
const emptyObj: Handler = async () => json({});
const authedNoContent: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return noContent();
};
const authedArr: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json([]);
};

/* ── Chart shapes ── */
// Notes/drive charts: already correct shape
const chartResult: Handler = async () => json({
	diffs: { normal: [], reply: [], renote: [], withFile: [] },
	local: { normal: [], reply: [], renote: [], withFile: [] },
	remote: { normal: [], reply: [], renote: [], withFile: [] },
});

const activeUsersChart: Handler = async () => json({
	readWrite: [], read: [], write: [],
	registeredWithinWeek: [], registeredWithinMonth: [], registeredWithinYear: [],
	registeredOutsideWeek: [], registeredOutsideMonth: [], registeredOutsideYear: [],
});

const apRequestChart: Handler = async () => json({
	deliverFailed: [], deliverSucceeded: [], inboxReceived: [],
});

const federationChart: Handler = async () => json({
	deliveredInstances: [], inboxInstances: [], stalled: [],
	sub: [], pub: [], pubActive: [], subActive: [], received: [], instance: [],
	pubsub: [],
});

const instanceChart: Handler = async () => json({
	requests: { failed: [], succeeded: [], received: [] },
	notes: { total: [], inc: [], dec: [], diffs: { normal: [], renote: [], reply: [], withFile: [] } },
	users: { total: [], inc: [], dec: [] },
	following: { total: [], inc: [], dec: [] },
	followers: { total: [], inc: [], dec: [] },
	drive: { totalFiles: [], totalUsage: [], incFiles: [], incUsage: [], decFiles: [], decUsage: [] },
});

const userDriveChart: Handler = async () => json({
	totalCount: [], totalSize: [], incCount: [], incSize: [], decCount: [], decSize: [],
});

const userNotesChart: Handler = async () => json({
	total: [], inc: [], dec: [],
	diffs: { normal: [], renote: [], reply: [], withFile: [] },
});

const userPvChart: Handler = async () => json({ upv: [], pv: [] });

/* ── Drive shapes ── */
function makeDriveFile(userId: string | null = null): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(),
		name: 'file.bin', type: 'application/octet-stream',
		md5: '00000000000000000000000000000000', size: 0,
		isSensitive: false, blurhash: null, properties: {},
		url: null, thumbnailUrl: null, webpublicUrl: null, comment: null,
		folderId: null, folder: null, userId, user: null,
		// Admin-visible fields
		userHost: null, storedInternal: false,
		accessKey: null, thumbnailAccessKey: null, webpublicAccessKey: null,
		uri: null, src: null, isLink: false,
	};
}

function makeDriveFolder(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(),
		name: 'folder', parentId: null, parent: null,
		foldersCount: 0, filesCount: 0,
	};
}

const driveFile: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeDriveFile(u.id));
};

const driveFolder: Handler = async (db, body) => {
	const u = await requireUser(db, body); if (u instanceof Response) return u;
	return json(makeDriveFolder());
};

/* ── Webhook shape ── */
function makeWebhook(userId: string): Record<string, unknown> {
	return {
		id: generateId(), userId, name: '', on: [], url: '', secret: null,
		active: true, latestSentAt: null, latestStatus: null,
		updatedAt: new Date().toISOString(),
	};
}

/* ── App/Auth shapes ── */
function makeApp(): Record<string, unknown> {
	return { id: generateId(), name: 'app', callbackUrl: null, permission: [], isAuthorized: false };
}

/* ── Admin object shapes ── */
function makeAbuseResolver(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(),
		name: '', targetUserPattern: null, reporterPattern: null,
		reportContentPattern: null, expiresAt: null,
	};
}

function makeNotificationRecipient(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
		isActive: true, name: '', method: 'email',
	};
}

function makeSystemWebhook(): Record<string, unknown> {
	return {
		id: generateId(), isActive: true, updatedAt: new Date().toISOString(),
		latestSentAt: null, latestStatus: null, name: '', url: '', secret: '', on: [],
	};
}

function makeAdminEmoji(): Record<string, unknown> {
	return {
		id: generateId(), aliases: [], name: '', category: null, host: null,
		url: '', isSensitive: false, localOnly: false, license: null,
		roleIdsThatCanBeUsedThisDecoration: [],
	};
}

export const stubRoutes: Record<string, Handler> = {
	/* ── Abuse Report Resolvers ── */
	'admin/abuse-report-resolver/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ ...makeAbuseResolver(), forward: false });
	},
	'admin/abuse-report-resolver/delete': authedNoContent,
	'admin/abuse-report-resolver/list': authedArr,
	'admin/abuse-report-resolver/update': authedNoContent,

	/* ── Abuse Report Notification Recipients ── */
	'admin/abuse-report/notification-recipient/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeNotificationRecipient());
	},
	'admin/abuse-report/notification-recipient/delete': authedNoContent,
	'admin/abuse-report/notification-recipient/list': authedArr,
	'admin/abuse-report/notification-recipient/show': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeNotificationRecipient());
	},
	'admin/abuse-report/notification-recipient/update': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeNotificationRecipient());
	},

	/* ── Admin Accounts ── */
	'admin/accounts/delete': authedNoContent,
	'admin/accounts/find-by-email': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		if (!u.is_admin && !u.is_moderator) return new Response(JSON.stringify({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
		// Try to find user by email (fallback: return admin user)
		const email = (body.email ?? '') as string;
		let target: DbUser | null = null;
		if (email) {
			target = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<DbUser>();
		}
		if (!target) target = u;
		return json(packUser(target, true));
	},
	'admin/accounts/pending/list': authedArr,
	'admin/accounts/pending/revoke': authedNoContent,

	/* ── Admin Ads ── */
	'admin/ad/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({
			id: generateId(), expiresAt: (body.expiresAt as string | null) ?? null,
			startsAt: new Date().toISOString(), place: (body.place as string) ?? 'header',
			priority: (body.priority as string) ?? 'middle', ratio: 1,
			url: (body.url as string) ?? '', imageUrl: (body.imageUrl as string) ?? '',
			imageBlurhash: null, dayOfWeek: 0, isSensitive: false, memo: '',
		});
	},
	'admin/ad/delete': authedNoContent,
	'admin/ad/list': authedArr,
	'admin/ad/update': authedNoContent,

	/* ── Avatar Decorations ── */
	'admin/avatar-decorations/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({
			id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			name: (body.name as string) ?? '', description: (body.description as string) ?? '',
			url: (body.url as string) ?? '', roleIdsThatCanBeUsedThisDecoration: [],
		});
	},
	'admin/avatar-decorations/delete': authedNoContent,
	'admin/avatar-decorations/list': authedArr,
	'admin/avatar-decorations/update': authedNoContent,

	/* ── Captcha ── */
	'admin/captcha/current': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ provider: 'none', hcaptcha: null, mcaptcha: null, recaptcha: null, turnstile: null, testcaptcha: null });
	},
	'admin/captcha/save': authedNoContent,

	/* ── Drive Admin ── */
	'admin/drive/clean-remote-files': authedNoContent,
	'admin/drive/cleanup': authedNoContent,
	'admin/drive/delete-all-files-of-a-user': authedNoContent,
	'admin/drive/files': authedArr,
	'admin/drive/show-file': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeDriveFile(null));
	},

	/* ── Emoji Admin ── */
	'admin/emoji/add': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeAdminEmoji());
	},
	'admin/emoji/add-aliases-bulk': authedNoContent,
	'admin/emoji/copy': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ id: generateId() });
	},
	'admin/emoji/delete': authedNoContent,
	'admin/emoji/delete-bulk': authedNoContent,
	'admin/emoji/import-zip': authedNoContent,
	'admin/emoji/list': authedArr,
	'admin/emoji/list-remote': authedArr,
	'admin/emoji/remove-aliases-bulk': authedNoContent,
	'admin/emoji/set-aliases-bulk': authedNoContent,
	'admin/emoji/set-category-bulk': authedNoContent,
	'admin/emoji/set-license-bulk': authedNoContent,
	'admin/emoji/update': authedNoContent,

	/* ── Federation Admin ── */
	'admin/federation/delete-all-files': authedNoContent,
	'admin/federation/refresh-remote-instance-metadata': authedNoContent,
	'admin/federation/remove-all-following': authedNoContent,
	'admin/federation/update-instance': authedNoContent,

	/* ── User Admin ── */
	'admin/get-user-ips': authedArr,

	/* ── IndieAuth ── */
	'admin/indie-auth/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({
			id: generateId(), createdAt: new Date().toISOString(),
			name: (body.name as string) ?? '', redirectUris: (body.redirectUris as string[]) ?? [],
			secretData: {},
		});
	},
	'admin/indie-auth/delete': authedNoContent,
	'admin/indie-auth/list': authedArr,
	'admin/indie-auth/update': authedNoContent,

	/* ── Promo / Queue / Relays ── */
	'admin/promo/create': authedNoContent,
	'admin/queue/clear': authedNoContent,
	'admin/queue/deliver-delayed': authedArr,
	'admin/queue/inbox-delayed': authedArr,
	'admin/queue/promote': authedNoContent,
	'admin/queue/stats': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const q = { waiting: 0, active: 0, delayed: 0, paused: 0 };
		return json({ deliver: { ...q }, inbox: { ...q }, db: { ...q }, objectStorage: { ...q } });
	},
	'admin/relays/add': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ id: generateId(), inbox: (body.inbox as string) ?? '', status: 'requesting' });
	},
	'admin/relays/list': authedArr,
	'admin/relays/remove': authedNoContent,
	'admin/send-email': authedNoContent,

	/* ── SSO ── */
	'admin/sso/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({
			id: generateId(), createdAt: new Date().toISOString(),
			name: (body.name as string) ?? '', type: (body.type as string) ?? 'saml',
			issuer: (body.issuer as string) ?? '',
			audience: null, binding: 'post', acsUrl: null, publicKey: null, signatureAlgorithm: 'sha256',
			wantAuthnRequestsSigned: false, wantAssertionsSigned: false, wantEmailAddressNormalized: false,
		});
	},
	'admin/sso/delete': authedNoContent,
	'admin/sso/list': authedArr,
	'admin/sso/update': authedNoContent,

	/* ── System Webhooks ── */
	'admin/system-webhook/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeSystemWebhook());
	},
	'admin/system-webhook/delete': authedNoContent,
	'admin/system-webhook/list': authedArr,
	'admin/system-webhook/show': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeSystemWebhook());
	},
	'admin/system-webhook/test': authedNoContent,
	'admin/system-webhook/update': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeSystemWebhook());
	},

	/* ── Misc Admin ── */
	'admin/unset-user-mutual-link': authedNoContent,
	'admin/update-proxy-account': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		if (!u.is_admin) return new Response(JSON.stringify({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
		return json(packUser(u, true));
	},

	/* ── ActivityPub ── */
	'ap/get': emptyObj,
	'ap/show': emptyObj,

	/* ── App / Auth ── */
	'app/create': async (db, body) => json(makeApp()),
	'app/show': async (db, body) => json(makeApp()),
	'auth/accept': authedNoContent,
	'auth/session/generate': async (db, body) => json({ token: generateId(), url: 'https://misslite.example/auth' }),
	'auth/session/show': async (db, body) => json({ id: generateId(), app: makeApp(), token: generateId() }),
	'auth/session/userkey': async (db, body) => {
		const me = await getUser(db, body);
		return json({ accessToken: generateId(), user: me ? packUser(me) : {} });
	},

	/* ── Charts ── */
	'charts/active-users': activeUsersChart,
	'charts/ap-request': apRequestChart,
	'charts/drive': chartResult,
	'charts/federation': federationChart,
	'charts/instance': instanceChart,
	'charts/notes': chartResult,
	'charts/user/drive': userDriveChart,
	'charts/user/following': chartResult,
	'charts/user/notes': userNotesChart,
	'charts/user/pv': userPvChart,
	'charts/user/reactions': chartResult,
	'charts/users': chartResult,

	/* ── Drive ── */
	'drive': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ capacity: 0, usage: 0 });
	},
	'drive/files/attached-notes': authedArr,
	'drive/files/check-existence': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ result: false });
	},
	'drive/files/create': driveFile,
	'drive/files/delete': authedNoContent,
	'drive/files/find': authedArr,
	'drive/files/find-by-hash': authedArr,
	'drive/files/show': driveFile,
	'drive/files/update': driveFile,
	'drive/files/upload-from-url': authedNoContent,
	'drive/folders/create': driveFolder,
	'drive/folders/delete': authedNoContent,
	'drive/folders/find': authedArr,
	'drive/folders/show': driveFolder,
	'drive/folders/update': driveFolder,
	'drive/stream': authedArr,

	/* ── Misc ── */
	'export-custom-emojis': authedNoContent,
	'federation/followers': emptyArr,
	'federation/following': emptyArr,
	'federation/instances': emptyArr,
	'federation/show-instance': async () => noContent(),
	'federation/stats': async () => json({ topSubInstances: [], otherFollowersCount: 0, topPubInstances: [], otherFollowingCount: 0 }),
	'federation/update-remote-user': async () => noContent(),
	'federation/users': emptyArr,

	/* ── 2FA ── */
	'i/2fa/done': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ backupCodes: [] });
	},
	'i/2fa/key-done': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ id: generateId(), name: 'Security Key' });
	},
	'i/2fa/password-less': authedNoContent,
	'i/2fa/register': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ qr: '', url: '', secret: '', label: u.username, issuer: 'MissLite' });
	},
	'i/2fa/register-key': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({
			rp: { id: 'misslite.example', name: 'MissLite' },
			user: { id: u.id, name: u.username },
			challenge: generateId(), pubKeyCredParams: [], timeout: 60000,
			excludeCredentials: [], authenticatorSelection: {}, attestation: 'none', extensions: {},
		});
	},
	'i/2fa/remove-key': authedNoContent,
	'i/2fa/unregister': authedNoContent,
	'i/2fa/update-key': authedNoContent,
	'i/apps': authedArr,
	'i/authorized-apps': authedArr,
	'i/export-antennas': authedNoContent,
	'i/export-blocking': authedNoContent,
	'i/export-clips': authedNoContent,
	'i/export-favorites': authedNoContent,
	'i/export-following': authedNoContent,
	'i/export-mute': authedNoContent,
	'i/export-notes': authedNoContent,
	'i/export-user-lists': authedNoContent,
	'i/import-antennas': authedNoContent,
	'i/import-blocking': authedNoContent,
	'i/import-following': authedNoContent,
	'i/import-muting': authedNoContent,
	'i/import-user-lists': authedNoContent,
	'i/update-email': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const token = (body.i ?? body.token ?? '') as string;
		return json(packSelf(u, token));
	},

	/* ── Webhooks (stubbed with shape) ── */
	'i/webhooks/create': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeWebhook(u.id));
	},
	'i/webhooks/delete': authedNoContent,
	'i/webhooks/list': authedArr,
	'i/webhooks/show': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json(makeWebhook(u.id));
	},
	'i/webhooks/test': authedNoContent,
	'i/webhooks/update': authedNoContent,

	/* ── MiAuth ── */
	'miauth/gen-token': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		const newToken = generateId() + generateId();
		await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(newToken, u.id).run();
		return json({ token: newToken });
	},

	/* ── My Apps ── */
	'my/apps': authedArr,

	/* ── Notes ── */
	'notes': emptyArr,
	'notes/scheduled/cancel': authedNoContent,
	'notes/scheduled/list': authedArr,
	'notes/translate': authedNoContent,
	'notifications/test-notification': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		await db.prepare('INSERT INTO notifications (id, user_id, type) VALUES (?, ?, ?)').bind(generateId(), u.id, 'test').run();
		return noContent();
	},

	/* ── Reversi ── */
	'reversi/cancel-match': authedNoContent,
	'reversi/games': emptyArr,
	'reversi/invitations': authedArr,
	'reversi/match': authedNoContent,
	'reversi/show-game': async (db, body) => json({
		id: (body.gameId as string) ?? '', createdAt: new Date().toISOString(),
		startedAt: null, endedAt: null, isStarted: false, isEnded: false,
		form1: null, form2: null, user1: null, user2: null, black: 0, bw: '',
		user1Id: null, user2Id: null, winnerId: null,
		user1Ready: false, user2Ready: false,
		winner: null, surrenderedUserId: null, timeoutUserId: null,
		noIrregularRules: false, isLlotheo: false,
		canPutEverywhere: false, loopedBoard: false, timeLimitForEachTurn: null,
		logs: [], map: [],
	}),
	'reversi/surrender': authedNoContent,
	'reversi/verify': async (db, body) => json({ desynced: false }),

	/* ── Users ── */
	'users/get-skeb-status': async (db, body) => json({
		screenName: '', isCreator: false, isAcceptable: false,
		creatorRequestCount: 0, clientRequestCount: 0, skills: [],
	}),

	/* ── v2 Admin Emoji ── */
	'v2/admin/emoji/list': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		return json({ emojis: [], count: 0, allCount: 0, allPages: 0 });
	},
};

