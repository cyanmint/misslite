/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface Env {
	DB: D1Database;
	/** Password required for the initial admin account setup. Defaults to 'changeme'. */
	INITIAL_PASSWORD: string;
	/** Instance display name. Defaults to 'MissLite'. */
	INSTANCE_NAME?: string;
	/** Instance description shown in meta. */
	INSTANCE_DESCRIPTION?: string;
	/** Whether registration is open (invite-only = 'invite', open = 'open'). Defaults to 'invite'. */
	REGISTRATION_MODE?: string;
	/** Max note length. Defaults to 3000. */
	MAX_NOTE_LENGTH?: string;
	/** Theme colour for the instance. Defaults to '#86b300'. */
	THEME_COLOR?: string;
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

export interface DbAnnouncement {
	id: string;
	title: string;
	text: string;
	image_url: string | null;
	created_at: string;
	updated_at: string;
}

export interface DbNotification {
	id: string;
	user_id: string;
	type: string;
	notifier_id: string | null;
	note_id: string | null;
	reaction: string | null;
	is_read: number;
	created_at: string;
}

export type Handler = (db: D1Database, body: Record<string, unknown>, env: Env) => Promise<Response>;
