/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * MissLite CF Worker — minimal Misskey-compatible backend
 * running on Cloudflare Workers with D1 as the database.
 */

import type { Env, Handler } from './types.js';
import { cors, json, err } from './helpers.js';
import { meta, adminAccountsCreate, signin, signup } from './handlers/auth.js';
import { currentUser, updateUser, showUser } from './handlers/users.js';
import { createNote, showNote, deleteNote, timeline, userNotes, createReaction, deleteReaction } from './handlers/notes.js';
import { suspendUser, unsuspendUser, addModerator, removeModerator, showUsers, createInvite, listInvites } from './handlers/admin.js';
import { emojis, stats, ping } from './handlers/misc.js';

const routes: Record<string, Handler> = {
	'meta': meta,
	'admin/accounts/create': adminAccountsCreate,
	'signin': signin,
	'signup': signup,
	'i': currentUser,
	'i/update': updateUser,
	'users/show': showUser,
	'notes/create': createNote,
	'notes/show': showNote,
	'notes/delete': deleteNote,
	'notes/timeline': timeline,
	'notes/local-timeline': timeline,
	'notes/global-timeline': timeline,
	'users/notes': userNotes,
	'notes/reactions/create': createReaction,
	'notes/reactions/delete': deleteReaction,
	'admin/suspend-user': suspendUser,
	'admin/unsuspend-user': unsuspendUser,
	'admin/moderators/add': addModerator,
	'admin/moderators/remove': removeModerator,
	'admin/show-users': showUsers,
	'invite/create': createInvite,
	'invite/list': listInvites,
	'emojis': emojis,
	'stats': stats,
	'ping': ping,
	'endpoints': async () => json(Object.keys(routes)),
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors() });
		}

		const url = new URL(request.url);
		const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

		if (!path || path === '') {
			return json({ name: 'MissLite CF', version: '0.1.0' });
		}

		const handler = routes[path];
		if (!handler) {
			return err('Unknown endpoint: ' + path, 404);
		}

		let body: Record<string, unknown> = {};
		if (request.method === 'POST') {
			try {
				body = await request.json() as Record<string, unknown>;
			} catch {
				body = {};
			}
		}

		try {
			return await handler(env.DB, body, env);
		} catch (e) {
			console.error('Handler error:', e);
			return err('Internal server error', 500);
		}
	},
};

export type { Env };
