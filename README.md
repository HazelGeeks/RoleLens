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
2. Stable source sync (authoritative ATS APIs + optional RSS fallback)
3. List page with search/filter/sort
4. Detail page with notes and status updates
5. Dashboard analytics (skills/source/remote/seniority)
6. Status tracking pipeline:
   - `SAVED`
   - `REVIEWING`
   - `READY_TO_APPLY`
   - `APPLIED`
   - `INTERVIEW`
   - `REJECTED`
   - `CLOSED`

## Stable Daily Automation (Option 1)

RoleLens now supports a non-scraping automation path:

1. Prefer authoritative ATS sources (Greenhouse/Lever)
2. Optionally add RSS/Atom feeds as fallback
3. Trigger daily refresh via `/api/jobs/cron`
4. Client merges imported postings into local storage while preserving status/notes/follow-up

### Feed Source Environment Variables

Recommended (authoritative):

- `GREENHOUSE_BOARD_TOKENS` (comma-separated, ex: `airbnb,datadog,stripe,coinbase,dropbox,figma,mongodb`)
- `LEVER_COMPANIES` (comma-separated, ex: `plaid,atlassian,netflix`)
- `TARGET_ROLE_KEYWORDS` (optional CSV; default targets frontend/react)
- `TARGET_LOCATION_KEYWORDS` (optional CSV; default targets Canada/Korea)

Optional RSS fallback:

- `LINKEDIN_ALERT_FEED_URL`
- `INDEED_ALERT_FEED_URL`
- `THIRD_ALERT_FEED_URL`
- `THIRD_ALERT_SOURCE_LABEL` (optional, default: `Third Source`)
- `THIRD_ALERT_SOURCE_TYPE` (optional: `COMPANY_SITE`/`LINKEDIN`/`INDEED`/`MANUAL`, default: `COMPANY_SITE`)
- `CRON_SECRET` (required; `/api/jobs/cron` rejects all calls without `x-cron-secret`)

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

On the app list screen, `Sync Sources` can be used for manual refresh.

### Canada/Korea Precision Preset

Set these for higher-precision targeting:

- `TARGET_ROLE_KEYWORDS=frontend,front-end,react,typescript,web ui`
- `TARGET_LOCATION_KEYWORDS=canada,toronto,vancouver,montreal,ottawa,korea,seoul,대한민국,한국,서울`

## Important Tradeoff

- Data is stored in browser localStorage in this mode.
- Data is device/browser specific.
- Clearing browser storage removes saved postings.

## Persistence PoC (Issue #2)

To prepare multi-device sync migration, this repository now includes a persistence PoC API.

PoC endpoints:

- `GET /api/persistence/jobs`
- `POST /api/persistence/jobs`
- `GET /api/persistence/jobs/:id`
- `PATCH /api/persistence/jobs/:id`

Required request headers:

- `x-rolelens-user` (required user scope)
- `x-rolelens-device` (recommended device id)

Optional hardening:

- `PERSISTENCE_POC_TOKEN` (if set, requires `Authorization: Bearer <token>`)

Design and planning docs:

- `docs/product/rolelens-persistence-requirements.md`
- `docs/decisions/persistent-storage-architecture.md`
- `docs/product/rolelens-multidevice-journey.md`

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - local dev
- `npm run build` - production build
- `npm run lint` - lint
- `npm run test` - unit tests (cron security + method handling)
- `npm run cf:build` - Cloudflare Pages output build
- `npm run cf:deploy` - deploy to Cloudflare Pages

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

## Next Step (if you want DB-backed production)

If you want persistent cloud DB + multi-device sync, switch to Workers/OpenNext mode again (or migrate to an Edge-compatible DB/data access strategy).
