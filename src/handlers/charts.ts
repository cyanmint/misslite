/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json } from '../helpers.js';

export const chartsActiveUsers: Handler = async () => json({
	readWrite: [], read: [], write: [],
	registeredWithinWeek: [], registeredWithinMonth: [], registeredWithinYear: [],
	registeredOutsideWeek: [], registeredOutsideMonth: [], registeredOutsideYear: [],
});

export const chartsApRequest: Handler = async () => json({
	deliverFailed: [], deliverSucceeded: [], inboxReceived: [],
});

export const chartsFederation: Handler = async () => json({
	deliveredInstances: [], inboxInstances: [], stalled: [],
	sub: [], pub: [], pubActive: [], subActive: [], received: [], instance: [],
	pubsub: [],
});

export const chartsInstance: Handler = async () => json({
	requests: { failed: [], succeeded: [], received: [] },
	notes: { total: [], inc: [], dec: [], diffs: { normal: [], renote: [], reply: [], withFile: [] } },
	users: { total: [], inc: [], dec: [] },
	following: { total: [], inc: [], dec: [] },
	followers: { total: [], inc: [], dec: [] },
	drive: { totalFiles: [], totalUsage: [], incFiles: [], incUsage: [], decFiles: [], decUsage: [] },
});

export const chartsUserDrive: Handler = async () => json({
	totalCount: [], totalSize: [], incCount: [], incSize: [], decCount: [], decSize: [],
});

export const chartsUserNotes: Handler = async () => json({
	total: [], inc: [], dec: [],
	diffs: { normal: [], renote: [], reply: [], withFile: [] },
});

export const chartsUserPv: Handler = async () => json({ upv: [], pv: [] });

const chartResult: Handler = async () => json({
	diffs: { normal: [], reply: [], renote: [], withFile: [] },
	local: { normal: [], reply: [], renote: [], withFile: [] },
	remote: { normal: [], reply: [], renote: [], withFile: [] },
});

export const chartsDrive = chartResult;
export const chartsNotes = chartResult;
export const chartsUserFollowing = chartResult;
export const chartsUserReactions = chartResult;
export const chartsUsers = chartResult;
