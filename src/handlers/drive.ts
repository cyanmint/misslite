/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import type { DbDriveFile } from '../types.js';
import { json, err, requireUser, generateId, packUser } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

function inferMimeTypeFromName(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.avif')) return 'image/avif';
	if (lower.endsWith('.bmp')) return 'image/bmp';
	if (lower.endsWith('.ico')) return 'image/x-icon';
	return 'application/octet-stream';
}

function inferImageMimeFromContent(bytes: Uint8Array): string | null {
	if (bytes.length >= 8
		&& bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
		&& bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
		return 'image/png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (bytes.length >= 6
		&& bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
		&& bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
		return 'image/gif';
	}
	if (bytes.length >= 12
		&& bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
		&& bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
		return 'image/webp';
	}
	if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
		return 'image/bmp';
	}
	if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
		return 'image/x-icon';
	}
	if (bytes.length >= 12
		&& bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
		&& bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66) {
		return 'image/avif';
	}
	return null;
}

function packDriveFile(row: DbDriveFile, user?: Record<string, unknown> | null): Record<string, unknown> {
	return {
		id: row.id, createdAt: row.created_at,
		name: row.name, type: row.type,
		md5: row.md5 ?? '00000000000000000000000000000000',
		size: row.size,
		isSensitive: row.is_sensitive === 1,
		blurhash: null, properties: {},
		url: row.url, thumbnailUrl: null, webpublicUrl: null, comment: null,
		folderId: row.folder_id, folder: null,
		userId: row.user_id, user: user ?? null,
		userHost: null, storedInternal: !!row.r2_key,
		accessKey: row.r2_key, thumbnailAccessKey: null, webpublicAccessKey: null,
		uri: null, src: null, isLink: false,
	};
}

function makeDriveFolder(): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(),
		name: 'folder', parentId: null, parent: null,
		foldersCount: 0, filesCount: 0,
	};
}

export const driveRoot: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const used = await db.prepare('SELECT COALESCE(SUM(size),0) as total FROM drive_files WHERE user_id = ?').bind(u.id).first<{ total: number }>();
	return json({ capacity: 1073741824, usage: used?.total ?? 0 });
};

export const driveFiles: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const limit = Math.min(Number(body.limit ?? 10), 100);
	const folderId = (body.folderId ?? null) as string | null;
	let query = 'SELECT * FROM drive_files WHERE user_id = ?';
	const params: unknown[] = [u.id];
	if (folderId) { query += ' AND folder_id = ?'; params.push(folderId); }
	else { query += ' AND folder_id IS NULL'; }
	query += ' ORDER BY created_at DESC LIMIT ?';
	params.push(limit);
	const rows = await db.prepare(query).bind(...params).all<DbDriveFile>();
	return json((rows.results ?? []).map(r => packDriveFile(r)));
};

export const driveFilesAttachedNotes: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFilesCheckExistence: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json({ result: false });
};

export const driveFilesCreate: Handler = async (db, body, env, request) => {
	// Auth token may come from JSON body or multipart form
	let token = ((body.i ?? body.token ?? '') as string);
	let name = ((body.name ?? '') as string);
	let isSensitive = Boolean(body.isSensitive);
	let folderId = ((body.folderId ?? null) as string | null);
	let fileBlob: File | null = null;

	if (request) {
		const ct = request.headers.get('content-type') ?? '';
		if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
			try {
				const form = await request.formData();
				if (!token) token = ((form.get('i') ?? form.get('token') ?? '') as string);
				const fileEntry = form.get('file');
				if (fileEntry instanceof File) {
					fileBlob = fileEntry;
					if (!name) name = fileEntry.name || 'file';
				}
				if (form.has('name')) name = form.get('name') as string;
				if (form.has('isSensitive')) isSensitive = form.get('isSensitive') === 'true';
				if (form.has('folderId')) folderId = form.get('folderId') as string | null;
			} catch { /* ignore parse errors */ }
		}
	}

	const u = await requireUser(db, { i: token });
	if (u instanceof Response) return u;

	if (!fileBlob) {
		// No file data — return stub drive file
		const fileId = generateId();
		const now = new Date().toISOString();
		if (!name) name = 'file.bin';
		await db.prepare('INSERT OR IGNORE INTO drive_files (id, user_id, name, type, size, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(fileId, u.id, name, 'application/octet-stream', 0, folderId, now).run();
		const row = await db.prepare('SELECT * FROM drive_files WHERE id = ?').bind(fileId).first<DbDriveFile>();
		const fallback: DbDriveFile = { id: fileId, user_id: u.id, name, type: 'application/octet-stream', size: 0, md5: null, is_sensitive: 0, folder_id: folderId, r2_key: null, url: null, created_at: now };
		return json(packDriveFile(row ?? fallback, packUser(u)));
	}

	const fileId = generateId();
	const fileBuffer = await fileBlob.arrayBuffer();
	const bytes = new Uint8Array(fileBuffer);
	const originalType = (fileBlob.type || '').trim();
	const inferredTypeByName = inferMimeTypeFromName(name || fileBlob.name || '');
	const inferredTypeByContent = inferImageMimeFromContent(bytes);
	const inferredType = inferredTypeByContent ?? inferredTypeByName;
	const fileType = inferredTypeByContent
		? inferredTypeByContent
		: ((!originalType || originalType === 'application/octet-stream') ? inferredType : originalType);
	const fileSize = fileBuffer.byteLength;
	if (!name) name = fileBlob.name || 'file';

	const r2Key = `files/${u.id}/${fileId}`;
	if (env.R2) {
		await env.R2.put(r2Key, fileBuffer, {
			httpMetadata: { contentType: fileType },
			customMetadata: { userId: u.id, fileName: name },
		});
	}

	const origin = request ? new URL(request.url).origin : '';
	const fileUrl = origin && env.R2 ? `${origin}/files/${r2Key}` : null;
	const now = new Date().toISOString();

	await db.prepare('INSERT INTO drive_files (id, user_id, name, type, size, is_sensitive, folder_id, r2_key, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(fileId, u.id, name, fileType, fileSize, isSensitive ? 1 : 0, folderId, env.R2 ? r2Key : null, fileUrl, now).run();

	const row = await db.prepare('SELECT * FROM drive_files WHERE id = ?').bind(fileId).first<DbDriveFile>();
	const fallback: DbDriveFile = { id: fileId, user_id: u.id, name, type: fileType, size: fileSize, md5: null, is_sensitive: isSensitive ? 1 : 0, folder_id: folderId, r2_key: env.R2 ? r2Key : null, url: fileUrl, created_at: now };
	return json(packDriveFile(row ?? fallback, packUser(u)));
};

export const driveFilesDelete: Handler = async (db, body, env) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const fileId = ((body.fileId ?? '') as string);
	if (!fileId) return err('fileId required');
	const row = await db.prepare('SELECT * FROM drive_files WHERE id = ?').bind(fileId).first<DbDriveFile>();
	if (!row) return err('No such file', 404);
	if (row.user_id !== u.id && !u.is_admin) return err('Forbidden', 403);
	if (env.R2 && row.r2_key) {
		await env.R2.delete(row.r2_key).catch(e => { console.error('R2 delete failed:', e); });
	}
	await db.prepare('DELETE FROM drive_files WHERE id = ?').bind(fileId).run();
	return noContent();
};

export const driveFilesFind: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const name = ((body.name ?? '') as string);
	if (!name) return json([]);
	const rows = await db.prepare('SELECT * FROM drive_files WHERE user_id = ? AND name = ? ORDER BY created_at DESC').bind(u.id, name).all<DbDriveFile>();
	return json((rows.results ?? []).map(r => packDriveFile(r)));
};

export const driveFilesFindByHash: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFilesShow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const fileId = ((body.fileId ?? '') as string);
	if (!fileId) return err('fileId required');
	const row = await db.prepare('SELECT * FROM drive_files WHERE id = ? AND user_id = ?').bind(fileId, u.id).first<DbDriveFile>();
	if (!row) return err('No such file', 404);
	return json(packDriveFile(row, packUser(u)));
};

export const driveFilesUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	const fileId = ((body.fileId ?? '') as string);
	if (!fileId) return err('fileId required');
	const row = await db.prepare('SELECT * FROM drive_files WHERE id = ? AND user_id = ?').bind(fileId, u.id).first<DbDriveFile>();
	if (!row) return err('No such file', 404);

	const sets: string[] = [];
	const vals: unknown[] = [];
	if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
	if (typeof body.isSensitive === 'boolean') { sets.push('is_sensitive = ?'); vals.push(body.isSensitive ? 1 : 0); }
	if (sets.length > 0) {
		vals.push(fileId);
		await db.prepare(`UPDATE drive_files SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
	}
	const updated = await db.prepare('SELECT * FROM drive_files WHERE id = ?').bind(fileId).first<DbDriveFile>();
	return json(packDriveFile(updated ?? row, packUser(u)));
};

export const driveFilesUploadFromUrl: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const driveFolders: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFoldersCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFolder());
};

export const driveFoldersDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const driveFoldersFind: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFoldersShow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFolder());
};

export const driveFoldersUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFolder());
};

export const driveStream: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};
