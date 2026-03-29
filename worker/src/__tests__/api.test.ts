import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../index.js';

const BASE_URL = 'http://localhost';

type WorkerEnv = typeof env;

async function callApi(path: string, body: Record<string, unknown> = {}): Promise<{ status: number; data: any }> {
const request = new Request(`${BASE_URL}/api/${path}`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body),
});
const ctx = createExecutionContext();
const response = await worker.fetch(request, env as unknown as WorkerEnv, ctx);
await waitOnExecutionContext(ctx);
const data = await response.json();
return { status: response.status, data };
}

// All tests run sequentially in a single describe block sharing state
describe('MissLite Worker API', () => {
// ---- Instance ----

it('GET / returns server info', async () => {
const request = new Request(`${BASE_URL}/`, { method: 'GET' });
const ctx = createExecutionContext();
const response = await worker.fetch(request, env as unknown as WorkerEnv, ctx);
await waitOnExecutionContext(ctx);
const data = await response.json() as any;
expect(data.name).toBe('MissLite CF');
});

it('meta returns instance metadata with requireSetup=true', async () => {
const { status, data } = await callApi('meta');
expect(status).toBe(200);
expect(data.name).toBe('MissLite');
expect(data.requireSetup).toBe(true);
});

it('ping returns pong', async () => {
const { data } = await callApi('ping');
expect(data.pong).toBeTypeOf('number');
});

it('emojis returns empty list', async () => {
const { data } = await callApi('emojis');
expect(data.emojis).toEqual([]);
});

it('endpoints returns route list', async () => {
const { data } = await callApi('endpoints');
expect(Array.isArray(data)).toBe(true);
expect(data).toContain('meta');
expect(data).toContain('notes/create');
});

it('unknown endpoint returns 404', async () => {
const { status } = await callApi('nonexistent');
expect(status).toBe(404);
});

it('OPTIONS returns CORS headers', async () => {
const request = new Request(`${BASE_URL}/api/meta`, { method: 'OPTIONS' });
const ctx = createExecutionContext();
const response = await worker.fetch(request, env as unknown as WorkerEnv, ctx);
await waitOnExecutionContext(ctx);
expect(response.status).toBe(204);
expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
});

// ---- Full workflow: setup -> signin -> notes -> reactions -> admin ----

let adminToken: string;
let adminId: string;

it('admin/accounts/create sets up instance', async () => {
const { status, data } = await callApi('admin/accounts/create', {
username: 'admin', password: 'testpass123',
});
expect(status).toBe(200);
expect(data.username).toBe('admin');
expect(data.isAdmin).toBe(true);
adminToken = data.token;
adminId = data.id;
});

it('admin/accounts/create rejects duplicate setup', async () => {
const { status } = await callApi('admin/accounts/create', {
username: 'admin2', password: 'testpass123',
});
expect(status).toBe(403);
});

it('meta shows requireSetup=false after init', async () => {
const { data } = await callApi('meta');
expect(data.requireSetup).toBe(false);
});

it('signin with correct credentials', async () => {
const { status, data } = await callApi('signin', {
username: 'admin', password: 'testpass123',
});
expect(status).toBe(200);
expect(data.i).toBeTypeOf('string');
});

it('signin rejects wrong password', async () => {
const { status } = await callApi('signin', { username: 'admin', password: 'wrong' });
expect(status).toBe(401);
});

it('i returns current user', async () => {
const { status, data } = await callApi('i', { i: adminToken });
expect(status).toBe(200);
expect(data.username).toBe('admin');
});

it('i rejects unauthenticated', async () => {
const { status } = await callApi('i', {});
expect(status).toBe(401);
});

it('i/update changes profile', async () => {
const { data } = await callApi('i/update', {
i: adminToken, name: 'Admin User', description: 'The boss',
});
expect(data.name).toBe('Admin User');
expect(data.description).toBe('The boss');
});

it('users/show by userId', async () => {
const { data } = await callApi('users/show', { userId: adminId });
expect(data.username).toBe('admin');
});

it('users/show by username', async () => {
const { data } = await callApi('users/show', { username: 'admin' });
expect(data.id).toBe(adminId);
});

it('users/show 404 for unknown', async () => {
const { status } = await callApi('users/show', { userId: 'nonexistent' });
expect(status).toBe(404);
});

// ---- Invites & Signup ----

let inviteCode: string;
let userToken: string;
let userId: string;

it('invite/create generates code', async () => {
const { status, data } = await callApi('invite/create', { i: adminToken });
expect(status).toBe(200);
inviteCode = data.code;
});

it('invite/list returns codes', async () => {
const { status, data } = await callApi('invite/list', { i: adminToken });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
});

it('signup with valid invite code', async () => {
const { status, data } = await callApi('signup', {
username: 'testuser', password: 'userpass', invitationCode: inviteCode,
});
expect(status).toBe(200);
expect(data.username).toBe('testuser');
userToken = data.token;
userId = data.id;
});

it('signup rejects used invite code', async () => {
const { status } = await callApi('signup', {
username: 'another', password: 'pass', invitationCode: inviteCode,
});
expect(status).toBe(400);
});

// ---- Notes ----

let noteId: string;

it('notes/create creates a note', async () => {
const { status, data } = await callApi('notes/create', {
i: userToken, text: 'Hello world!',
});
expect(status).toBe(200);
expect(data.createdNote.text).toBe('Hello world!');
noteId = data.createdNote.id;
});

it('notes/create rejects unauthenticated', async () => {
const { status } = await callApi('notes/create', { text: 'nope' });
expect(status).toBe(401);
});

it('notes/show returns the note', async () => {
const { status, data } = await callApi('notes/show', { noteId });
expect(status).toBe(200);
expect(data.text).toBe('Hello world!');
});

it('notes/timeline returns notes', async () => {
const { status, data } = await callApi('notes/timeline', {});
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
});

it('users/notes returns user notes', async () => {
const { data } = await callApi('users/notes', { userId });
expect(data.length).toBeGreaterThan(0);
});

it('stats returns counts', async () => {
const { data } = await callApi('stats');
expect(data.usersCount).toBeGreaterThanOrEqual(2);
expect(data.notesCount).toBeGreaterThanOrEqual(1);
});

// ---- Reactions ----

it('notes/reactions/create adds reaction', async () => {
const { status } = await callApi('notes/reactions/create', {
i: userToken, noteId, reaction: '👍',
});
expect(status).toBe(200);
});

it('reaction appears in notes/show', async () => {
const { data } = await callApi('notes/show', { noteId });
expect(data.reactions['👍']).toBe(1);
});

it('notes/reactions/delete removes reaction', async () => {
await callApi('notes/reactions/delete', { i: userToken, noteId });
const { data } = await callApi('notes/show', { noteId });
expect(data.reactions['👍']).toBeUndefined();
});

// ---- Admin ----

it('admin/show-users lists users', async () => {
const { status, data } = await callApi('admin/show-users', { i: adminToken });
expect(status).toBe(200);
expect(data.length).toBeGreaterThanOrEqual(2);
});

it('admin/show-users forbidden for regular user', async () => {
const { status } = await callApi('admin/show-users', { i: userToken });
expect(status).toBe(403);
});

it('admin/moderators/add grants moderator', async () => {
const { status } = await callApi('admin/moderators/add', { i: adminToken, userId });
expect(status).toBe(200);
const { data } = await callApi('users/show', { userId });
expect(data.isModerator).toBe(true);
});

it('admin/moderators/remove revokes moderator', async () => {
await callApi('admin/moderators/remove', { i: adminToken, userId });
const { data } = await callApi('users/show', { userId });
expect(data.isModerator).toBe(false);
});

it('admin/suspend-user suspends user', async () => {
const { status } = await callApi('admin/suspend-user', { i: adminToken, userId });
expect(status).toBe(200);
const { status: authStatus } = await callApi('i', { i: userToken });
expect(authStatus).toBe(401);
});

it('admin/unsuspend-user restores user', async () => {
const { status } = await callApi('admin/unsuspend-user', { i: adminToken, userId });
expect(status).toBe(200);
const { data } = await callApi('users/show', { userId });
expect(data.isSuspended).toBe(false);
});

it('notes/delete by admin', async () => {
const { status } = await callApi('notes/delete', { i: adminToken, noteId });
expect(status).toBe(200);
});
});
