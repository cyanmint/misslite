/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json } from '../helpers.js';

export const emojis: Handler = async () => json({ emojis: [] });

export const stats: Handler = async (db) => {
	const users = await db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
	const notes = await db.prepare('SELECT COUNT(*) as c FROM notes').first<{ c: number }>();
	return json({
		notesCount: notes?.c ?? 0,
		originalNotesCount: notes?.c ?? 0,
		usersCount: users?.c ?? 0,
		originalUsersCount: users?.c ?? 0,
		reactionsCount: 0,
		instances: 0,
		driveUsageLocal: 0,
		driveUsageRemote: 0,
	});
};

export const ping: Handler = async () => json({ pong: Date.now() });
