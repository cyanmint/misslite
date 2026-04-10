/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, err } from '../helpers.js';

export const hashtagsTrend: Handler = async () => json([]);

export const hashtagsList: Handler = async () => json([]);

export const hashtagsSearch: Handler = async (_db, body) => {
	const query = ((body.query ?? '') as string).trim();
	if (!query) return err('query required');
	return json([]);
};

export const hashtagsShow: Handler = async (_db, body) => {
	const tag = (body.tag ?? '') as string;
	if (!tag) return err('tag required');
	return json({
		tag,
		mentionedUsersCount: 0,
		mentionedLocalUsersCount: 0,
		mentionedRemoteUsersCount: 0,
		attachedUsersCount: 0,
		attachedLocalUsersCount: 0,
		attachedRemoteUsersCount: 0,
	});
};

export const hashtagsUsers: Handler = async () => json([]);
