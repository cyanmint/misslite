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
	banner_url: string | null;
	email: string | null;
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

export interface DbFollowing {
	id: string;
	follower_id: string;
	followee_id: string;
	created_at: string;
}

export interface DbBlocking {
	id: string;
	blocker_id: string;
	blockee_id: string;
	created_at: string;
}

export interface DbMuting {
	id: string;
	muter_id: string;
	mutee_id: string;
	expires_at: string | null;
	created_at: string;
}

export interface DbRenoteMuting {
	id: string;
	muter_id: string;
	mutee_id: string;
	created_at: string;
}

export interface DbUserList {
	id: string;
	user_id: string;
	name: string;
	is_public: number;
	created_at: string;
}

export interface DbUserListMember {
	id: string;
	list_id: string;
	user_id: string;
	created_at: string;
}

export interface DbClip {
	id: string;
	user_id: string;
	name: string;
	is_public: number;
	description: string | null;
	created_at: string;
}

export interface DbClipNote {
	id: string;
	clip_id: string;
	note_id: string;
	created_at: string;
}

export interface DbChannel {
	id: string;
	user_id: string;
	name: string;
	description: string | null;
	color: string;
	banner_url: string | null;
	is_archived: number;
	created_at: string;
}

export interface DbAntenna {
	id: string;
	user_id: string;
	name: string;
	src: string;
	keywords: string;
	exclude_keywords: string;
	users_list_id: string | null;
	case_sensitive: number;
	local_only: number;
	exclude_bots: number;
	with_replies: number;
	with_file: number;
	is_active: number;
	created_at: string;
}

export interface DbRole {
	id: string;
	name: string;
	description: string;
	color: string | null;
	icon_url: string | null;
	target: string;
	cond_formula: string | null;
	is_public: number;
	is_moderator: number;
	is_administrator: number;
	is_explorable: number;
	as_badge: number;
	can_edit_members_by_moderator: number;
	display_order: number;
	policies: string;
	created_at: string;
	updated_at: string;
}

export interface DbRoleAssignment {
	id: string;
	role_id: string;
	user_id: string;
	expires_at: string | null;
	created_at: string;
}

export interface DbAbuseReport {
	id: string;
	reporter_id: string;
	target_user_id: string;
	comment: string;
	resolved: number;
	forwarded: number;
	assigned_moderator_id: string | null;
	created_at: string;
}

export interface DbPinnedNote {
	id: string;
	user_id: string;
	note_id: string;
	created_at: string;
}

export interface DbPage {
	id: string;
	user_id: string;
	name: string;
	title: string;
	summary: string | null;
	content: string;
	variables: string;
	script: string;
	font: string;
	align_center: number;
	hide_title_when_pinned: number;
	visibility: string;
	eye_catching_image_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface DbFlash {
	id: string;
	user_id: string;
	title: string;
	summary: string;
	script: string;
	visibility: string;
	liked_count: number;
	created_at: string;
	updated_at: string;
}

export interface DbGalleryPost {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	is_sensitive: number;
	liked_count: number;
	file_ids: string;
	created_at: string;
	updated_at: string;
}

export interface DbSwSubscription {
	id: string;
	user_id: string;
	endpoint: string;
	auth: string | null;
	publickey: string | null;
	send_read_message: number;
	created_at: string;
}

export type Handler = (db: D1Database, body: Record<string, unknown>, env: Env) => Promise<Response>;
