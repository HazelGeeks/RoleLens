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
2. Stable source sync (Cloudflare crawler + D1 snapshot feed)
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

RoleLens supports a Cloudflare-native scraping path (no GitHub scraping workflow required):

1. Crawl configured job-board pages via `POST /api/jobs/scraped-feed/sync`
2. Store normalized snapshot in D1 (`scraped_feed_snapshots*` tables)
3. Trigger daily refresh via `POST /api/jobs/cron` (auto-crawls in D1 mode by default)
4. Client merges imported postings into local storage while preserving status/notes/follow-up

### Feed Source Environment Variables

Primary (site crawling):

- `TARGET_ROLE_KEYWORDS` (optional CSV; default targets frontend/backend/software engineer/blockchain)
- `TARGET_LOCATION_KEYWORDS` (optional CSV; default targets Canada/Korea)

Primary Python scraping feed backend:

- `PYTHON_SCRAPED_FEED_BACKEND` (`d1` recommended in Cloudflare; `url` for compatibility)
- `SCRAPED_FEED_D1_BINDING` (optional, default `DB`)
- `SCRAPED_FEED_AUTO_CRAWL` (optional, default `1`; when enabled, `/api/jobs/cron` crawls before import)
- `SCRAPED_FEED_TIMEOUT_SECONDS` (optional, default `20`)
- `SCRAPED_FEED_LIMIT_PER_SOURCE` (optional, default `120`)
- `SCRAPED_FEED_CRAWL_CONCURRENCY` (optional, default `4`, capped at `5`)
- `PYTHON_SCRAPED_SOURCE_LABEL` (optional, default: `Python Scraper`)
- `PYTHON_SCRAPED_SOURCE_TYPE` (optional: `LINKEDIN`/`INDEED`/`SARAMIN`/`JOBKOREA`/`MANUAL`, default: `MANUAL`)
- `PYTHON_SCRAPED_DEFAULT_COMPANY` (optional fallback company label)
- `PYTHON_SCRAPED_FEED_URL` (optional; used only when `PYTHON_SCRAPED_FEED_BACKEND=url`)

Korean source note:

- If a Korean job board does not provide ATS/RSS APIs, keep it in `python/scraper/sources.sites.json` and run `/api/jobs/scraped-feed/sync`.

Legacy source variables (`GREENHOUSE_*`, `LEVER_*`, RSS fallback URLs) are not used in the Python-only flow.

- `CRON_SECRET` (required; `/api/jobs/cron` rejects all calls without `x-cron-secret`)
- `SYNC_ADMIN_SECRET` (optional; protects manual import refresh via `x-rolelens-sync-secret`, falls back to `CRON_SECRET` when unset)
- `ALLOW_PUBLIC_FEED_REFRESH` (optional; default recommended `0` in production to block public expensive refresh calls)
- `IMPORT_PUBLIC_RATE_LIMIT_PER_MIN` (optional; default `60`, anonymous import-route request budget per IP)

Auth security:

- `AUTH_PASSWORD_PEPPER` (required in production; added to password hashing material before DB storage)
  - Set as `AUTH_PASSWORD_PEPPER=<long-random-value>` (example generation: `openssl rand -base64 48`)
  - In non-production local dev, if omitted, RoleLens uses a development fallback pepper and logs a warning.
- `AUTH_BACKEND` (optional override: `memory`/`d1`; if unset, RoleLens auto-uses D1 when the binding is available)

### Daily Cron Trigger (Cloudflare)

Configure a Cloudflare Cron Trigger (or any secure scheduler) to call:

```bash
POST https://rolelens.pages.dev/api/jobs/cron
Header: x-cron-secret: <CRON_SECRET>
```

Optional scoped refresh:

```bash
POST https://rolelens.pages.dev/api/jobs/cron?platform=linkedin
Header: x-cron-secret: <CRON_SECRET>
```

Optional hardening:

1. Keep cron route `POST` only.
2. Use header-based auth only (`x-cron-secret`), never query-string secrets.

On the app list screen, manual refresh supports `Sync All Feeds` plus platform-scoped sync buttons (`Sync Indeed`, `Sync LinkedIn`, `Sync Saramin`, `Sync JobKorea`).

Production hardening default: keep `ALLOW_PUBLIC_FEED_REFRESH=0`. In that mode, public users can read cached `/api/jobs/import` snapshots, but expensive refresh calls (`refresh=1` or `platform=...`) require `x-rolelens-sync-secret` (or `x-cron-secret`) from trusted server automation.

### Manual Scrape Trigger (Cloudflare)

To run crawler + D1 snapshot refresh immediately:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  --header "content-type: application/json" \
  --data '{"platform":"all"}' \
  "https://rolelens.pages.dev/api/jobs/scraped-feed/sync"
```

Then refresh import cache if needed:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  "https://rolelens.pages.dev/api/jobs/cron"
```

Compatibility mode:

- Set `PYTHON_SCRAPED_FEED_BACKEND=url`
- Set `PYTHON_SCRAPED_FEED_URL` to a hosted JSON URL

Recommended for scraping-heavy mode:

- Focus on source catalog + Cloudflare crawler + D1 snapshots.
- Start from Korean and remote-board URLs in `python/scraper/sources.sites.json`, then add/replace sources as needed.
- Use `platform` query/body option (`all`/`indeed`/`linkedin`/`saramin`/`jobkorea`) for scoped refreshes.

### Troubleshooting Feed Source Configuration

If you see "No valid feed source is configured", run this local-first checklist:

1. Local dev fallback check:
   - Open `GET /api/jobs/local-python-scraped-feed` and confirm it returns JSON.
   - This endpoint serves `data/scraped/python-scraped-jobs.json` in local development.

2. D1 primary mode check:
   - Verify `PYTHON_SCRAPED_FEED_BACKEND=d1`.
   - Call `POST /api/jobs/scraped-feed/sync` with `x-cron-secret`.
   - Call `POST /api/jobs/cron` with `x-cron-secret`.

3. Optional URL compatibility mode:
   - Set `PYTHON_SCRAPED_FEED_BACKEND=url` and `PYTHON_SCRAPED_FEED_URL` for both `Production` and `Preview`, then redeploy.
4. Call `GET /api/jobs/import?refresh=1` (or platform scope: `GET /api/jobs/import?refresh=1&platform=indeed`) and verify:
   - If `ALLOW_PUBLIC_FEED_REFRESH=0` in production, include `x-rolelens-sync-secret` (or `x-cron-secret`) for this check.
   - `diagnostics.python.configuredSourceCount > 0`
   - `sourceCount > 0`

5. Open Jobs page and run `Sync All Feeds` (or a platform-specific sync button) again.

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
npm run dev:d1
```

Open `http://localhost:3000`.

Optional URL compatibility setup in `.env.local`:

```bash
PYTHON_SCRAPED_FEED_BACKEND=url
PYTHON_SCRAPED_FEED_URL=https://example.com/python-scraped-jobs.json
```

Recommended Cloudflare-first setup in `.env.local`:

```bash
PYTHON_SCRAPED_FEED_BACKEND=d1
SCRAPED_FEED_D1_BINDING=DB
```

If `PYTHON_SCRAPED_FEED_BACKEND=url` and URL is unset in local development, RoleLens falls back to `/api/jobs/local-python-scraped-feed` automatically.

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
- `npm run dev:d1` - local Cloudflare runtime + D1 binding (loads `.env.local` via `--env-file`)
- `npm run build` - production build
- `npm run lint` - lint
- `npm run test` - unit tests (cron security, persistence PoC, local data reliability)
- `npm run cf:build` - Cloudflare Pages output build
- `npm run cf:deploy` - deploy to Cloudflare Pages
- `npm run d1:migrate:local` - apply D1 migrations locally
- `npm run d1:migrate:preview` - apply D1 migrations to preview database
- `npm run d1:migrate:prod` - apply D1 migrations to production database

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
2. Run `npm run d1:migrate:prod` before first production deploy (or when schema changes).

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
