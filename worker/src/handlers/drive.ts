/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Handler } from '../types.js';
import { json, requireUser, generateId } from '../helpers.js';

const noContent = (): Response =>
	new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

function makeDriveFile(userId: string | null = null): Record<string, unknown> {
	return {
		id: generateId(), createdAt: new Date().toISOString(),
		name: 'file.bin', type: 'application/octet-stream',
		md5: '00000000000000000000000000000000', size: 0,
		isSensitive: false, blurhash: null, properties: {},
		url: null, thumbnailUrl: null, webpublicUrl: null, comment: null,
		folderId: null, folder: null, userId, user: null,
		userHost: null, storedInternal: false,
		accessKey: null, thumbnailAccessKey: null, webpublicAccessKey: null,
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
	return json({ capacity: 0, usage: 0 });
};

export const driveFiles: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
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

export const driveFilesCreate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFile(u.id));
};

export const driveFilesDelete: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return noContent();
};

export const driveFilesFind: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFilesFindByHash: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json([]);
};

export const driveFilesShow: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFile(u.id));
};

export const driveFilesUpdate: Handler = async (db, body) => {
	const u = await requireUser(db, body);
	if (u instanceof Response) return u;
	return json(makeDriveFile(u.id));
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
