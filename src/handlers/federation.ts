/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

export const federationFollowers: Handler = async () => json([]);
export const federationFollowing: Handler = async () => json([]);
export const federationInstances: Handler = async () => json([]);
export const federationShowInstance: Handler = async () => noContent();
export const federationStats: Handler = async () => json({
	topSubInstances: [], otherFollowersCount: 0,
	topPubInstances: [], otherFollowingCount: 0,
});
export const federationUpdateRemoteUser: Handler = async () => noContent();
export const federationUsers: Handler = async () => json([]);
