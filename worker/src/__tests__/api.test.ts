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
expect(data.clientOptions).toBeTruthy();
expect(data.clientOptions.entrancePageStyle).toBeNull();
expect(data.policies).toBeTruthy();
expect(data.serverRules).toEqual([]);
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
username: 'admin', password: 'myloginpass', setupPassword: 'testpass123',
});
expect(status).toBe(200);
expect(data.username).toBe('admin');
expect(data.isAdmin).toBe(true);
adminToken = data.token;
adminId = data.id;
});

it('admin/accounts/create rejects wrong setupPassword', async () => {
const { status } = await callApi('admin/accounts/create', {
username: 'admin2', password: 'myloginpass', setupPassword: 'wrongtoken',
});
expect(status).toBe(403);
});

it('admin/accounts/create rejects duplicate setup', async () => {
const { status } = await callApi('admin/accounts/create', {
username: 'admin2', password: 'myloginpass', setupPassword: 'testpass123',
});
expect(status).toBe(403);
});

it('meta shows requireSetup=false after init', async () => {
const { data } = await callApi('meta');
expect(data.requireSetup).toBe(false);
});

it('signin with correct credentials', async () => {
const { status, data } = await callApi('signin', {
username: 'admin', password: 'myloginpass',
});
expect(status).toBe(200);
expect(data.i).toBeTypeOf('string');
});

it('signin-flow: step1 returns next=password', async () => {
const { status, data } = await callApi('signin-flow', { username: 'admin' });
expect(status).toBe(200);
expect(data.finished).toBe(false);
expect(data.next).toBe('password');
});

it('signin-flow: full login returns MeDetailed + finished', async () => {
const { status, data } = await callApi('signin-flow', {
username: 'admin', password: 'myloginpass',
});
expect(status).toBe(200);
expect(data.finished).toBe(true);
expect(data.i).toBeTypeOf('string');
expect(data.token).toBeTypeOf('string');
expect(data.username).toBe('admin');
expect(data.policies).toBeTruthy();
});

it('signin-flow: rejects wrong password', async () => {
const { status } = await callApi('signin-flow', {
username: 'admin', password: 'wrong',
});
expect(status).toBe(401);
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
let announcementId: string;
let stateNoteId: string;

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

// Re-acquire userToken — the admin/suspend-user test above deleted testuser's sessions
it('testuser re-signs in for new test block', async () => {
const { status, data } = await callApi('signin', { username: 'testuser', password: 'userpass' });
expect(status).toBe(200);
userToken = data.i;
});

// ---- New: instance endpoints ----

it('server-info returns machine info', async () => {
const { status, data } = await callApi('server-info');
expect(status).toBe(200);
expect(data.machine).toBe('Cloudflare Workers');
});

it('announcements returns empty list initially', async () => {
const { status, data } = await callApi('announcements');
expect(status).toBe(200);
expect(Array.isArray(data)).toBe(true);
});

it('admin/announcements/create adds announcement', async () => {
const { status, data } = await callApi('admin/announcements/create', {
i: adminToken, title: 'Test Announcement', text: 'Hello everyone',
});
expect(status).toBe(200);
expect(data.title).toBe('Test Announcement');
announcementId = data.id;
});

it('announcements returns announcement', async () => {
const { data } = await callApi('announcements');
expect(data.length).toBeGreaterThan(0);
expect(data[0].title).toBe('Test Announcement');
});

it('admin/announcements/delete removes it', async () => {
const { status } = await callApi('admin/announcements/delete', { i: adminToken, announcementId });
expect(status).toBe(200);
const { data } = await callApi('announcements');
expect(data.length).toBe(0);
});

// ---- New: config ----

it('admin/update-meta changes instance name', async () => {
const { status } = await callApi('admin/update-meta', { i: adminToken, name: 'MyInstance', description: 'A test' });
expect(status).toBe(200);
const { data } = await callApi('meta');
expect(data.name).toBe('MyInstance');
expect(data.description).toBe('A test');
});

it('admin/update-meta forbidden for regular user', async () => {
const { status } = await callApi('admin/update-meta', { i: userToken, name: 'Hacked' });
expect(status).toBe(403);
});

// ---- New: signout ----

it('signout invalidates session', async () => {
// Get a fresh session first
const { data: signinData } = await callApi('signin', { username: 'testuser', password: 'userpass' });
const tempToken = signinData.i;
await callApi('signout', { i: tempToken });
const { status } = await callApi('i', { i: tempToken });
expect(status).toBe(401);
});

// ---- New: change-password ----

it('i/change-password updates password', async () => {
const { status, data } = await callApi('i/change-password', {
i: userToken, currentPassword: 'userpass', newPassword: 'newpass456',
});
expect(status).toBe(200);
expect(data.i).toBeTypeOf('string');
userToken = data.i;
});

it('signin works with new password', async () => {
const { status, data } = await callApi('signin', { username: 'testuser', password: 'newpass456' });
expect(status).toBe(200);
userToken = data.i;
});

it('i/change-password rejects wrong current password', async () => {
const { status } = await callApi('i/change-password', {
i: userToken, currentPassword: 'wrongpass', newPassword: 'other',
});
expect(status).toBe(401);
});

// ---- New: users/search ----

it('users/search returns matching users', async () => {
const { status, data } = await callApi('users/search', { query: 'admin' });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
expect(data[0].username).toBe('admin');
});

it('users/search returns empty for no match', async () => {
const { data } = await callApi('users/search', { query: 'xyznosuchuser' });
expect(data.length).toBe(0);
});

// ---- New: notes/search ----

it('notes/search finds notes by keyword', async () => {
// Create a fresh searchable note
await callApi('notes/create', { i: userToken, text: 'Unique searchable banana content' });
const { status, data } = await callApi('notes/search', { query: 'banana' });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
});

it('notes/search returns empty for no match', async () => {
const { data } = await callApi('notes/search', { query: 'xyznosuchnote9999' });
expect(data.length).toBe(0);
});

// ---- New: notes/state ----

it('notes/state returns not favorited initially', async () => {
// Create a fresh note to test state on
const { data: noteData } = await callApi('notes/create', { i: userToken, text: 'state test note' });
stateNoteId = noteData.createdNote.id;
const { status, data } = await callApi('notes/state', { i: userToken, noteId: stateNoteId });
expect(status).toBe(200);
expect(data.isFavorited).toBe(false);
expect(data.myReaction).toBeNull();
});

// ---- New: favorites ----

it('notes/favorites/create favorites a note', async () => {
const { status } = await callApi('notes/favorites/create', { i: userToken, noteId: stateNoteId });
expect(status).toBe(200);
});

it('notes/state shows isFavorited=true after favorite', async () => {
const { data } = await callApi('notes/state', { i: userToken, noteId: stateNoteId });
expect(data.isFavorited).toBe(true);
});

it('i/favorites returns favorited notes', async () => {
const { status, data } = await callApi('i/favorites', { i: userToken });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
});

it('notes/favorites/delete unfavorites', async () => {
const { status } = await callApi('notes/favorites/delete', { i: userToken, noteId: stateNoteId });
expect(status).toBe(200);
const { data } = await callApi('notes/state', { i: userToken, noteId: stateNoteId });
expect(data.isFavorited).toBe(false);
});

// ---- New: notes/reactions list ----

it('notes/reactions lists reactions on a note', async () => {
await callApi('notes/reactions/create', { i: userToken, noteId: stateNoteId, reaction: '⭐' });
const { status, data } = await callApi('notes/reactions', { noteId: stateNoteId });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
expect(data[0].type).toBe('⭐');
});

// ---- New: notes/conversation ----

it('notes/conversation returns reply chain', async () => {
const { data: root } = await callApi('notes/create', { i: userToken, text: 'Root note' });
const rootId = root.createdNote.id;
const { data: reply } = await callApi('notes/create', { i: userToken, text: 'Reply', replyId: rootId });
const replyId = reply.createdNote.id;
const { status, data } = await callApi('notes/conversation', { noteId: replyId });
expect(status).toBe(200);
// Conversation returns the parent chain
expect(data.length).toBeGreaterThan(0);
expect(data[0].id).toBe(rootId);
});

// ---- New: notes/mentions ----

it('notes/mentions returns notes mentioning current user', async () => {
await callApi('notes/create', { i: adminToken, text: `Hello @testuser how are you` });
const { status, data } = await callApi('notes/mentions', { i: userToken });
expect(status).toBe(200);
expect(data.length).toBeGreaterThan(0);
});

// ---- New: notifications ----

it('i/notifications returns notifications', async () => {
const { status, data } = await callApi('i/notifications', { i: userToken });
expect(status).toBe(200);
expect(Array.isArray(data)).toBe(true);
});

it('notifications/mark-all-as-read marks all read', async () => {
const { status } = await callApi('notifications/mark-all-as-read', { i: userToken });
expect(status).toBe(200);
const { data } = await callApi('i/notifications', { i: userToken, unreadOnly: true });
expect(data.length).toBe(0);
});

// ---- New: admin endpoints ----

it('admin/show-moderation-logs returns logs', async () => {
const { status, data } = await callApi('admin/show-moderation-logs', { i: adminToken });
expect(status).toBe(200);
expect(Array.isArray(data)).toBe(true);
expect(data.length).toBeGreaterThan(0);
});

it('admin/reset-password resets user password', async () => {
const { status } = await callApi('admin/reset-password', { i: adminToken, userId, newPassword: 'reset123' });
expect(status).toBe(200);
// Old token is now invalid
const { status: oldStatus } = await callApi('i', { i: userToken });
expect(oldStatus).toBe(401);
// Can sign in with new password
const { status: signinStatus, data } = await callApi('signin', { username: 'testuser', password: 'reset123' });
expect(signinStatus).toBe(200);
userToken = data.i;
});

it('admin/delete-account deletes user', async () => {
// Create a throwaway user to delete
const invite2 = await callApi('invite/create', { i: adminToken });
const ic2 = invite2.data.code;
const { data: newUser } = await callApi('signup', { username: 'throwaway', password: 'pass', invitationCode: ic2 });
const throwId = newUser.id;
const { status } = await callApi('admin/delete-account', { i: adminToken, userId: throwId });
expect(status).toBe(200);
const { status: showStatus } = await callApi('users/show', { userId: throwId });
expect(showStatus).toBe(404);
});

it('.well-known/nodeinfo returns links', async () => {
const request = new Request(`${BASE_URL}/.well-known/nodeinfo`, { method: 'GET' });
const ctx = createExecutionContext();
const response = await worker.fetch(request, env as unknown as WorkerEnv, ctx);
await waitOnExecutionContext(ctx);
const data = await response.json() as any;
expect(Array.isArray(data.links)).toBe(true);
expect(data.links[0].rel).toContain('nodeinfo');
});

it('nodeinfo/2.1 returns software info', async () => {
const request = new Request(`${BASE_URL}/nodeinfo/2.1`, { method: 'GET' });
const ctx = createExecutionContext();
const response = await worker.fetch(request, env as unknown as WorkerEnv, ctx);
await waitOnExecutionContext(ctx);
const data = await response.json() as any;
expect(data.software.name).toBe('misslite');
expect(data.version).toBe('2.1');
});

// ---- Registry ----

it('i/registry/get-all returns empty object for empty scope', async () => {
const { status, data } = await callApi('i/registry/get-all', { i: adminToken, scope: [] });
expect(status).toBe(200);
expect(typeof data).toBe('object');
});

it('i/registry/set persists a value', async () => {
const { status } = await callApi('i/registry/set', { i: adminToken, scope: ['test-scope'], key: 'myKey', value: 42 });
expect(status).toBe(200);
});

it('i/registry/get retrieves a stored value', async () => {
const { status, data } = await callApi('i/registry/get', { i: adminToken, scope: ['test-scope'], key: 'myKey' });
expect(status).toBe(200);
expect(data).toBe(42);
});

it('i/registry/get-all returns all keys in scope', async () => {
await callApi('i/registry/set', { i: adminToken, scope: ['test-scope'], key: 'anotherKey', value: 'hello' });
const { status, data } = await callApi('i/registry/get-all', { i: adminToken, scope: ['test-scope'] });
expect(status).toBe(200);
expect(data.myKey).toBe(42);
expect(data.anotherKey).toBe('hello');
});

it('i/registry/keys lists keys in scope', async () => {
const { status, data } = await callApi('i/registry/keys', { i: adminToken, scope: ['test-scope'] });
expect(status).toBe(200);
expect(Array.isArray(data)).toBe(true);
expect(data).toContain('myKey');
expect(data).toContain('anotherKey');
});

it('i/registry/set updates an existing value', async () => {
await callApi('i/registry/set', { i: adminToken, scope: ['test-scope'], key: 'myKey', value: 99 });
const { data } = await callApi('i/registry/get', { i: adminToken, scope: ['test-scope'], key: 'myKey' });
expect(data).toBe(99);
});

it('i/registry/remove deletes a key', async () => {
await callApi('i/registry/remove', { i: adminToken, scope: ['test-scope'], key: 'myKey' });
const { status } = await callApi('i/registry/get', { i: adminToken, scope: ['test-scope'], key: 'myKey' });
expect(status).toBe(400);
});

it('i/registry/get returns 400 for missing key', async () => {
const { status } = await callApi('i/registry/get', { i: adminToken, scope: ['nonexistent'], key: 'nope' });
expect(status).toBe(400);
});

it('i/registry/get-all requires authentication', async () => {
const { status } = await callApi('i/registry/get-all', { scope: [] });
expect(status).toBe(401);
});

it('i/registry/set requires authentication', async () => {
const { status } = await callApi('i/registry/set', { scope: ['x'], key: 'k', value: 1 });
expect(status).toBe(401);
});
});
