/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Auto-generated stub routes for unimplemented Misskey API endpoints.
 */

import type { Handler } from '../types.js';
import { json, requireUser, generateId } from '../helpers.js';

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

export const stubRoutes: Record<string, Handler> = {
	/* ── ActivityPub ── */
	'ap/get': emptyObj,
	'ap/show': emptyObj,

	/* ── Export / Import ── */
	'export-custom-emojis': authedNoContent,
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

	/* ── Notes (scheduled/translate) ── */
	'notes': emptyArr,
	'notes/scheduled/cancel': authedNoContent,
	'notes/scheduled/list': authedArr,
	'notes/translate': authedNoContent,
	'notifications/test-notification': async (db, body) => {
		const u = await requireUser(db, body); if (u instanceof Response) return u;
		await db.prepare('INSERT INTO notifications (id, user_id, type) VALUES (?, ?, ?)').bind(generateId(), u.id, 'test').run();
		return noContent();
	},

	/* ── Users ── */
	'users/get-skeb-status': async (db, body) => json({
		screenName: '', isCreator: false, isAcceptable: false,
		creatorRequestCount: 0, clientRequestCount: 0, skills: [],
	}),
};
