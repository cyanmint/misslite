/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * MissLite CF Worker — minimal Misskey-compatible backend
 * running on Cloudflare Workers with D1 as the database.
 */

import type { Env, Handler } from './types.js';
import { cors, json, err } from './helpers.js';
import { ensureSchema } from './schema.js';
import { meta, adminAccountsCreate, signin, signout, signup, changePassword } from './handlers/auth.js';
import { currentUser, updateUser, showUser, searchUsers } from './handlers/users.js';
import {
	createNote, showNote, deleteNote, timeline, userNotes, searchNotes,
	noteState, noteMentions, noteConversation,
	createReaction, deleteReaction, listReactions,
	createFavorite, deleteFavorite, listFavorites,
} from './handlers/notes.js';
import {
	suspendUser, unsuspendUser, addModerator, removeModerator, showUsers,
	createInvite, listInvites,
	deleteAccount, resetPassword, updateMeta, showModerationLogs,
	listAnnouncements, createAnnouncement, deleteAnnouncement,
} from './handlers/admin.js';
import { emojis, stats, ping, serverInfo, listNotifications, markNotificationsRead } from './handlers/misc.js';
import { registryGetAll, registryGet, registrySet, registryRemove, registryKeys } from './handlers/registry.js';

const routes: Record<string, Handler> = {
	// Instance
	'meta': meta,
	'ping': ping,
	'stats': stats,
	'emojis': emojis,
	'server-info': serverInfo,
	'announcements': listAnnouncements,

	// Auth
	'admin/accounts/create': adminAccountsCreate,
	'signin': signin,
	'signout': signout,
	'signup': signup,
	'i/change-password': changePassword,

	// Users
	'i': currentUser,
	'i/update': updateUser,
	'users/show': showUser,
	'users/search': searchUsers,

	// Notes
	'notes/create': createNote,
	'notes/show': showNote,
	'notes/delete': deleteNote,
	'notes/timeline': timeline,
	'notes/local-timeline': timeline,
	'notes/global-timeline': timeline,
	'users/notes': userNotes,
	'notes/search': searchNotes,
	'notes/state': noteState,
	'notes/mentions': noteMentions,
	'notes/conversation': noteConversation,

	// Reactions
	'notes/reactions/create': createReaction,
	'notes/reactions/delete': deleteReaction,
	'notes/reactions': listReactions,

	// Favorites
	'notes/favorites/create': createFavorite,
	'notes/favorites/delete': deleteFavorite,
	'i/favorites': listFavorites,

	// Notifications
	'i/notifications': listNotifications,
	'notifications/mark-all-as-read': markNotificationsRead,

	// Admin / Moderation
	'admin/suspend-user': suspendUser,
	'admin/unsuspend-user': unsuspendUser,
	'admin/moderators/add': addModerator,
	'admin/moderators/remove': removeModerator,
	'admin/show-users': showUsers,
	'admin/delete-account': deleteAccount,
	'admin/reset-password': resetPassword,
	'admin/update-meta': updateMeta,
	'admin/show-moderation-logs': showModerationLogs,
	'admin/announcements/create': createAnnouncement,
	'admin/announcements/delete': deleteAnnouncement,

	// Invites
	'invite/create': createInvite,
	'invite/list': listInvites,

	'endpoints': async () => json(Object.keys(routes)),

	// Registry (user preferences / frontend settings store)
	'i/registry/get-all': registryGetAll,
	'i/registry/get': registryGet,
	'i/registry/set': registrySet,
	'i/registry/remove': registryRemove,
	'i/registry/keys': registryKeys,
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors() });
		}

		const url = new URL(request.url);

		// .well-known/nodeinfo — federation discovery stub
		if (url.pathname === '/.well-known/nodeinfo') {
			return json({
				links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${url.origin}/nodeinfo/2.1` }],
			});
		}
		if (url.pathname === '/nodeinfo/2.1') {
			const initialized = await env.DB.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>().catch(() => null);
			const users = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>().catch(() => ({ c: 0 }));
			const notes = await env.DB.prepare('SELECT COUNT(*) as c FROM notes').first<{ c: number }>().catch(() => ({ c: 0 }));
			return json({
				version: '2.1',
				software: { name: 'misslite', version: '2026.3.0' },
				protocols: ['misskey'],
				usage: { users: { total: users?.c ?? 0 }, localPosts: notes?.c ?? 0 },
				openRegistrations: !initialized,
			});
		}

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
			await ensureSchema(env.DB);
			return await handler(env.DB, body, env);
		} catch (e) {
			console.error('Handler error:', e);
			return err('Internal server error', 500);
		}
	},
};

export type { Env };
