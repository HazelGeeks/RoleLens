# RoleLens MVP (Pages Mode)

RoleLens is a personal frontend-job tracking app focused on manual capture, structured storage, analysis, and status tracking.

This branch is configured for **Cloudflare Pages deployment** (`rolelens.pages.dev`).

## Current Architecture (Pages-compatible)

- Next.js 15 + App Router
- TypeScript + Tailwind CSS
- Client-side local persistence (`localStorage`)
- TanStack Table + Recharts

Why this mode exists:

- Cloudflare Pages + `next-on-pages` is Edge-runtime oriented.
- To ensure stable Pages deployment, this mode avoids Node-only server runtime patterns.

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

## Stable Daily Automation

RoleLens now supports a scraping-first automation path:

1. Crawl configured job-board pages via Python workflow
2. Upload normalized JSON as a workflow artifact
3. Trigger daily refresh via `/api/jobs/cron`
4. Client merges imported postings into local storage while preserving status/notes/follow-up

### Feed Source Environment Variables

Primary (site crawling):

- `TARGET_ROLE_KEYWORDS` (optional CSV; default targets frontend/backend/software engineer/blockchain)
- `TARGET_LOCATION_KEYWORDS` (optional CSV; default targets Canada/Korea)

Korean source note:

- If a Korean job board does not provide ATS/RSS APIs, use the Python scraper workflow; scheduled runs ingest the scraper output into D1 through `/api/jobs/ingest`.

Legacy source variables (`GREENHOUSE_*`, `LEVER_*`, RSS fallback URLs) are not used in the Python-only flow.

- `CRON_SECRET` (required; `/api/jobs/cron` rejects all calls without `x-cron-secret`)
- `SYNC_ADMIN_SECRET` (optional; protects manual import refresh via `x-rolelens-sync-secret`, falls back to `CRON_SECRET` when unset)
- `SYNC_ADMIN_EMAILS` (required for browser-triggered manual sync in production; comma-separated admin account emails; `SYNC_ADMIN_EMAIL` is also accepted for one admin)
- `ALLOW_PUBLIC_FEED_REFRESH` (optional; default recommended `0` in production to block public expensive refresh calls)
- `IMPORT_PUBLIC_RATE_LIMIT_PER_MIN` (optional; default `60`, anonymous import-route request budget per IP)

Auth security:

- `AUTH_PASSWORD_PEPPER` (required in production; added to password hashing material before DB storage)
  - Set as `AUTH_PASSWORD_PEPPER=<long-random-value>` (example generation: `openssl rand -base64 48`)
  - In non-production local dev, if omitted, RoleLens uses a development fallback pepper and logs a warning.
- `AUTH_BACKEND` (optional override: `memory`/`d1`; if unset, RoleLens auto-uses D1 when the binding is available)

### Daily Cron Trigger (GitHub Actions)

Workflow file: `.github/workflows/daily-feed-sync.yml`

Required GitHub Secrets:

- `ROLELENS_CRON_SECRET` (must match Cloudflare Pages `CRON_SECRET`)
- `ROLELENS_SYNC_URL` (optional, default: `https://rolelens.pages.dev`)

Optional hardening:

1. Restrict cron route to `POST` only.
2. Use header-based auth only (`x-cron-secret`), never query-string secrets.

The cron workflow calls:

```bash
POST $ROLELENS_SYNC_URL/api/jobs/cron
Header: x-cron-secret: $ROLELENS_CRON_SECRET
```

On the app list screen, manual refresh supports `Sync All Feeds` plus platform-scoped sync buttons (`Sync Indeed`, `Sync LinkedIn`, `Sync Saramin`, `Sync JobKorea`). In production, browser-triggered manual sync requires the signed-in account email to be listed in `SYNC_ADMIN_EMAILS`; cron/secret-triggered sync still uses `CRON_SECRET` or `SYNC_ADMIN_SECRET`.

Production hardening default: keep `ALLOW_PUBLIC_FEED_REFRESH=0`. In that mode, public users can read cached `/api/jobs/import` snapshots, but expensive refresh calls (`refresh=1` or `platform=...`) require `x-rolelens-sync-secret` (or `x-cron-secret`) from a trusted server workflow.

### Python Scrape Trigger (GitHub Actions)

Workflow file: `.github/workflows/python-scrape-now.yml`

Purpose:

1. Trigger **job-site crawling** manually (`workflow_dispatch`) or daily (`schedule`, 00:00 UTC)
2. Use a default site catalog (`python/scraper/sources.sites.json`) and optionally merge ad-hoc URLs
3. Generate normalized JSON at a temporary runner path
4. POST the generated JSON to `/api/jobs/ingest` so Cloudflare D1 becomes the canonical feed snapshot

Schedule behavior:

- Scheduled runs ingest JSON into D1 and upload the JSON as a workflow artifact.
- Manual runs do the same; scraper JSON is not committed back to the repository.

To consume scraper output in RoleLens:

- Configure GitHub secret `ROLELENS_CRON_SECRET` to match Cloudflare Pages `CRON_SECRET`.
- Optionally configure `ROLELENS_SYNC_URL`; it defaults to `https://rolelens.pages.dev`.
- The app reads the latest feed snapshot from D1 via `/api/jobs/import`.

Recommended for scraping-heavy mode:

- Focus on Python source catalog + D1 ingestion.
- Start from Korean and remote-board URLs in `python/scraper/sources.sites.json`, then add/replace sources as needed.
- Use workflow input `platform` (all/indeed/linkedin/saramin/jobkorea) for platform-only refreshes.

### Troubleshooting Feed Source Configuration

If you see "No valid feed source is configured", run this checklist:

1. Confirm D1 migrations are applied and `feed_import_snapshots` exists.
2. Confirm the Python scrape workflow can call `/api/jobs/ingest` with `ROLELENS_CRON_SECRET`.
3. Call `GET /api/jobs/import` and verify it returns the latest D1-ingested snapshot.
4. Open Jobs page and run `Sync All Feeds` (or a platform-specific sync button) again.

Notes:
- Do not use comma-only or whitespace-only values (for example: `, ,`).
- API diagnostics never return raw secret values; only counts/booleans are exposed.

### Canada/Korea Precision Preset

Set these for higher-precision targeting:

- `TARGET_ROLE_KEYWORDS=frontend,front-end,react,typescript,web ui`
- `TARGET_LOCATION_KEYWORDS=canada,toronto,vancouver,montreal,ottawa,korea,seoul,대한민국,한국,서울`

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
curl -s "http://localhost:3000/api/jobs/import?refresh=1" | jq '{sourceCount, diagnostics, errors}'
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
- `npm run dev:cloudflare` - local Cloudflare Pages runtime + D1 binding (loads `.env.local` via `--env-file`)
- `npm run build` - production build
- `npm run lint` - lint
- `npm run test` - unit tests (cron security, persistence PoC, local data reliability)
- `npm run pages:build` - Cloudflare Pages output build
- `npm run pages:deploy` - deploy `.vercel/output/static` to Cloudflare Pages
- `npm run db:schema:local` - apply database schema changes locally
- `npm run db:schema:preview` - apply database schema changes to preview D1
- `npm run db:schema:prod` - apply database schema changes to production D1

## Cloudflare Pages Deployment

Workflow: `.github/workflows/deploy-cloudflare.yml`

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

Deploy target should be your Pages project, e.g. `rolelens`.

Important:

- `CLOUDFLARE_PROJECT_NAME` must match the Cloudflare Pages project name.
- If your project URL is `https://rolelens.pages.dev`, project name should be `rolelens`.

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
