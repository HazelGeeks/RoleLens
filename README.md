# RoleLens MVP

RoleLens is a personal frontend-job tracking app focused on manual capture, structured storage, analysis, and status tracking.

Production is configured for **Cloudflare Workers** through the OpenNext adapter.

## Current Architecture

- Next.js 16 + App Router
- TypeScript + Tailwind CSS
- Cloudflare Workers + OpenNext
- Cloudflare D1 for shared server-side persistence
- Client-side local persistence (`localStorage`)
- TanStack Table + Recharts

## Features

1. Save job posting (manual input + URL + text)
2. Stable source sync (Python crawler JSON feed)
3. List page with search/filter/sort
4. Detail page with notes and status updates
5. Dashboard analytics (skills/source/remote/seniority, authenticated users only)
6. Status tracking pipeline:
   - `NONE` (`-`, default)
   - `NEW`
   - `SAVE`
   - `INTEREST`
   - `SUBMITTED`
   - `ARCHIVE`
7. Login / Sign-up with server-side session auth (D1 in Cloudflare runtime, memory fallback locally)

## Stable Feed Storage

RoleLens uses D1 as the canonical feed snapshot store:

1. The `Daily Feed Sync` GitHub Actions workflow runs the Python scraper and POSTs normalized JSON to `/api/jobs/ingest`
2. Browser-triggered `/api/jobs/sync` fetches `PYTHON_SCRAPED_FEED_URL` when configured and stores the latest snapshot in D1 (`feed_import_snapshots`)
3. `/api/jobs/import` reads the latest snapshot from D1
4. Client sync merges imported postings into local storage while preserving status/notes/follow-up

### Feed Source Environment Variables

Feed ingestion:

- `PYTHON_SCRAPED_FEED_URL` (optional; JSON snapshot URL fetched by `/api/jobs/sync` before D1 is read)
- `CRON_SECRET` (required; `/api/jobs/cron` rejects all calls without `x-cron-secret`)
- `SYNC_ADMIN_SECRET` (optional; protects manual import refresh via `x-rolelens-sync-secret`, falls back to `CRON_SECRET` when unset)
- `SYNC_ADMIN_EMAILS` (required for browser-triggered manual sync in production; comma-separated admin account emails; `SYNC_ADMIN_EMAIL` is also accepted for one admin)
- `IMPORT_PUBLIC_RATE_LIMIT_PER_MIN` (optional; default `60`, anonymous import-route request budget per IP)

GitHub Actions feed sync:

- `ROLELENS_CRON_SECRET` (required repository secret; must match the deployed Cloudflare `CRON_SECRET`)
- `ROLELENS_SYNC_URL` (optional repository secret; falls back to the `ROLELENS_PRODUCTION_URL` repository variable)
  - When Cloudflare Access protects the Worker URL, point this secret to a public, secret-protected ingestion endpoint until an Access service token is configured.

Auth security:

- `AUTH_PASSWORD_PEPPER` (required in production; added to password hashing material before DB storage)
  - Set as `AUTH_PASSWORD_PEPPER=<long-random-value>` (example generation: `openssl rand -base64 48`)
  - In non-production local dev, if omitted, RoleLens uses a development fallback pepper and logs a warning.
- `AUTH_BACKEND` (optional override: `memory`/`d1`; if unset, RoleLens auto-uses D1 when the binding is available)

### D1 Feed Refresh

The app does not run Python inside Cloudflare Workers. Instead, `.github/workflows/daily-feed-sync.yml` runs the Python scraper on a schedule, uploads the generated JSON as a short-lived artifact, POSTs it to `/api/jobs/ingest`, then calls `/api/jobs/cron` to warm the cache from the new D1 snapshot.

`PYTHON_SCRAPED_FEED_URL` remains available for debugging or alternate external schedulers, but the default production automation path is the scheduled GitHub Actions scrape-and-ingest workflow.

`POST /api/jobs/sync` refreshes D1 from `PYTHON_SCRAPED_FEED_URL` when configured, then returns the latest D1 snapshot:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-rolelens-sync-secret: $SYNC_ADMIN_SECRET" \
  --data '{"platform":"all"}' \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/sync/"
```

`POST /api/jobs/ingest` accepts a normalized feed snapshot and stores it in D1:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-cron-secret: $CRON_SECRET" \
  --data-binary "@feed-snapshot.json" \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/ingest/"
```

`POST /api/jobs/cron` refreshes the edge cache from the latest D1 snapshot:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/cron/"
```

On the app list screen, `Sync All Feeds` calls `/api/jobs/sync`, which refreshes D1 from `PYTHON_SCRAPED_FEED_URL` when configured and then merges the resulting D1 snapshot into the browser workspace. Platform-scoped sync buttons (`Sync Indeed`, `Sync LinkedIn`, `Sync Saramin`, `Sync JobKorea`) use the same refreshed D1 snapshot filtered by platform. In production, browser-triggered manual sync requires the signed-in account email to be listed in `SYNC_ADMIN_EMAILS`; cron/secret-triggered sync still uses `CRON_SECRET` or `SYNC_ADMIN_SECRET`.

### Troubleshooting Feed Source Configuration

If you see "No valid feed source is configured", run this checklist:

1. Confirm D1 migrations are applied and `feed_import_snapshots` exists.
2. Confirm the `Daily Feed Sync` workflow has `ROLELENS_CRON_SECRET` and can POST to `/api/jobs/ingest`.
3. Confirm `ROLELENS_CRON_SECRET` matches the deployed Cloudflare `CRON_SECRET`.
4. If `PYTHON_SCRAPED_FEED_URL` is intentionally configured, call `POST /api/jobs/sync` and verify it returns `refreshed: true`.
5. Open Jobs page and run `Sync All Feeds` (or a platform-specific sync button) again.

Notes:
- Do not use comma-only or whitespace-only values (for example: `, ,`).
- API diagnostics never return raw secret values; only counts/booleans are exposed.

## Important Tradeoff

- Jobs are stored in the persistence API backend (memory/D1) and mirrored to local cache for fast UI rendering.
- The browser cache is treated as a client-side mirror, not the source of truth.
- Clearing browser storage no longer removes persisted jobs; they are restored from the API on refresh.

## Persistence API (D1-ready)

RoleLens now includes DB persistence APIs that use the same storage layer as `/api/persistence/*`.

Primary endpoints:

- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id`

Compatibility endpoints:

- `GET /api/persistence/jobs`
- `POST /api/persistence/jobs`
- `GET /api/persistence/jobs/:id`
- `PATCH /api/persistence/jobs/:id`

Required request headers:

- `x-rolelens-user` (required user scope)
- `x-rolelens-device` (recommended device id)

Optional hardening:

- `PERSISTENCE_POC_TOKEN` (if set, requires `Authorization: Bearer <token>`)

Backend selection (optional):

- `PERSISTENCE_BACKEND` (`memory`/`d1`, default: `memory`)
- `PERSISTENCE_D1_BINDING` (default: `DB`)

Design and planning docs:

- `docs/product/rolelens-persistence-requirements.md`
- `docs/decisions/persistent-storage-architecture.md`
- `docs/decisions/d1-schema-conventions.md`
- `docs/product/rolelens-multidevice-journey.md`

## Data Reliability Improvements (Issue #3)

RoleLens now prioritizes trustworthy local data behavior:

1. Empty-first initialization:

- no automatic sample posting injection
- first run initializes storage with []

2. Corruption recovery:

- malformed/non-array localStorage payloads are repaired to []

3. Freshness updates:

- save/status/note/follow-up/sync mutations emit update events
- Jobs/Dashboard views refresh from latest local data without browser reload

4. Sync observability:

- last sync timestamp
- source-level success/failure counts
- source-level error text and recovery guidance

Issue #3 docs:

- `docs/product/rolelens-data-reliability-requirements.md`
- `docs/decisions/local-storage-initialization-policy.md`
- `docs/product/rolelens-data-reliability-journey.md`

## Local Development

```bash
nvm use
npm install
cp .env.example .env.local

# 기본(localStorage/memory 중심)
npm run dev

# 로컬에서 D1까지 함께 쓰는 모드 (Cloudflare runtime)
npm run dev:cloudflare
```

Open `http://localhost:3000`.

If `3000` is already in use, Next.js may start on `3001` (or another port). Use the URL shown in the terminal.

Local diagnostics check:

```bash
curl -s "http://localhost:3000/api/jobs/import" | jq '{sourceCount, diagnostics, errors}'
```

If development cache/runtime gets unstable (for example ENOENT under `.next/static/development`):

```bash
pkill -f "next dev" || true
rm -rf .next
nvm use
npm run dev
```

## Scripts

- `npm run dev` - local dev (memory fallback)
- `npm run dev:cloudflare` - build and preview the Cloudflare Worker runtime with local D1
- `npm run build` - production build
- `npm run lint` - lint
- `npm run test` - unit tests (cron security, persistence PoC, local data reliability)
- `npm run verify` - lint + tests
- `npm run cf:build` - build the OpenNext Worker output
- `npm run cf:deploy` - deploy a previously built Worker output
- `npm run preview` - build and preview the Worker locally
- `npm run deploy` - build and deploy the Worker
- `npm run db:schema:local` - apply database schema changes locally
- `npm run db:schema:preview` - apply database schema changes to preview D1
- `npm run db:schema:prod` - apply database schema changes to production D1

## Cloudflare Workers Deployment

Workflow: `.github/workflows/deploy-cloudflare.yml`

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ROLELENS_CRON_SECRET` (for the scheduled feed workflow)

Required GitHub repository variable:

- `ROLELENS_PRODUCTION_URL` (the deployed Worker base URL)

Required Cloudflare Worker secrets:

- `AUTH_PASSWORD_PEPPER`
- `CRON_SECRET`
- `SYNC_ADMIN_EMAILS`

The Worker name and D1 bindings are defined in `wrangler.toml`. Run `npm run deploy` for a manual deployment, or merge to `main` to run the deployment workflow.

## D1 Persistence Setup

1. Create/update D1 binding in `wrangler.toml` (`binding = "DB"`).
2. Run `npm run db:schema:prod` before first production deploy (or when schema changes).

## Project Structure

```text
app/
  page.tsx                # list page (client-driven)
  jobs/new/page.tsx       # save form
  jobs/page.tsx           # detail page via ?id=
  dashboard/page.tsx      # analytics dashboard

components/
  jobs/*                  # form/table/detail clients
  dashboard/*             # chart clients
  ui/*                    # UI primitives

lib/
  local-jobs.ts           # localStorage data layer
  fit-score.ts            # score + skill extraction
  validators.ts           # zod forms
```

## Persistence Runtime Notes

`/api/persistence/*` now supports D1 via Cloudflare binding and automatically falls back to in-memory storage when D1 binding is unavailable in local `next dev`.
