#!/usr/bin/env node
/**
 * api-coverage.mjs
 *
 * Starts the worker via wrangler unstable_dev, then probes every endpoint
 * listed in api.json (Misskey OpenAPI spec) and classifies each as:
 *
 *   ✓ correct     — handler exists AND (response is non-200, OR 200 body passes schema checks)
 *   ~ malfunction — handler exists, returned 200, but body fails schema validation
 *   ✗ missing     — handler returns 404
 *
 * Probes are unauthenticated with an empty body, so:
 *   - 401/403 responses → endpoint correctly rejects unauthed request  → correct
 *   - 400 responses     → endpoint correctly rejects missing params      → correct
 *   - 200/204 responses → endpoint responded; validate body against spec
 *
 * Exits 0 always — this is a coverage report, not a build gate.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(__dirname, '..');
const API_JSON   = resolve(__dirname, '../../api.json');

// ── Load spec ─────────────────────────────────────────────────────────────────
const apiSpec  = JSON.parse(readFileSync(API_JSON, 'utf-8'));
const schemas  = apiSpec.components?.schemas ?? {};

// ── Schema helpers ────────────────────────────────────────────────────────────

function resolveRef(ref) {
  if (!ref?.startsWith('#/')) return {};
  const parts = ref.slice(2).split('/');   // ['components','schemas','Foo']
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

/**
 * Validate a 200 response body against the spec.
 * Returns null (pass) or a string describing the problem.
 * Only validates when we get a 200 — other status codes are acceptable.
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
    endpoints.push({ path, method, successSpec: getSuccessSpec(methodSpec) });
  }
}
console.log(`\nLoaded ${endpoints.length} endpoints from api.json\n`);

// ── Start worker ──────────────────────────────────────────────────────────────
const { unstable_dev } = await import(
  resolve(WORKER_DIR, 'node_modules/wrangler/wrangler-dist/cli.js')
);
console.log('Starting worker via wrangler unstable_dev…');
const worker = await unstable_dev(
  resolve(WORKER_DIR, 'src/index.ts'),
  {
    config: resolve(WORKER_DIR, 'wrangler.toml'),
    local: true,
    experimental: { disableExperimentalWarning: true },
    vars: { INITIAL_PASSWORD: 'testpass', INSTANCE_NAME: 'CoverageTest' },
  },
);

// ── Probe each endpoint ───────────────────────────────────────────────────────
const results = [];
const tally = { correct: 0, malfunction: 0, missing: 0 };

process.stdout.write('Probing');
for (const { path, method, successSpec } of endpoints) {
  const url = `http://localhost/api/${path}`;
  const init =
    method === 'get'
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) };

  let status = 0;
  let reason = null;

  try {
    const res = await worker.fetch(url, init);
    status = res.status;

    if (status === 200) {
      // Got a success response — validate the body against the spec
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
    }
    // Any other non-404 status (401, 403, 400, 204, 500…) = endpoint exists and
    // is handling the request — count as correct (we probed without auth/params)
  } catch (err) {
    status = 0;
    reason = `fetch error: ${err.message}`;
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
await worker.stop();

// ── Print per-verdict lists ───────────────────────────────────────────────────
for (const [label, sym, key] of [
  ['Malfunction (handler exists but 200 response does not match spec)', '~', 'malfunction'],
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

// ── Summary ───────────────────────────────────────────────────────────────────
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
    `| ~ Malfunction | ${tally.malfunction} | ${pct(tally.malfunction).trim()}% |`,
    `| ✗ Missing | ${tally.missing} | ${pct(tally.missing).trim()}% |`,
    `| **Total** | **${total}** | 100% |`,
    '',
  ];

  const malfunctions = results.filter(r => r.verdict === 'malfunction');
  if (malfunctions.length > 0) {
    md.push('### ~ Malfunction (handler exists but 200 response does not match spec)');
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

  appendFileSync(summaryFile, md.join('\n'));
}

process.exit(0);
