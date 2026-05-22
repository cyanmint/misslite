# Misslite CF

Misslite is a lightweight Misskey-compatible backend running on **Cloudflare Workers + D1 + R2**, with a patched Misskey frontend built in CI and deployed as static assets.

## What this repository contains

- A Worker API implementation (`src/**`) compatible with a practical subset of Misskey endpoints
- A frontend patch set (`patches/**`) applied to upstream `misskey-dev/misskey` during CI builds
- CI workflows that:
  - validate API spec files
  - run Worker tests
  - verify frontend patches apply and build
  - build/deploy frontend assets to GitHub Pages

## Architecture

```text
Misskey Frontend (patched, static)  --->  Cloudflare Worker API (/api/*)
                                           |-- D1 (relational app data)
                                           |-- R2 (drive file objects)
                                           |-- SEND_EMAIL binding
```

## Repository layout

```text
.
├── .github/workflows/           # CI and deployment workflows
├── db/
│   └── schema.sql               # SQL schema artifact/reference
├── patches/                     # Frontend patches applied to upstream Misskey
├── scripts/
│   ├── api-coverage.mjs         # Endpoint coverage/stub/malfunction report
│   └── build-frontend.sh        # Local frontend build helper (patch + build)
├── specs/
│   ├── api.json                 # OpenAPI source of truth used by CI/reporting
│   └── endpoint_info.json       # Coverage grouping/diagnostic metadata
├── src/
│   ├── __tests__/               # Vitest API tests
│   ├── handlers/                # Endpoint handler modules
│   ├── helpers.ts               # Shared utility functions
│   ├── index.ts                 # Router and endpoint registration
│   ├── schema.ts                # Runtime DB schema/bootstrap logic
│   └── types.ts                 # Shared types
├── LICENSE.txt
├── package.json
├── vitest.config.ts
└── wrangler.jsonc
```

## Worker backend

- Entry router: `src/index.ts`
- Data model/schema: `src/schema.ts`
- Major domains are separated under `src/handlers/` (auth, users, notes, drive, chat, admin, etc.)
- Tests: `src/__tests__/api.test.ts`

### Notable implemented areas

- Authentication and basic account/session flows
- Notes/timeline/reactions and related user-facing reads
- Chat rooms/messages endpoints
- Drive metadata + R2-backed file serving
- Admin/moderation basics
- Various compatibility/stub endpoints to satisfy frontend/client expectations

## Frontend pipeline

Misslite does **not** build frontend code directly from this repository source tree.
Instead, CI:

1. Clones upstream `misskey-dev/misskey`
2. Applies all patch files in `patches/**` (sorted)
3. Builds frontend workspaces
4. Collects built static assets to `webroot/`

`patches/packages/frontend/index.html.patch` is intentionally minimal and keeps boot behavior close to upstream Misskey style.

## CI workflows

- `test-worker.yml`: Worker unit tests + API coverage report
- `validate-api-json.yml`: validates `specs/api.json`
- `get-api-diff.yml`: uploads base/head API spec artifacts for PR diff reporting
- `test-frontend.yml`: verifies patches apply and frontend build succeeds
- `build-frontend.yml`: builds/deploys frontend assets (GitHub Pages)
- `lint.yml`: runs frontend lint/typecheck against patched upstream clone

## Local development

### Install

```bash
npm install
```

### Run Worker locally

```bash
npm run dev
```

### Run tests

```bash
npm test
```

### Build frontend locally (patched upstream clone)

```bash
npm run frontend
# or
./scripts/build-frontend.sh
```

## Configuration

Main runtime config is in `wrangler.jsonc`:

- D1 binding: `DB`
- R2 binding: `R2`
- Email binding: `SEND_EMAIL`
- Instance metadata vars (`INSTANCE_NAME`, `INSTANCE_DESCRIPTION`, etc.)

## Notes

- Branding is **Misslite**.
- Frontend CI builds from upstream Misskey + local patches, so patch validity is a critical quality gate.
