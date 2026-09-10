# RoleLens MVP

RoleLens builds a one-page resume from saved personal details, career history, projects, education, and skills, alongside a job tracking workspace.

Production is configured for **Cloudflare Workers** through the OpenNext adapter.

## Current Architecture

- Next.js 16 + App Router
- TypeScript + Tailwind CSS
- Cloudflare Workers + OpenNext
- Hazel Co. Supabase Postgres through Cloudflare Hyperdrive
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
7. Login / Sign-up with server-side session auth (Supabase Postgres in Cloudflare runtime, memory fallback locally)

## Resume and Cover Letter builders

- `/resume` edits structured profile data and generates a basic A4 one-page preview.
- `/cover-letter` edits sender, recipient, application details and letter text with an A4 one-page preview.
- Save up to **5 resumes and 5 cover letters per account**. Give each version a name, create a blank document, duplicate an existing draft, switch documents, or delete one to free a slot. Document names are for organization and are not printed.
- `GET /api/documents?kind=resume|cover-letter` lists documents; `PUT/DELETE /api/documents` saves or deletes by ID and expected version. Production uses Postgres; local memory storage is lost on server restart. The original `/api/resume` endpoint remains compatible with the migrated primary resume.
- Database slot constraints enforce each five-document limit even under concurrent requests. Every operation is scoped to the authenticated account.
- Saves are explicit. Unsaved changes remain in the editor on failures; concurrent changes are rejected with a version conflict.
- Print / Save PDF uses the browser print dialog. Use A4, 100% scale, no margins, and disable browser headers/footers. Printing is disabled when content exceeds one page; shorten highlights without losing the ability to save the full profile.
- The final resume template is pending. Profile data is stored separately from the presentation.
- Apply `supabase/migrations/20260910000000_resume_profiles.sql`, then `supabase/migrations/20260910010000_application_documents.sql` after the existing migrations before deploying. The second migration copies existing resumes, preserving their versions; the old table remains available for recovery. Deploy scripts do not apply migrations.
- Goal and Interview functionality and APIs are retired. Old page URLs redirect to Resume. Existing goal tables and browser interview drafts are retained for recovery; no destructive migration is included.
- Older resume text drafts remain in browser storage and appear read-only under Previous resume draft for manual copying.

## Stable Feed Storage

RoleLens uses Supabase Postgres as the canonical feed snapshot store:

1. The `Daily Feed Sync` GitHub Actions workflow runs the Python scraper and POSTs normalized JSON to `/api/jobs/ingest`
2. Browser-triggered `/api/jobs/sync` fetches `PYTHON_SCRAPED_FEED_URL` when configured and stores the latest snapshot in Postgres (`feed_import_snapshots`)
3. `/api/jobs/import` reads the latest snapshot from Postgres
4. Client sync merges imported postings into local storage while preserving status/notes/follow-up

### Feed Source Environment Variables

Feed ingestion:

- `PYTHON_SCRAPED_FEED_URL` (optional; JSON snapshot URL fetched by `/api/jobs/sync` before Postgres is read)
- `CRON_SECRET` (required; `/api/jobs/cron` rejects all calls without `x-cron-secret`)
- `SYNC_ADMIN_SECRET` (optional; protects manual import refresh via `x-rolelens-sync-secret`, falls back to `CRON_SECRET` when unset)
- `SYNC_ADMIN_EMAILS` (required for browser-triggered manual sync in production; comma-separated admin account emails; `SYNC_ADMIN_EMAIL` is also accepted for one admin)
- `IMPORT_PUBLIC_RATE_LIMIT_PER_MIN` (optional; default `60`, anonymous import-route request budget per IP)

GitHub Actions feed sync:

- `ROLELENS_CRON_SECRET` (required repository secret; must match the deployed Cloudflare `CRON_SECRET`)
- `ROLELENS_PRODUCTION_URL` (required repository variable; the canonical Worker base URL)
  - The scheduled workflow uses this target exclusively. The legacy `ROLELENS_SYNC_URL` secret is ignored.

Auth security:

- `AUTH_PASSWORD_PEPPER` (required in production; added to password hashing material before DB storage)
  - Set as `AUTH_PASSWORD_PEPPER=<long-random-value>` (example generation: `openssl rand -base64 48`)
  - In non-production local dev, if omitted, RoleLens uses a development fallback pepper and logs a warning.
- `AUTH_BACKEND` (optional override: `memory`/`postgres`; production uses `postgres`)

### Password Reset and Data Migration

Before deploying this version, apply both Supabase migrations in order, including
`supabase/migrations/20260904233000_auth_recovery_and_job_metadata.sql`.
The new migration adds `persistent_jobs.meta_json` and `auth_password_reset_tokens`.
The deploy scripts do not apply database migrations automatically. If the initial
migration is already applied, run only the new migration before deploying the app.

Password reset now has two separate endpoints:

- `POST /api/auth/request-password-reset` accepts `{ "email": "..." }` and emails a link.
- `POST /api/auth/reset-password` accepts `{ "token": "...", "password": "..." }`.
  Email/password-only requests are rejected.

Recovery tokens expire in 15 minutes, are stored only as hashes, and can be redeemed
once. Redemption and session revocation happen atomically in Postgres. Requests for
the same account are limited to one email per minute. The request response does not
reveal whether the account exists. A failed delivery invalidates the new token.

Email recovery is optional and disabled until delivery is configured. Without a sender
domain, the recovery screen displays an unavailable message and disables new email
requests. The old email/password-only reset remains blocked. Other features do not
require an email provider. Resend is not used by this integration.

Email setup (only when enabling recovery):

1. Onboard the sender domain to Cloudflare Email Sending.
2. Set `AUTH_EMAIL_FROM` to an address on that verified domain.
3. Set `AUTH_PUBLIC_URL` to the public HTTPS origin of RoleLens.
4. Uncomment the optional `AUTH_EMAIL` send-email binding in `wrangler.toml` and deploy.

See the [Cloudflare Workers email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).
Without valid delivery configuration, requests fail closed with HTTP 503. No recovery
token is returned by the API or written to application logs. Tests mock delivery;
production mail delivery must be verified with a controlled inbox after setup.

Browser job caches now use `rolelens.jobs.v2:account:<user-id>` and a separate
`rolelens.jobs.v2:guest` key. Logout switches away from the account cache; it does not
turn account records into guest records. In-flight requests cannot write to another
account after a session switch. New guest drafts are transferred once after a
successful account sync.

The old `rolelens.jobs.v1` shared cache is retained without modification. Only records
whose persistent IDs are confirmed by the signed-in account's API response are
recovered automatically. Ambiguous records remain in the old key for manual recovery;
they are never silently assigned to the next account. Already-lost descriptions or
notes cannot be reconstructed unless an old browser cache still contains them.

Job metadata (description, salary, source, work type, skills, score, publication date,
and status history) and initial notes now persist in the database. Existing owned
records are backfilled from their local cache when metadata is missing. Legacy notes
are imported idempotently. Clearing optional update fields uses explicit `null`;
omitting a field leaves its value unchanged. Failed edits preserve drafts and show an
error with an explicit retry action, including version conflicts.

### Postgres Feed Refresh

The app does not run Python inside Cloudflare Workers. Instead, `.github/workflows/daily-feed-sync.yml` runs the Python scraper on a schedule, uploads the generated JSON as a short-lived artifact, POSTs it to `/api/jobs/ingest`, then calls `/api/jobs/cron` to warm the cache from the new Postgres snapshot.

`PYTHON_SCRAPED_FEED_URL` remains available for debugging or alternate external schedulers, but the default production automation path is the scheduled GitHub Actions scrape-and-ingest workflow.

`POST /api/jobs/sync` refreshes Postgres from `PYTHON_SCRAPED_FEED_URL` when configured, then returns the latest Postgres snapshot:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-rolelens-sync-secret: $SYNC_ADMIN_SECRET" \
  --data '{"platform":"all"}' \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/sync/"
```

`POST /api/jobs/ingest` accepts a normalized feed snapshot and stores it in Postgres:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "content-type: application/json" \
  --header "x-cron-secret: $CRON_SECRET" \
  --data-binary "@feed-snapshot.json" \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/ingest/"
```

`POST /api/jobs/cron` refreshes the edge cache from the latest Postgres snapshot:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  "${ROLELENS_PRODUCTION_URL%/}/api/jobs/cron/"
```

On the app list screen, `Sync All Feeds` calls `/api/jobs/sync`, which refreshes Postgres from `PYTHON_SCRAPED_FEED_URL` when configured and then merges the resulting snapshot into the browser workspace. Platform-scoped sync buttons (`Sync Indeed`, `Sync LinkedIn`, `Sync Saramin`, `Sync JobKorea`) use the same refreshed snapshot filtered by platform. In production, browser-triggered manual sync requires the signed-in account email to be listed in `SYNC_ADMIN_EMAILS`; cron/secret-triggered sync still uses `CRON_SECRET` or `SYNC_ADMIN_SECRET`.

### Troubleshooting Feed Source Configuration

If you see "No valid feed source is configured", run this checklist:

1. Confirm the Supabase migration is applied and `feed_import_snapshots` exists.
2. Confirm the `Daily Feed Sync` workflow has `ROLELENS_CRON_SECRET` and can POST to `/api/jobs/ingest`.
3. Confirm `ROLELENS_CRON_SECRET` matches the deployed Cloudflare `CRON_SECRET`.
4. If `PYTHON_SCRAPED_FEED_URL` is intentionally configured, call `POST /api/jobs/sync` and verify it returns `refreshed: true`.
5. Open Jobs page and run `Sync All Feeds` (or a platform-specific sync button) again.

Notes:

- Do not use comma-only or whitespace-only values (for example: `, ,`).
- API diagnostics never return raw secret values; only counts/booleans are exposed.

## Important Tradeoff

- Jobs are stored in the persistence API backend (memory/Postgres) and mirrored to local cache for fast UI rendering.
- The browser cache is treated as a client-side mirror, not the source of truth.
- Clearing browser storage no longer removes persisted jobs; they are restored from the API on refresh.

## Persistence API

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

- `PERSISTENCE_BACKEND` (`memory`/`postgres`; production uses `postgres`)
- `PERSISTENCE_DATABASE_BINDING` (production default: `HYPERDRIVE`)
- `DATABASE_URL` (local development only; never configure this as a production Worker variable)

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

# 로컬에서 Worker 런타임을 미리 보는 모드
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

## Local login and shared Supabase data

`npm run dev` and `npm run preview` run locally. They do not automatically fetch
the production Hyperdrive credentials or Worker secrets. The checked-in
`localConnectionString` is a build placeholder pointing at `127.0.0.1:5432`; it
is not the Supabase connection. Without a running database there, login fails.

To use existing Supabase accounts with `npm run dev`, set these in `.env.local`:

- `DATABASE_URL`: the Postgres connection string for that Supabase database and the configured app database role (not a Supabase HTTP URL or API key). Include the provider-required TLS settings.
- `AUTH_PASSWORD_PEPPER`: the same value used by the deployed Worker for those accounts. A different pepper makes existing passwords and sessions fail verification.
- `AUTH_BACKEND=postgres` and `PERSISTENCE_BACKEND=postgres`.

Restart the dev server after changing configuration. An explicit `DATABASE_URL`
takes precedence over the emulated binding only outside production. Production
continues to use Hyperdrive.

For `npm run preview`, provide the database URL through the shell environment
variable `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` before starting
the command, and provide the matching pepper in the local Worker secrets
(`.dev.vars`). `DATABASE_URL` alone does not configure production-mode Worker
preview. Never commit either file or put real credentials in `wrangler.toml`.

Deployed preview versions share the database only when their Hyperdrive binding
points to the same database; a separately configured Worker environment can use a
different binding. The repository currently defines one top-level Hyperdrive
binding and no separate staging environment. Sharing the database also shares
account and resume edits; localhost sessions still use their own cookies.

For an isolated in-memory test, explicitly set both backend values to `memory`.
Production accounts do not exist in that memory store, and restarting clears it.
A configured but unreachable database does not silently switch to memory.

See [Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)
and [OpenNext environment variables](https://opennext.js.org/cloudflare/howtos/env-vars).

## Scripts

- `npm run dev` - Next.js local development (configure DATABASE_URL for shared Postgres)
- `npm run dev:cloudflare` - build and preview the Cloudflare Worker runtime
- `npm run build` - production build
- `npm run lint` - lint
- `npm run test` - unit tests (cron security, persistence PoC, local data reliability)
- `npm run verify` - lint + tests
- `npm run cf:build` - build the OpenNext Worker output
- `npm run cf:deploy` - deploy a previously built Worker output
- `npm run preview` - build and preview the Worker locally
- `npm run deploy` - build and deploy the Worker

## Cloudflare Workers Deployment

Workflow: `.github/workflows/deploy-cloudflare.yml`

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN` (must authorize Worker deployment and Hyperdrive access in the Hazel Co. account)
- `ROLELENS_CRON_SECRET` (for the scheduled feed workflow)

Required GitHub repository variable:

- `ROLELENS_PRODUCTION_URL` (the deployed Worker base URL)

Required Cloudflare Worker secrets:

- `AUTH_PASSWORD_PEPPER`
- `CRON_SECRET`

Optional Cloudflare Worker secret:

- `SYNC_ADMIN_EMAILS` (allows listed users to trigger manual admin sync)

The Worker name and Hyperdrive binding are defined in `wrangler.toml`. Run `npm run deploy` for a manual deployment, or merge to `main` to run the deployment workflow.

The canonical application is **https://rolelens.hazelgeeks.workers.dev**, in the
**Hazel Co.** account pinned by `account_id` in `wrangler.toml`. The similarly named
`rolelens.hazel-labs.workers.dev` is the legacy D1 application in another account.
Do not use it for Supabase deployment or scheduled ingestion.

GitHub deployment reads the account from `wrangler.toml`; its Cloudflare API token
must have access to that account. Both deployment and scheduled ingestion use the
`ROLELENS_PRODUCTION_URL` variable, and the scheduled job uses
`ROLELENS_CRON_SECRET` matching the canonical Worker's `CRON_SECRET`. Legacy
`CLOUDFLARE_ACCOUNT_ID` and `ROLELENS_SYNC_URL` GitHub secrets no longer select targets.
The admin-email setting is optional for deployment; without it, manual admin sync
remains restricted while the authenticated scheduled job continues to work.

## Supabase Postgres Setup

1. Apply `supabase/migrations/20260903190000_rolelens_initial.sql` in the Hazel Co. Supabase project.
2. Create a least-privilege database user for RoleLens.
3. Create Cloudflare Hyperdrive from Supabase's direct Postgres connection and bind it as `HYPERDRIVE`.
4. Replace the placeholder Hyperdrive ID in `wrangler.toml`, restore Worker secrets, and deploy.
5. Follow `docs/decisions/supabase-postgres-migration.md` for data validation and cutover.

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

`/api/persistence/*` uses Supabase Postgres through the Cloudflare `HYPERDRIVE` binding and automatically falls back to in-memory storage when the binding or local `DATABASE_URL` is unavailable outside production.
