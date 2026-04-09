import type { Handler } from '../types.js';
import type { DbUser, DbUserList, DbNote } from '../types.js';
import { json, err, generateId, packUser, packNote, requireUser, getUser } from '../helpers.js';

function packList(l: DbUserList): Record<string, unknown> {
  return {
    id: l.id,
    createdAt: l.created_at,
    name: l.name,
    userIds: [],
    isPublic: !!l.is_public,
  };
}

export const userListsCreate: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const name = body.name as string | undefined;
  if (!name) return err('name required');
  const id = generateId();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO user_lists (id, user_id, name, is_public, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(id, u.id, name, now).run();
  const newList: DbUserList = { id, user_id: u.id, name, is_public: 0, created_at: now };
  return json(packList(newList));
};

export const userListsDelete: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const listId = body.listId as string | undefined;
  if (!listId) return err('listId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (list.user_id !== u.id) return err('Forbidden', 403);
  await db.prepare('DELETE FROM user_list_members WHERE list_id = ?').bind(listId).run();
  await db.prepare('DELETE FROM user_lists WHERE id = ?').bind(listId).run();
  return json({});
};

export const userListsShow: Handler = async (db, body) => {
  const listId = body.listId as string | undefined;
  if (!listId) return err('listId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (!list.is_public) {
    const u = await requireUser(db, body);
    if (u instanceof Response) return u;
    if (list.user_id !== u.id) return err('Forbidden', 403);
  }
  const members = await db.prepare('SELECT user_id FROM user_list_members WHERE list_id = ?').bind(listId).all<{ user_id: string }>();
  const userIds = (members.results ?? []).map(m => m.user_id);
  return json({ ...packList(list), userIds });
};

export const userListsUpdate: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const listId = body.listId as string | undefined;
  if (!listId) return err('listId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (list.user_id !== u.id) return err('Forbidden', 403);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof body.name === 'string') { sets.push('name = ?'); vals.push(body.name); }
  if (typeof body.isPublic === 'boolean') { sets.push('is_public = ?'); vals.push(body.isPublic ? 1 : 0); }
  if (sets.length > 0) {
    vals.push(listId);
    await db.prepare(`UPDATE user_lists SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
  const updated = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  return json(packList(updated!));
};

export const userListsList: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const lists = await db.prepare('SELECT * FROM user_lists WHERE user_id = ?').bind(u.id).all<DbUserList>();
  return json((lists.results ?? []).map(l => packList(l)));
};

export const userListsPush: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const listId = body.listId as string | undefined;
  const userId = body.userId as string | undefined;
  if (!listId) return err('listId required');
  if (!userId) return err('userId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (list.user_id !== u.id) return err('Forbidden', 403);
  const id = generateId();
  const now = new Date().toISOString();
  try {
    await db.prepare('INSERT INTO user_list_members (id, list_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, listId, userId, now).run();
  } catch {
    return err('Already in list');
  }
  return json({});
};

export const userListsPull: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const listId = body.listId as string | undefined;
  const userId = body.userId as string | undefined;
  if (!listId) return err('listId required');
  if (!userId) return err('userId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (list.user_id !== u.id) return err('Forbidden', 403);
  await db.prepare('DELETE FROM user_list_members WHERE list_id = ? AND user_id = ?').bind(listId, userId).run();
  return json({});
};

export const userListsGetMemberships: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const userId = body.userId as string | undefined;
  if (!userId) return err('userId required');
  const rows = await db.prepare(
    'SELECT m.id, m.created_at, m.list_id, m.user_id FROM user_list_members m '
    + 'JOIN user_lists l ON m.list_id = l.id WHERE m.user_id = ? AND l.user_id = ?'
  ).bind(userId, u.id).all<{ id: string; created_at: string; list_id: string; user_id: string }>();
  return json((rows.results ?? []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    listId: r.list_id,
    userId: r.user_id,
  })));
};

export const userListsCreateFromPublic: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const listId = body.listId as string | undefined;
  if (!listId) return err('listId required');
  const src = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!src) return err('No such list', 404);
  if (!src.is_public) return err('List is not public', 403);
  const newId = generateId();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO user_lists (id, user_id, name, is_public, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(newId, u.id, src.name, now).run();
  const members = await db.prepare('SELECT user_id FROM user_list_members WHERE list_id = ?').bind(listId).all<{ user_id: string }>();
  for (const m of members.results ?? []) {
    const mId = generateId();
    await db.prepare('INSERT INTO user_list_members (id, list_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(mId, newId, m.user_id, now).run();
  }
  const newList: DbUserList = { id: newId, user_id: u.id, name: src.name, is_public: 0, created_at: now };
  return json(packList(newList));
};

export const userListsFavorite: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  return json({});
};

export const userListsUnfavorite: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  return json({});
};

export const userListsUpdateMembership: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  return json({});
};

export const iUserListMemberships: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  const rows = await db.prepare(
    'SELECT m.id, m.created_at, m.list_id, m.user_id FROM user_list_members m '
    + 'JOIN user_lists l ON m.list_id = l.id WHERE l.user_id = ?'
  ).bind(u.id).all<{ id: string; created_at: string; list_id: string; user_id: string }>();
  return json((rows.results ?? []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    listId: r.list_id,
    userId: r.user_id,
  })));
};

export const notesUserListTimeline: Handler = async (db, body) => {
  const listId = body.listId as string | undefined;
  if (!listId) return err('listId required');
  const list = await db.prepare('SELECT * FROM user_lists WHERE id = ?').bind(listId).first<DbUserList>();
  if (!list) return err('No such list', 404);
  if (!list.is_public) {
    const u = await requireUser(db, body);
    if (u instanceof Response) return u;
    if (list.user_id !== u.id) return err('Forbidden', 403);
  }
  const members = await db.prepare('SELECT user_id FROM user_list_members WHERE list_id = ?').bind(listId).all<{ user_id: string }>();
  const memberIds = (members.results ?? []).map(m => m.user_id);
  if (memberIds.length === 0) return json([]);
  const limit = Math.min(Number(body.limit) || 10, 100);
  const untilId = body.untilId as string | undefined;
  const sinceId = body.sinceId as string | undefined;
  const placeholders = memberIds.map(() => '?').join(', ');
  let sql = `SELECT * FROM notes WHERE user_id IN (${placeholders})`;
  const params: unknown[] = [...memberIds];
  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM notes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const notes = await db.prepare(sql).bind(...params).all<DbNote>();
  const packed = await Promise.all((notes.results ?? []).map(n => packNote(db, n)));
  return json(packed);
};
