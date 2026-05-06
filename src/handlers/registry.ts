/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, err, generateId, requireUser } from '../helpers.js';

/**
 * Normalise a scope array to a canonical JSON string for DB storage.
 * Scope is an array of strings like ['misskey', 'user-setting'].
 */
function serializeScope(scope: unknown): string {
	if (!Array.isArray(scope)) return '[]';
	return JSON.stringify(scope.map(String));
}

/**
 * Normalise the domain parameter.  Misskey passes either null (own user) or a
 * third-party app domain.  We store NULL in the DB for "own user" entries.
 */
function normalizeDomain(domain: unknown): string | null {
	if (domain == null || domain === '') return null;
	return String(domain);
}

/** i/registry/get-all — Returns all key→value pairs for a given scope. */
export const registryGetAll: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const scope = serializeScope(body.scope ?? []);
	const domain = normalizeDomain(body.domain);

	const rows = domain != null
		? await db.prepare('SELECT key, value FROM registry_items WHERE user_id = ? AND domain = ? AND scope = ?')
			.bind(u.id, domain, scope).all<{ key: string; value: string }>()
		: await db.prepare('SELECT key, value FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ?')
			.bind(u.id, scope).all<{ key: string; value: string }>();

	const result: Record<string, unknown> = {};
	for (const row of rows.results ?? []) {
		try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
	}
	return json(result);
};

/** i/registry/get — Returns the value for a single key in a scope. */
export const registryGet: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const key = (body.key ?? '') as string;
	if (!key) return err('key is required');

	const scope = serializeScope(body.scope ?? []);
	const domain = normalizeDomain(body.domain);

	const row = domain != null
		? await db.prepare('SELECT value FROM registry_items WHERE user_id = ? AND domain = ? AND scope = ? AND key = ?')
			.bind(u.id, domain, scope, key).first<{ value: string }>()
		: await db.prepare('SELECT value FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ? AND key = ?')
			.bind(u.id, scope, key).first<{ value: string }>();

	if (!row) return json({ error: { message: 'No such key', code: 'NO_SUCH_KEY' } }, 400);

	try { return json(JSON.parse(row.value)); } catch { return json(row.value); }
};

/** i/registry/set — Upserts a key→value pair into a scope. */
export const registrySet: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const key = (body.key ?? '') as string;
	if (!key) return err('key is required');

	const scope = serializeScope(body.scope ?? []);
	const domain = normalizeDomain(body.domain);
	const value = JSON.stringify(body.value ?? null);
	const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

	// Check if row already exists (needed for upsert with correct updated_at)
	const existing = domain != null
		? await db.prepare('SELECT id FROM registry_items WHERE user_id = ? AND domain = ? AND scope = ? AND key = ?')
			.bind(u.id, domain, scope, key).first<{ id: string }>()
		: await db.prepare('SELECT id FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ? AND key = ?')
			.bind(u.id, scope, key).first<{ id: string }>();

	if (existing) {
		await db.prepare('UPDATE registry_items SET value = ?, updated_at = ? WHERE id = ?')
			.bind(value, now, existing.id).run();
	} else {
		const id = generateId();
		if (domain != null) {
			await db.prepare('INSERT INTO registry_items (id, user_id, domain, scope, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(id, u.id, domain, scope, key, value, now, now).run();
		} else {
			await db.prepare('INSERT INTO registry_items (id, user_id, domain, scope, key, value, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)')
				.bind(id, u.id, scope, key, value, now, now).run();
		}
	}

	return json({});
};

/** i/registry/remove — Deletes a key from a scope. */
export const registryRemove: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const key = (body.key ?? '') as string;
	if (!key) return err('key is required');

	const scope = serializeScope(body.scope ?? []);
	const domain = normalizeDomain(body.domain);

	if (domain != null) {
		await db.prepare('DELETE FROM registry_items WHERE user_id = ? AND domain = ? AND scope = ? AND key = ?')
			.bind(u.id, domain, scope, key).run();
	} else {
		await db.prepare('DELETE FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ? AND key = ?')
			.bind(u.id, scope, key).run();
	}

	return json({});
};

/** i/registry/keys — Returns all keys in a scope. */
export const registryKeys: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;

	const scope = serializeScope(body.scope ?? []);
	const domain = normalizeDomain(body.domain);

	const rows = domain != null
		? await db.prepare('SELECT key FROM registry_items WHERE user_id = ? AND domain = ? AND scope = ?')
			.bind(u.id, domain, scope).all<{ key: string }>()
		: await db.prepare('SELECT key FROM registry_items WHERE user_id = ? AND domain IS NULL AND scope = ?')
			.bind(u.id, scope).all<{ key: string }>();

	return json((rows.results ?? []).map(r => r.key));
};
