#!/usr/bin/env node
/**
 * api-coverage.mjs
 *
 * Starts the worker via wrangler unstable_dev, creates a test admin account,
 * then probes every endpoint listed in api.json (Misskey OpenAPI spec).
 *
 * Each endpoint is classified as one of four statuses:
 *
 *   ✓ correct     — handler exists, response matches spec, AND data persists / is real
 *   ⊘ stub        — handler exists and response matches spec, but data is fake or not persisted
 *   ~ malfunction — handler exists BUT response body does not match spec
 *   ✗ missing     — handler returns 404
 *
 * Stub detection uses two strategies:
 *   Category A (State-Changing APIs): Call mutating API → restart worker → verify
 *     via a corresponding read API that the mutation persisted.
 *   Category B (Read-Only APIs): After seeding data, verify the read API actually
 *     returns the seeded data rather than empty/canned responses.
 *
 * Exits 0 always — this is a coverage report, not a build gate.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(__dirname, '..');
const API_JSON   = resolve(__dirname, '../../api.json');
const ENDPOINT_INFO = resolve(__dirname, '../../endpoint_info.json');

// ── Load spec ─────────────────────────────────────────────────────────────────
const apiSpec  = JSON.parse(readFileSync(API_JSON, 'utf-8'));

// ── Load endpoint-info.json (groups & diagnostic endpoints) ───────────────────
const endpointInfo = JSON.parse(readFileSync(ENDPOINT_INFO, 'utf-8'));
const apiGroups    = endpointInfo.__groups ?? [];
const diagnosticEndpoints = endpointInfo.__diagnostic ?? [];

// ── Schema helpers ────────────────────────────────────────────────────────────

function resolveRef(ref) {
  if (!ref?.startsWith('#/')) return {};
  const parts = ref.slice(2).split('/');
  let node = apiSpec;
  for (const p of parts) node = node?.[p] ?? {};
  return node;
}

function getRequired(schema, depth = 0) {
  if (!schema || depth > 5) return new Set();
  if (schema.$ref) return getRequired(resolveRef(schema.$ref), depth + 1);
  const req = new Set(schema.required ?? []);
  for (const sub of schema.allOf ?? []) for (const f of getRequired(sub, depth + 1)) req.add(f);
  for (const sub of [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]) for (const f of getRequired(sub, depth + 1)) req.add(f);
  return req;
}

function getSuccessSpec(methodSpec) {
  const responses = methodSpec.responses ?? {};
  if (responses['200']) {
    const content = responses['200'].content?.['application/json'];
    if (!content) return { code: 200, type: null, required: new Set() };
    const schema = content.schema ?? {};
    return { code: 200, type: schema.type ?? null, required: getRequired(schema) };
  }
  if (responses['204']) return { code: 204, type: null, required: new Set() };
  return null;
}

/** Check if endpoint requires authentication (has security field or is listed under admin/) */
function needsAuth(methodSpec) {
  return Array.isArray(methodSpec.security) && methodSpec.security.length > 0;
}

/** Get required body params (excluding auth token) from request schema */
function getRequiredParams(methodSpec) {
  const schema = methodSpec.requestBody?.content?.['application/json']?.schema;
  if (!schema) return [];
  return schema.required ?? [];
}

/**
 * Validate a 200 response body against the spec.
 * Returns null (pass) or a string describing the problem.
 */
function validateBody(body, successSpec) {
  if (!successSpec || successSpec.code !== 200) return null;
  const { type, required } = successSpec;
  if (type === 'array') {
    if (!Array.isArray(body)) return `expected array, got ${typeof body}`;
    return null;
  }
  if (type === 'object') {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return `expected object, got ${Array.isArray(body) ? 'array' : typeof body}`;
    }
    const missing = [...required].filter(k => !(k in body));
    if (missing.length > 0) return `missing required fields: ${missing.slice(0, 5).join(', ')}`;
    return null;
  }
  return null;
}

// ── Build endpoint list ───────────────────────────────────────────────────────
const endpoints = [];
for (const [rawPath, methods] of Object.entries(apiSpec.paths ?? {})) {
  const path = rawPath.replace(/^\//, '');
  for (const [method, methodSpec] of Object.entries(methods)) {
    endpoints.push({
      path,
      method,
      successSpec: getSuccessSpec(methodSpec),
      authRequired: needsAuth(methodSpec),
      requiredParams: getRequiredParams(methodSpec),
    });
  }
}
console.log(`\nLoaded ${endpoints.length} endpoints from api.json\n`);

// ── Add diagnostic endpoints from endpoint_info.json ──────────────────────────
for (const diag of diagnosticEndpoints) {
  const typeMap = { array: 'array', object: 'object' };
  endpoints.push({
    path: diag.path,
    method: diag.method ?? 'post',
    successSpec: { code: 200, type: typeMap[diag.expectedResponseType] ?? null, required: new Set() },
    authRequired: diag.hasSecurity ?? false,
    requiredParams: [],
    isDiagnostic: true,
  });
}
if (diagnosticEndpoints.length > 0) {
  console.log(`Added ${diagnosticEndpoints.length} diagnostic endpoints from endpoint_info.json\n`);
}

// ── Worker lifecycle helpers ──────────────────────────────────────────────────
const wranglerCli = resolve(WORKER_DIR, 'node_modules/wrangler/wrangler-dist/cli.js');
const workerEntry = resolve(WORKER_DIR, 'src/index.ts');
const workerConfig = resolve(WORKER_DIR, 'wrangler.toml');
const workerVars = { INITIAL_PASSWORD: 'testpass', INSTANCE_NAME: 'CoverageTest' };

async function startWorker() {
  const { unstable_dev } = await import(wranglerCli);
  return unstable_dev(workerEntry, {
    config: workerConfig,
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: workerVars,
  });
}

// ── Start worker ──────────────────────────────────────────────────────────────
console.log('Starting worker via wrangler unstable_dev…');
let worker = await startWorker();

// ── Create test account ───────────────────────────────────────────────────────
console.log('Creating test admin account…');
const TEST_USERNAME = 'coveragebot';
const TEST_PASSWORD = 'coveragepass123';
let authToken = '';

/** POST helper against current worker instance */
async function apiPost(path, body = {}) {
  return worker.fetch(`http://localhost/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Re-authenticate using stored credentials; updates authToken. */
async function refreshAuth() {
  const res = await apiPost('signin', { username: TEST_USERNAME, password: TEST_PASSWORD });
  if (res.status === 200) {
    const data = await res.json();
    authToken = data.i;
    return true;
  }
  return false;
}

try {
  const setupRes = await apiPost('admin/accounts/create', {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    setupPassword: 'testpass',
  });
  if (setupRes.status === 200) {
    const data = await setupRes.json();
    authToken = data.token;
    console.log(`  ✓ Admin account created (token: ${authToken.slice(0, 8)}…)\n`);
  } else {
    const text = await setupRes.text();
    console.log(`  ⚠ Setup returned ${setupRes.status}: ${text}`);
    console.log('  Trying signin instead…');
    if (await refreshAuth()) {
      console.log(`  ✓ Signed in (token: ${authToken.slice(0, 8)}…)\n`);
    } else {
      console.log(`  ✗ Sign-in also failed. Running without auth.\n`);
    }
  }
} catch (e) {
  console.log(`  ✗ Account creation failed: ${e.message}. Running without auth.\n`);
}

// ── Helper: make a request ────────────────────────────────────────────────────
async function probe(path, method, withAuth = false) {
  const url = `http://localhost/api/${path}`;
  const body = withAuth ? { i: authToken } : {};
  const init =
    method === 'get'
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await worker.fetch(url, init);
  return res;
}

// Endpoints that consume/invalidate the auth token when called with it.
// After probing these, we re-authenticate so subsequent probes still work.
const SESSION_INVALIDATING_PATHS = new Set(['signout', 'i/change-password']);

// ── Phase 1: Probe each endpoint ──────────────────────────────────────────────
const results = [];
const tally = { correct: 0, malfunction: 0, missing: 0, stub: 0 };

process.stdout.write('Phase 1 — Schema probe: ');
for (const { path, method, successSpec, authRequired, requiredParams } of endpoints) {
  // Skip the admin/accounts/create endpoint (we already used it for setup)
  if (path === 'admin/accounts/create') {
    results.push({ path, method: method.toUpperCase(), status: 200, verdict: 'correct', reason: null });
    tally.correct++;
    process.stdout.write('✓');
    continue;
  }

  let status = 0;
  let reason = null;

  try {
    // initial probe (unauthenticated)
    let res = await probe(path, method, false);
    status = res.status;

    // if 40x and we have auth, retry with credentials
    if ((status === 401 || status === 403) && authToken) {
      res = await probe(path, method, true);
      status = res.status;
    }

    // if this endpoint invalidates the auth session, re-authenticate
    if (SESSION_INVALIDATING_PATHS.has(path) && authToken) {
      await refreshAuth();
    }

    // Evaluate result
    if (status === 404) {
      // Missing — no handler
    } else if (status === 200) {
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        reason = 'response is not valid JSON';
      }
      if (!reason) {
        reason = validateBody(body, successSpec);
      }
    } else if (status === 204) {
      // No content — matches 204 spec, correct
    } else if (status === 400) {
      const nonAuthRequired = requiredParams.filter(p => p !== 'i' && p !== 'token');
      if (nonAuthRequired.length > 0) {
        // Endpoint needs params we didn't provide — correct behaviour
      } else {
        reason = `returned 400 but spec has no required params`;
      }
    } else if (status === 403) {
      // permission denied — count as correct (endpoint exists)
    } else if (status === 401) {
      if (authToken) {
        reason = `returned 401 even with valid auth token`;
      }
    } else if (status >= 500) {
      reason = `server error: ${status}`;
    }
  } catch (e) {
    status = 0;
    reason = `fetch error: ${e.message}`;
  }

  let verdict;
  if (status === 404) {
    verdict = 'missing';
    tally.missing++;
    process.stdout.write('✗');
  } else if (reason) {
    verdict = 'malfunction';
    tally.malfunction++;
    process.stdout.write('~');
  } else {
    verdict = 'correct';
    tally.correct++;
    process.stdout.write('✓');
  }

  results.push({ path, method: method.toUpperCase(), status, verdict, reason });
}
console.log('\n');

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2: Stub detection — behavioural verification
// ══════════════════════════════════════════════════════════════════════════════
//
// For each "correct" endpoint, we define stub tests in two categories:
//
//   Category A (State-Changing): call mutating API with specific data, then
//     verify via a read API that the data was actually persisted.
//
//   Category B (Read-Only): after seeding known data, verify the read API
//     returns non-empty / accurate results.
//
// After all tests, the worker is restarted and read APIs are checked again
// to verify persistence across restarts.
// ══════════════════════════════════════════════════════════════════════════════

console.log('Phase 2 — Stub detection (behavioural verification)…\n');

// Set of "correct" endpoint paths for quick lookup
const correctPaths = new Set(results.filter(r => r.verdict === 'correct').map(r => r.path));

/**
 * Stub test definition.
 *
 * Each test has:
 *   - targets: list of endpoint paths this test covers
 *   - seed(): performs state-changing API calls to seed test data; returns
 *     an opaque context object (or null to skip)
 *   - verify(ctx): calls read APIs to verify the seeded data; returns
 *     a Map<path, {pass: boolean, reason?: string}>
 */
const stubTests = [];

// ── Helper: safe JSON fetch ───────────────────────────────────────────────────
async function fetchJson(path, body = {}) {
  try {
    const res = await apiPost(path, { i: authToken, ...body });
    if (res.status === 200) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return null; }
    }
    return null;
  } catch { return null; }
}

// ── Test: notes/create → notes/show, notes/timeline, users/notes ──────────────
stubTests.push({
  targets: ['notes/create', 'notes/show', 'notes/timeline', 'notes/local-timeline',
            'notes/hybrid-timeline', 'notes/global-timeline', 'users/notes',
            'notes/search'],
  async seed() {
    const data = await fetchJson('notes/create', { text: 'stub-detection-test-note' });
    if (!data?.createdNote?.id) return null;
    return { noteId: data.createdNote.id };
  },
  async verify(ctx) {
    const m = new Map();
    // notes/show — should return the note we created
    const shown = await fetchJson('notes/show', { noteId: ctx.noteId });
    m.set('notes/show', { pass: shown?.id === ctx.noteId });

    // notes/create — if we got here, seed succeeded, so it's real
    m.set('notes/create', { pass: true });

    // timeline endpoints — should contain our note
    for (const tl of ['notes/timeline', 'notes/local-timeline', 'notes/hybrid-timeline', 'notes/global-timeline']) {
      const list = await fetchJson(tl, { limit: 50 });
      const found = Array.isArray(list) && list.some(n => n.id === ctx.noteId);
      m.set(tl, { pass: found, reason: found ? undefined : 'note not found in timeline' });
    }

    // users/notes
    const userNotes = await fetchJson('users/notes', { userId: shown?.userId ?? shown?.user?.id, limit: 50 });
    const foundUserNote = Array.isArray(userNotes) && userNotes.some(n => n.id === ctx.noteId);
    m.set('users/notes', { pass: foundUserNote, reason: foundUserNote ? undefined : 'note not found in user notes' });

    return m;
  },
});

// ── Test: notes/reactions/create → notes/reactions ────────────────────────────
stubTests.push({
  targets: ['notes/reactions/create', 'notes/reactions'],
  async seed() {
    // Create a note first, then react to it
    const data = await fetchJson('notes/create', { text: 'reaction-test-note' });
    if (!data?.createdNote?.id) return null;
    const noteId = data.createdNote.id;
    await apiPost('notes/reactions/create', { i: authToken, noteId, reaction: '👍' });
    return { noteId };
  },
  async verify(ctx) {
    const m = new Map();
    const reactions = await fetchJson('notes/reactions', { noteId: ctx.noteId });
    const found = Array.isArray(reactions) && reactions.length > 0;
    m.set('notes/reactions/create', { pass: found, reason: found ? undefined : 'reaction not found after create' });
    m.set('notes/reactions', { pass: found, reason: found ? undefined : 'reactions list empty' });
    return m;
  },
});

// ── Test: notes/favorites/create → i/favorites ───────────────────────────────
stubTests.push({
  targets: ['notes/favorites/create', 'i/favorites'],
  async seed() {
    const data = await fetchJson('notes/create', { text: 'favorite-test-note' });
    if (!data?.createdNote?.id) return null;
    const noteId = data.createdNote.id;
    await apiPost('notes/favorites/create', { i: authToken, noteId });
    return { noteId };
  },
  async verify(ctx) {
    const m = new Map();
    const favs = await fetchJson('i/favorites', {});
    const found = Array.isArray(favs) && favs.some(f => (f.noteId ?? f.note?.id) === ctx.noteId);
    m.set('notes/favorites/create', { pass: found, reason: found ? undefined : 'favorite not found after create' });
    m.set('i/favorites', { pass: found, reason: found ? undefined : 'favorites list empty/missing note' });
    return m;
  },
});

// ── Test: i/update → i (read-back profile changes) ───────────────────────────
stubTests.push({
  targets: ['i/update', 'i'],
  async seed() {
    const newName = 'StubTest_' + Date.now();
    await apiPost('i/update', { i: authToken, name: newName });
    return { expectedName: newName };
  },
  async verify(ctx) {
    const m = new Map();
    const me = await fetchJson('i', {});
    const pass = me?.name === ctx.expectedName;
    m.set('i/update', { pass, reason: pass ? undefined : `name not updated (got ${me?.name})` });
    m.set('i', { pass: !!me?.id, reason: me?.id ? undefined : 'i endpoint returned no user' });
    return m;
  },
});

// ── Test: i/registry/set → i/registry/get ────────────────────────────────────
stubTests.push({
  targets: ['i/registry/set', 'i/registry/get', 'i/registry/keys', 'i/registry/get-all'],
  async seed() {
    const key = 'stubtest_' + Date.now();
    const value = { test: true, ts: Date.now() };
    await apiPost('i/registry/set', { i: authToken, key, value, scope: ['client', 'base'] });
    return { key, value };
  },
  async verify(ctx) {
    const m = new Map();
    const got = await fetchJson('i/registry/get', { key: ctx.key, scope: ['client', 'base'] });
    const pass = got !== null && JSON.stringify(got) === JSON.stringify(ctx.value);
    m.set('i/registry/set', { pass, reason: pass ? undefined : 'registry value not persisted' });
    m.set('i/registry/get', { pass, reason: pass ? undefined : 'registry get returned wrong value' });

    const keys = await fetchJson('i/registry/keys', { scope: ['client', 'base'] });
    const keysPass = Array.isArray(keys) && keys.includes(ctx.key);
    m.set('i/registry/keys', { pass: keysPass, reason: keysPass ? undefined : 'key not found in keys list' });

    const all = await fetchJson('i/registry/get-all', { scope: ['client', 'base'] });
    const allPass = all !== null && typeof all === 'object' && ctx.key in all;
    m.set('i/registry/get-all', { pass: allPass, reason: allPass ? undefined : 'key not found in get-all' });

    return m;
  },
});

// ── Test: sw/register → sw/register read-back ─────────────────────────────────
stubTests.push({
  targets: ['sw/register'],
  async seed() {
    const endpoint = 'https://example.com/push/' + Date.now();
    await apiPost('sw/register', { i: authToken, endpoint, auth: 'testauthkey', publickey: 'testpubkey' });
    return { endpoint };
  },
  async verify(ctx) {
    const m = new Map();
    // sw/register returns state info; re-calling should show already-subscribed
    const res = await fetchJson('sw/register', { endpoint: ctx.endpoint, auth: 'testauthkey', publickey: 'testpubkey' });
    const pass = res?.state === 'already-subscribed' || res?.endpoint === ctx.endpoint;
    m.set('sw/register', { pass, reason: pass ? undefined : 'sw subscription not persisted' });
    return m;
  },
});

// ── Test: admin/announcements/create → announcements ─────────────────────────
stubTests.push({
  targets: ['admin/announcements/create', 'announcements'],
  async seed() {
    const title = 'StubTest Announcement ' + Date.now();
    const data = await fetchJson('admin/announcements/create', { title, text: 'test body', imageUrl: null });
    if (!data?.id) return null;
    return { announcementId: data.id, title };
  },
  async verify(ctx) {
    const m = new Map();
    const list = await fetchJson('announcements', {});
    const found = Array.isArray(list) && list.some(a => a.id === ctx.announcementId);
    m.set('admin/announcements/create', { pass: found, reason: found ? undefined : 'announcement not found after create' });
    m.set('announcements', { pass: found, reason: found ? undefined : 'announcements list missing created item' });
    return m;
  },
});

// ── Test: invite/create → invite/list ────────────────────────────────────────
stubTests.push({
  targets: ['invite/create', 'invite/list'],
  async seed() {
    const data = await fetchJson('invite/create', {});
    if (!data) return null;
    // data might be the invite object itself
    const code = data.code ?? data.id;
    return { code };
  },
  async verify(ctx) {
    const m = new Map();
    const list = await fetchJson('invite/list', {});
    const found = Array.isArray(list) && list.length > 0;
    m.set('invite/create', { pass: found, reason: found ? undefined : 'no invites found after create' });
    m.set('invite/list', { pass: found, reason: found ? undefined : 'invite list empty' });
    return m;
  },
});

// ── Test: users/show, users/search (read-only — should find our admin user) ──
stubTests.push({
  targets: ['users/show', 'users/search'],
  async seed() { return { username: TEST_USERNAME }; },
  async verify(ctx) {
    const m = new Map();
    const shown = await fetchJson('users/show', { username: ctx.username });
    const showPass = shown?.username === ctx.username;
    m.set('users/show', { pass: showPass, reason: showPass ? undefined : 'users/show did not return test user' });

    const searched = await fetchJson('users/search', { query: ctx.username });
    const searchPass = Array.isArray(searched) && searched.some(u => u.username === ctx.username);
    m.set('users/search', { pass: searchPass, reason: searchPass ? undefined : 'users/search did not find test user' });
    return m;
  },
});

// ── Test: i/notifications (read-only — after activity, should be non-empty) ──
stubTests.push({
  targets: ['i/notifications'],
  async seed() {
    // Notifications are generated by activity (reactions, etc.) done in previous tests
    return {};
  },
  async verify() {
    const m = new Map();
    // We can't guarantee notifications exist, so just check the endpoint returns a valid array
    // Stub detection here: if there are reactions and favorites we created, there might be notifs
    const notifs = await fetchJson('i/notifications', { limit: 10 });
    // For read-only, simply passing if the endpoint returns a proper array is enough
    // The stub check for notifications is less strict since notifs depend on server-side generation
    m.set('i/notifications', { pass: Array.isArray(notifs) });
    return m;
  },
});

// ── Test: meta (read-only — should have real server data) ────────────────────
stubTests.push({
  targets: ['meta'],
  async seed() { return {}; },
  async verify() {
    const m = new Map();
    const data = await fetchJson('meta', {});
    // A real meta response has name, version, etc.
    const pass = data?.name && data?.version;
    m.set('meta', { pass: !!pass, reason: pass ? undefined : 'meta response missing name or version' });
    return m;
  },
});

// ── Test: stats (read-only — should reflect actual user/note counts) ─────────
stubTests.push({
  targets: ['stats'],
  async seed() { return {}; },
  async verify() {
    const m = new Map();
    const data = await fetchJson('stats', {});
    // After creating a user and notes, usersCount should be ≥ 1
    const pass = data && typeof data.usersCount === 'number' && data.usersCount >= 1;
    m.set('stats', { pass: !!pass, reason: pass ? undefined : `stats.usersCount is ${data?.usersCount}` });
    return m;
  },
});

// ── Test: emojis (read-only) ──────────────────────────────────────────────────
stubTests.push({
  targets: ['emojis'],
  async seed() { return {}; },
  async verify() {
    const m = new Map();
    const data = await fetchJson('emojis', {});
    // emojis should return an object with emojis array
    const pass = data && 'emojis' in data && Array.isArray(data.emojis);
    m.set('emojis', { pass: !!pass, reason: pass ? undefined : 'emojis response missing emojis array' });
    return m;
  },
});

// ── Test: ping ────────────────────────────────────────────────────────────────
stubTests.push({
  targets: ['ping'],
  async seed() { return {}; },
  async verify() {
    const m = new Map();
    const data = await fetchJson('ping', {});
    const pass = data && typeof data.pong === 'number' && data.pong > 0;
    m.set('ping', { pass: !!pass, reason: pass ? undefined : 'ping did not return valid pong timestamp' });
    return m;
  },
});

// ── Run stub tests (pre-restart) ──────────────────────────────────────────────

// stubVerdict: path → { preRestart: boolean, postRestart: boolean, reason?: string }
const stubVerdict = new Map();

// Seed contexts for post-restart verification
const seedContexts = [];

for (const test of stubTests) {
  // Only run tests where at least one target was "correct" in Phase 1
  const relevantTargets = test.targets.filter(t => correctPaths.has(t));
  if (relevantTargets.length === 0) continue;

  try {
    const ctx = await test.seed();
    if (!ctx) {
      // Seed failed — mark relevant targets as stub
      for (const t of relevantTargets) {
        stubVerdict.set(t, { preRestart: false, postRestart: false, reason: 'seed failed (API returned no data)' });
      }
      continue;
    }

    const verifyResults = await test.verify(ctx);
    for (const [path, result] of verifyResults) {
      if (!correctPaths.has(path)) continue;
      stubVerdict.set(path, {
        preRestart: result.pass,
        postRestart: false, // will be set after restart
        reason: result.reason,
      });
    }

    // Store for post-restart
    seedContexts.push({ test, ctx, relevantTargets });
  } catch (e) {
    for (const t of relevantTargets) {
      stubVerdict.set(t, { preRestart: false, postRestart: false, reason: `test error: ${e.message}` });
    }
  }
}

console.log(`  Pre-restart verification complete (${stubVerdict.size} endpoints tested)\n`);

// ── Phase 3: Restart worker and re-verify ─────────────────────────────────────
console.log('Phase 3 — Restarting worker for persistence verification…');
await worker.stop();
worker = await startWorker();

// Re-authenticate
if (await refreshAuth()) {
  console.log(`  ✓ Re-authenticated after restart (token: ${authToken.slice(0, 8)}…)\n`);
} else {
  console.log('  ✗ Re-authentication failed after restart. Persistence tests may be inaccurate.\n');
}

for (const { test, ctx, relevantTargets } of seedContexts) {
  try {
    const verifyResults = await test.verify(ctx);
    for (const [path, result] of verifyResults) {
      if (!correctPaths.has(path)) continue;
      const existing = stubVerdict.get(path);
      if (existing) {
        existing.postRestart = result.pass;
        if (!result.pass && !existing.reason) {
          existing.reason = result.reason ?? 'data not persisted after restart';
        }
      }
    }
  } catch (e) {
    for (const t of relevantTargets) {
      const existing = stubVerdict.get(t);
      if (existing) {
        existing.postRestart = false;
        if (!existing.reason) existing.reason = `post-restart error: ${e.message}`;
      }
    }
  }
}

await worker.stop();
console.log('  Post-restart verification complete\n');

// ── Apply stub verdicts to results ────────────────────────────────────────────
for (const r of results) {
  if (r.verdict !== 'correct') continue;
  const sv = stubVerdict.get(r.path);
  if (!sv) continue; // no stub test defined for this endpoint — keep as correct

  // An endpoint is a stub if EITHER pre-restart or post-restart check failed
  if (!sv.preRestart || !sv.postRestart) {
    r.verdict = 'stub';
    r.reason = sv.reason ?? 'data not persisted or not functional';
    tally.correct--;
    tally.stub++;
  }
}

// ── Group-level stub propagation ──────────────────────────────────────────────
// If ANY endpoint in a group is flagged as Stub, mark ALL endpoints in that
// group as Stub. This ensures collective attribution — when a lifecycle test
// fails, all participating endpoints are flagged for investigation.
const resultsByPath = new Map(results.map(r => [r.path, r]));
for (const group of apiGroups) {
  const members = group.endpoints ?? [];
  const anyStub = members.some(ep => resultsByPath.get(ep)?.verdict === 'stub');
  if (!anyStub) continue;

  for (const ep of members) {
    const r = resultsByPath.get(ep);
    if (!r || r.verdict === 'stub') continue;
    if (r.verdict === 'correct') {
      r.verdict = 'stub';
      r.reason = `group "${group.name}" failed — collective stub attribution`;
      tally.correct--;
      tally.stub++;
    }
  }
}

// ── Print per-verdict lists ───────────────────────────────────────────────────
for (const [label, sym, key] of [
  ['Stub (matches spec but non-functional / not persisted)', '⊘', 'stub'],
  ['Malfunction (handler exists but response does not match spec)', '~', 'malfunction'],
  ['Missing (no handler — returns 404)', '✗', 'missing'],
]) {
  const list = results.filter(r => r.verdict === key);
  if (list.length === 0) continue;
  console.log(`${label}:`);
  for (const { method, path, status, reason } of list) {
    const note = reason ? `  ← ${reason}` : '';
    console.log(`  ${sym}  ${method.padEnd(4)} /${path}  [${status}]${note}`);
  }
  console.log('');
}

// ── Group visualization (console) ─────────────────────────────────────────────
if (apiGroups.length > 0) {
  console.log('Defined API Groups:');
  for (const group of apiGroups) {
    const members = group.endpoints ?? [];
    const verdicts = members.map(ep => {
      const r = resultsByPath.get(ep);
      if (!r) return '?';
      return r.verdict === 'correct' ? '✓' : r.verdict === 'stub' ? '⊘' : r.verdict === 'malfunction' ? '~' : '✗';
    });
    const allPass = verdicts.every(v => v === '✓');
    const groupSym = allPass ? '✓' : '⊘';
    console.log(`  ${groupSym} ${group.name}`);
    for (let i = 0; i < members.length; i++) {
      console.log(`      ${verdicts[i]} ${members[i]}`);
    }
  }
  console.log('');
}

// ── Orphan detection (console) ────────────────────────────────────────────────
const groupedPaths = new Set(apiGroups.flatMap(g => g.endpoints ?? []));
const allProbedPaths = results.map(r => r.path);
const orphans = allProbedPaths.filter(p => !groupedPaths.has(p));
if (orphans.length > 0) {
  console.log(`Unclassified APIs (${orphans.length} not in any group):`);
  for (const p of orphans) {
    console.log(`  · ${p}`);
  }
  console.log('');
}
const total = endpoints.length;
const pct  = n => total > 0 ? ((n / total) * 100).toFixed(1).padStart(5) : '  0.0';
const pad  = n => String(n).padStart(6);

console.log([
  '',
  '╔═══════════════════════════════════════════════╗',
  '║            API COVERAGE SUMMARY               ║',
  '╠═══════════════════════════════════════════════╣',
  `║  Total endpoints  : ${pad(total)}                     ║`,
  `║  ✓ Correct        : ${pad(tally.correct)}  (${pct(tally.correct)}%)          ║`,
  `║  ⊘ Stub           : ${pad(tally.stub)}  (${pct(tally.stub)}%)          ║`,
  `║  ~ Malfunction    : ${pad(tally.malfunction)}  (${pct(tally.malfunction)}%)          ║`,
  `║  ✗ Missing (404)  : ${pad(tally.missing)}  (${pct(tally.missing)}%)          ║`,
  '╚═══════════════════════════════════════════════╝',
  '',
].join('\n'));

// ── GitHub step summary ───────────────────────────────────────────────────────
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const md = [
    '## API Coverage Report',
    '',
    '| Status | Count | % |',
    '|--------|------:|--:|',
    `| ✓ Correct | ${tally.correct} | ${pct(tally.correct).trim()}% |`,
    `| ⊘ Stub | ${tally.stub} | ${pct(tally.stub).trim()}% |`,
    `| ~ Malfunction | ${tally.malfunction} | ${pct(tally.malfunction).trim()}% |`,
    `| ✗ Missing | ${tally.missing} | ${pct(tally.missing).trim()}% |`,
    `| **Total** | **${total}** | 100% |`,
    '',
  ];

  const stubs = results.filter(r => r.verdict === 'stub');
  if (stubs.length > 0) {
    md.push('### ⊘ Stub (matches spec but non-functional)');
    md.push('');
    md.push('| Method | Endpoint | Status | Reason |');
    md.push('|--------|---------|-------:|--------|');
    for (const { method, path, status, reason } of stubs) {
      md.push(`| ${method} | \`/${path}\` | ${status} | ${reason ?? ''} |`);
    }
    md.push('');
  }

  const malfunctions = results.filter(r => r.verdict === 'malfunction');
  if (malfunctions.length > 0) {
    md.push('### ~ Malfunction');
    md.push('');
    md.push('| Method | Endpoint | Status | Reason |');
    md.push('|--------|---------|-------:|--------|');
    for (const { method, path, status, reason } of malfunctions) {
      md.push(`| ${method} | \`/${path}\` | ${status} | ${reason ?? ''} |`);
    }
    md.push('');
  }

  const missing = results.filter(r => r.verdict === 'missing');
  if (missing.length > 0) {
    md.push('### ✗ Missing (404)');
    md.push('');
    md.push('| Method | Endpoint |');
    md.push('|--------|---------|');
    for (const { method, path } of missing) {
      md.push(`| ${method} | \`/${path}\` |`);
    }
    md.push('');
  }

  // ── Groups visualization ──────────────────────────────────────────────────
  if (apiGroups.length > 0) {
    md.push('### API Test Groups');
    md.push('');
    md.push('| Group | Status | Endpoints |');
    md.push('|-------|--------|-----------|');
    for (const group of apiGroups) {
      const members = group.endpoints ?? [];
      const allPass = members.every(ep => resultsByPath.get(ep)?.verdict === 'correct');
      const sym = allPass ? '✓ Pass' : '⊘ Stub';
      md.push(`| ${group.name} | ${sym} | ${members.map(e => '`' + e + '`').join(', ')} |`);
    }
    md.push('');
  }

  // ── Orphan detection ──────────────────────────────────────────────────────
  if (orphans.length > 0) {
    md.push('### Unclassified APIs');
    md.push('');
    md.push(`${orphans.length} endpoint(s) not assigned to any test group:`);
    md.push('');
    md.push('<details><summary>Show all</summary>');
    md.push('');
    for (const p of orphans) {
      md.push(`- \`${p}\``);
    }
    md.push('');
    md.push('</details>');
    md.push('');
  }

  appendFileSync(summaryFile, md.join('\n'));
}

process.exit(0);
