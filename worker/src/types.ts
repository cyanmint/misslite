/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface Env {
	DB: D1Database;
	INITIAL_PASSWORD: string;
}

export interface DbUser {
	id: string;
	username: string;
	password_hash: string;
	name: string | null;
	description: string;
	avatar_url: string | null;
	is_admin: number;
	is_moderator: number;
	is_suspended: number;
	created_at: string;
}

export interface DbNote {
	id: string;
	user_id: string;
	text: string | null;
	cw: string | null;
	visibility: string;
	reply_id: string | null;
	renote_id: string | null;
	created_at: string;
}

export type Handler = (db: D1Database, body: Record<string, unknown>, env: Env) => Promise<Response>;
