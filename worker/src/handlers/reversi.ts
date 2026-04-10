/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, requireUser, generateId } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

export const reversiCancelMatch: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const reversiGames: Handler = async () => json([]);

export const reversiInvitations: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const reversiMatch: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const reversiShowGame: Handler = async (_db, body) => json({
	id: (body.gameId as string) ?? '', createdAt: new Date().toISOString(),
	startedAt: null, endedAt: null, isStarted: false, isEnded: false,
	form1: null, form2: null, user1: null, user2: null, black: 0, bw: '',
	user1Id: null, user2Id: null, winnerId: null,
	user1Ready: false, user2Ready: false,
	winner: null, surrenderedUserId: null, timeoutUserId: null,
	noIrregularRules: false, isLlotheo: false,
	canPutEverywhere: false, loopedBoard: false, timeLimitForEachTurn: null,
	logs: [], map: [],
});

export const reversiSurrender: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const reversiVerify: Handler = async () => json({ desynced: false });
