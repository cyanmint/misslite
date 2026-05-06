import type { Handler } from '../types.js';
import type { DbUser, DbRole } from '../types.js';
import { json, err, generateId, packUser, requireUser, DEFAULT_POLICIES } from '../helpers.js';

function packRole(r: DbRole): Record<string, unknown> {
  let policies: Record<string, unknown> = {};
  try { policies = JSON.parse(r.policies || '{}'); } catch {}
  return {
    id: r.id, createdAt: r.created_at, updatedAt: r.updated_at,
    name: r.name, description: r.description,
    color: r.color, iconUrl: r.icon_url,
    target: r.target, condFormula: r.cond_formula ? JSON.parse(r.cond_formula) : {},
    isPublic: !!r.is_public, isModerator: !!r.is_moderator,
    isAdministrator: !!r.is_administrator, isExplorable: !!r.is_explorable,
    asBadge: !!r.as_badge,
    canEditMembersByModerator: !!r.can_edit_members_by_moderator,
    displayOrder: r.display_order,
    policies, usersCount: 0,
  };
}

// ── public ──

export const rolesList: Handler = async (db, body, _env) => {
  const rows = await db.prepare('SELECT * FROM roles WHERE is_public = 1 ORDER BY display_order ASC').all<DbRole>();
  return json((rows.results ?? []).map(packRole));
};

export const rolesShow: Handler = async (db, body, _env) => {
  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');
  const role = await db.prepare('SELECT * FROM roles WHERE id = ?').bind(roleId).first<DbRole>();
  if (!role) return err('Role not found');
  return json(packRole(role));
};

export const rolesNotes: Handler = async (_db, body, _env) => {
  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');
  return json([]);
};

export const rolesUsers: Handler = async (db, body, _env) => {
  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');

  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT ra.id AS ra_id, ra.role_id, ra.created_at AS ra_created_at, u.* FROM role_assignments ra JOIN users u ON u.id = ra.user_id WHERE ra.role_id = ?';
  const params: unknown[] = [roleId];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM role_assignments WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND ra.created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM role_assignments WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND ra.created_at > ?'; params.push(ref.created_at); }
  }

  sql += ' ORDER BY ra.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all();
  const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    id: r.ra_id as string,
    user: packUser({
      id: r.id as string,
      username: r.username as string,
      password_hash: r.password_hash as string,
      name: r.name as string | null,
      description: r.description as string,
      avatar_url: r.avatar_url as string | null,
      is_admin: r.is_admin as number,
      is_moderator: r.is_moderator as number,
      is_suspended: r.is_suspended as number,
      created_at: (r as Record<string, unknown>)['created_at:1'] as string ?? r.created_at as string,
    }),
    roleId: r.role_id as string,
  }));
  return json(results);
};

// ── admin ──

export const adminRolesCreate: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin) return err('Forbidden', 403);

  const name = body.name as string | undefined;
  if (!name) return err('name is required');

  const now = new Date().toISOString();
  const id = generateId();
  const description = (body.description as string) ?? '';
  const color = (body.color as string) ?? null;
  const iconUrl = (body.iconUrl as string) ?? null;
  const target = (body.target as string) ?? 'manual';
  const condFormula = body.condFormula ? JSON.stringify(body.condFormula) : null;
  const isPublic = body.isPublic ? 1 : 0;
  const isModerator = body.isModerator ? 1 : 0;
  const isAdministrator = body.isAdministrator ? 1 : 0;
  const isExplorable = body.isExplorable ? 1 : 0;
  const asBadge = body.asBadge ? 1 : 0;
  const canEditMembersByModerator = body.canEditMembersByModerator ? 1 : 0;
  const displayOrder = Number(body.displayOrder) || 0;
  const policies = body.policies ? JSON.stringify(body.policies) : '{}';

  await db.prepare(
    `INSERT INTO roles (id, name, description, color, icon_url, target, cond_formula,
      is_public, is_moderator, is_administrator, is_explorable, as_badge,
      can_edit_members_by_moderator, display_order, policies, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, name, description, color, iconUrl, target, condFormula,
    isPublic, isModerator, isAdministrator, isExplorable, asBadge,
    canEditMembersByModerator, displayOrder, policies, now, now).run();

  const newRole = await db.prepare('SELECT * FROM roles WHERE id = ?').bind(id).first<DbRole>();
  return json(packRole(newRole!));
};

export const adminRolesDelete: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');

  await db.prepare('DELETE FROM role_assignments WHERE role_id = ?').bind(roleId).run();
  await db.prepare('DELETE FROM roles WHERE id = ?').bind(roleId).run();
  return json({});
};

export const adminRolesList: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

  const rows = await db.prepare('SELECT * FROM roles ORDER BY display_order ASC').all<DbRole>();
  return json((rows.results ?? []).map(packRole));
};

export const adminRolesShow: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');
  const role = await db.prepare('SELECT * FROM roles WHERE id = ?').bind(roleId).first<DbRole>();
  if (!role) return err('Role not found');
  return json(packRole(role));
};

export const adminRolesUpdate: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');

  const sets: string[] = [];
  const params: unknown[] = [];

  const fields: [string, string, (v: unknown) => unknown][] = [
    ['name', 'name', v => v as string],
    ['description', 'description', v => v as string],
    ['color', 'color', v => v as string | null],
    ['iconUrl', 'icon_url', v => v as string | null],
    ['target', 'target', v => v as string],
    ['condFormula', 'cond_formula', v => v ? JSON.stringify(v) : null],
    ['isPublic', 'is_public', v => v ? 1 : 0],
    ['isModerator', 'is_moderator', v => v ? 1 : 0],
    ['isAdministrator', 'is_administrator', v => v ? 1 : 0],
    ['isExplorable', 'is_explorable', v => v ? 1 : 0],
    ['asBadge', 'as_badge', v => v ? 1 : 0],
    ['canEditMembersByModerator', 'can_edit_members_by_moderator', v => v ? 1 : 0],
    ['displayOrder', 'display_order', v => Number(v) || 0],
    ['policies', 'policies', v => JSON.stringify(v)],
  ];

  for (const [bodyKey, col, transform] of fields) {
    if (bodyKey in body) {
      sets.push(`${col} = ?`);
      params.push(transform(body[bodyKey]));
    }
  }

  if (sets.length > 0) {
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(roleId);
    await db.prepare(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  return json({});
};

export const adminRolesAssign: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  const userId = body.userId as string | undefined;
  if (!roleId) return err('roleId is required');
  if (!userId) return err('userId is required');

  const id = generateId();
  const now = new Date().toISOString();
  const expiresAt = (body.expiresAt as string) ?? null;
  await db.prepare(
    'INSERT OR IGNORE INTO role_assignments (id, role_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, roleId, userId, expiresAt, now).run();

  return json({});
};

export const adminRolesUnassign: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  const userId = body.userId as string | undefined;
  if (!roleId) return err('roleId is required');
  if (!userId) return err('userId is required');

  await db.prepare('DELETE FROM role_assignments WHERE role_id = ? AND user_id = ?').bind(roleId, userId).run();
  return json({});
};

export const adminRolesUsers: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin && !u.is_moderator) return err('Forbidden', 403);

  const roleId = body.roleId as string | undefined;
  if (!roleId) return err('roleId is required');

  const limit = Math.min(Number(body.limit) || 10, 100);
  const sinceId = body.sinceId as string | undefined;
  const untilId = body.untilId as string | undefined;

  let sql = 'SELECT ra.id AS ra_id, ra.role_id, ra.created_at AS ra_created_at, u.* FROM role_assignments ra JOIN users u ON u.id = ra.user_id WHERE ra.role_id = ?';
  const params: unknown[] = [roleId];

  if (untilId) {
    const ref = await db.prepare('SELECT created_at FROM role_assignments WHERE id = ?').bind(untilId).first<{ created_at: string }>();
    if (ref) { sql += ' AND ra.created_at < ?'; params.push(ref.created_at); }
  }
  if (sinceId) {
    const ref = await db.prepare('SELECT created_at FROM role_assignments WHERE id = ?').bind(sinceId).first<{ created_at: string }>();
    if (ref) { sql += ' AND ra.created_at > ?'; params.push(ref.created_at); }
  }

  sql += ' ORDER BY ra.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all();
  const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    id: r.ra_id as string,
    user: packUser({
      id: r.id as string,
      username: r.username as string,
      password_hash: r.password_hash as string,
      name: r.name as string | null,
      description: r.description as string,
      avatar_url: r.avatar_url as string | null,
      is_admin: r.is_admin as number,
      is_moderator: r.is_moderator as number,
      is_suspended: r.is_suspended as number,
      created_at: (r as Record<string, unknown>)['created_at:1'] as string ?? r.created_at as string,
    }),
    roleId: r.role_id as string,
  }));
  return json(results);
};

export const adminRolesUpdateDefaultPolicies: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin) return err('Forbidden', 403);

  const policies = body.policies;
  if (!policies) return err('policies is required');

  await db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind('defaultPolicies', JSON.stringify(policies)).run();

  return json({});
};

export const adminRolesUpdateInlinePolicies: Handler = async (db, body, _env) => {
  const u = await requireUser(db, body);
  if (u instanceof Response) return u;
  if (!u.is_admin) return err('Forbidden', 403);

  return json({});
};
