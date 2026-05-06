import type { Handler } from '../types.js';
import type { DbUser, DbGalleryPost } from '../types.js';
import { json, err, generateId, packUser, requireUser } from '../helpers.js';

function packGalleryPost(p: DbGalleryPost, user?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: p.id, createdAt: p.created_at, updatedAt: p.updated_at,
    userId: p.user_id, user: user ?? null,
    title: p.title, description: p.description,
    fileIds: JSON.parse(p.file_ids || '[]'), files: [],
    isSensitive: !!p.is_sensitive, likedCount: p.liked_count,
    isLiked: false, tags: [],
  };
}

export const galleryPosts: Handler = async (db, body) => {
  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT * FROM gallery_posts';
  const params: unknown[] = [];
  const conds: string[] = [];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { conds.push('created_at < ?'); params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { conds.push('created_at > ?'); params.push(ref.created_at); }
  }

  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all<DbGalleryPost>();
  const posts = rows.results ?? [];
  const out: Record<string, unknown>[] = [];
  for (const p of posts) {
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(p.user_id).first<DbUser>();
    out.push(packGalleryPost(p, u ? packUser(u) : undefined));
  }
  return json(out);
};

export const galleryPostsCreate: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const title = body.title as string | undefined;
  if (!title) return err('title is required');

  const description = (body.description ?? null) as string | null;
  const isSensitive = body.isSensitive ? 1 : 0;
  const fileIds = Array.isArray(body.fileIds) ? JSON.stringify(body.fileIds) : '[]';
  const id = generateId();
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO gallery_posts (id, user_id, title, description, is_sensitive, liked_count, file_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
  ).bind(id, u.id, title, description, isSensitive, fileIds, now, now).run();

  const newPost: DbGalleryPost = {
    id, user_id: u.id, title, description: description ?? '', is_sensitive: isSensitive,
    liked_count: 0, file_ids: fileIds, created_at: now, updated_at: now,
  };
  return json(packGalleryPost(newPost, packUser(u)));
};

export const galleryPostsDelete: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const postId = body.postId as string | undefined;
  if (!postId) return err('postId is required');

  const post = await db.prepare('SELECT * FROM gallery_posts WHERE id = ?').bind(postId).first<DbGalleryPost>();
  if (!post) return err('Not found', 404);
  if (post.user_id !== u.id) return err('Forbidden', 403);

  await db.prepare('DELETE FROM gallery_likes WHERE post_id = ?').bind(postId).run();
  await db.prepare('DELETE FROM gallery_posts WHERE id = ?').bind(postId).run();

  return json({});
};

export const galleryPostsShow: Handler = async (db, body) => {
  const postId = body.postId as string | undefined;
  if (!postId) return err('postId is required');

  const post = await db.prepare('SELECT * FROM gallery_posts WHERE id = ?').bind(postId).first<DbGalleryPost>();
  if (!post) return err('Not found', 404);

  const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(post.user_id).first<DbUser>();
  return json(packGalleryPost(post, owner ? packUser(owner) : undefined));
};

export const galleryPostsUpdate: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const postId = body.postId as string | undefined;
  if (!postId) return err('postId is required');

  const post = await db.prepare('SELECT * FROM gallery_posts WHERE id = ?').bind(postId).first<DbGalleryPost>();
  if (!post) return err('Not found', 404);
  if (post.user_id !== u.id) return err('Forbidden', 403);

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.title === 'string') { sets.push('title = ?'); vals.push(body.title); }
  if (typeof body.description === 'string') { sets.push('description = ?'); vals.push(body.description); }
  if (typeof body.isSensitive === 'boolean') { sets.push('is_sensitive = ?'); vals.push(body.isSensitive ? 1 : 0); }
  if (Array.isArray(body.fileIds)) { sets.push('file_ids = ?'); vals.push(JSON.stringify(body.fileIds)); }

  const now = new Date().toISOString();
  sets.push('updated_at = ?');
  vals.push(now);
  vals.push(postId);

  await db.prepare(`UPDATE gallery_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const updated = await db.prepare('SELECT * FROM gallery_posts WHERE id = ?').bind(postId).first<DbGalleryPost>();
  return json(packGalleryPost(updated!, packUser(u)));
};

export const galleryPostsLike: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const postId = body.postId as string | undefined;
  if (!postId) return err('postId is required');

  const id = generateId();
  const now = new Date().toISOString();

  try {
    await db.prepare(
      'INSERT INTO gallery_likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)',
    ).bind(id, u.id, postId, now).run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('UNIQUE constraint failed')) return err('Already liked');
    throw e;
  }

  await db.prepare('UPDATE gallery_posts SET liked_count = liked_count + 1 WHERE id = ?').bind(postId).run();
  return json({});
};

export const galleryPostsUnlike: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const postId = body.postId as string | undefined;
  if (!postId) return err('postId is required');

  const res = await db.prepare('DELETE FROM gallery_likes WHERE user_id = ? AND post_id = ?').bind(u.id, postId).run();

  if (res.meta?.changes && res.meta.changes > 0) {
    await db.prepare('UPDATE gallery_posts SET liked_count = MAX(liked_count - 1, 0) WHERE id = ?').bind(postId).run();
  }

  return json({});
};

export const galleryPopular: Handler = async (db) => {
  const rows = await db.prepare('SELECT * FROM gallery_posts ORDER BY liked_count DESC LIMIT 10').all<DbGalleryPost>();
  const posts = rows.results ?? [];
  const out: Record<string, unknown>[] = [];
  for (const p of posts) {
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(p.user_id).first<DbUser>();
    out.push(packGalleryPost(p, u ? packUser(u) : undefined));
  }
  return json(out);
};

export const galleryFeatured: Handler = async (db) => {
  const rows = await db.prepare('SELECT * FROM gallery_posts ORDER BY created_at DESC LIMIT 10').all<DbGalleryPost>();
  const posts = rows.results ?? [];
  const out: Record<string, unknown>[] = [];
  for (const p of posts) {
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(p.user_id).first<DbUser>();
    out.push(packGalleryPost(p, u ? packUser(u) : undefined));
  }
  return json(out);
};

export const iGalleryPosts: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT * FROM gallery_posts WHERE user_id = ?';
  const params: unknown[] = [u.id];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all<DbGalleryPost>();
  return json((rows.results ?? []).map(r => packGalleryPost(r, packUser(u))));
};

export const iGalleryLikes: Handler = async (db, body) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;

  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT gl.id AS gl_id, gl.created_at AS gl_created_at, gp.* FROM gallery_likes gl JOIN gallery_posts gp ON gp.id = gl.post_id WHERE gl.user_id = ?';
  const params: unknown[] = [u.id];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_likes WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND gl.created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_likes WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND gl.created_at > ?'; params.push(ref.created_at); }
  }

  sql += ' ORDER BY gl.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all();
  return json((rows.results ?? []).map((r: Record<string, unknown>) => ({
    id: r.gl_id as string,
    post: packGalleryPost({
      id: r.id as string, user_id: r.user_id as string,
      title: r.title as string, description: r.description as string,
      is_sensitive: r.is_sensitive as number, liked_count: r.liked_count as number,
      file_ids: r.file_ids as string, created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }),
  })));
};

export const usersGalleryPosts: Handler = async (db, body) => {
  const userId = body.userId as string | undefined;
  if (!userId) return err('userId is required');

  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT * FROM gallery_posts WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM gallery_posts WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND created_at > ?'; params.push(ref.created_at); }
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all<DbGalleryPost>();
  const owner = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
  const packed = owner ? packUser(owner) : undefined;
  return json((rows.results ?? []).map(r => packGalleryPost(r, packed)));
};
