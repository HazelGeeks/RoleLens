# Python Site Scraper

This scraper is intended for **site-centric crawling**: scrape multiple job-board pages, generate normalized JSON, and ingest that output into RoleLens Supabase Postgres through `/api/jobs/ingest`.

## Output format

The script writes:

- `generatedAt`
- `platform` (`all` | `indeed` | `linkedin` | `saramin` | `jobkorea`)
- `sourceCount`
- `jobs[]` (normalized postings)
- `sourceResults[]`
- `errors[]`

RoleLens ingests this payload into Supabase Postgres. The app then reads the latest stored snapshot through `/api/jobs/import`.

## Source catalogs

- Default catalog: `python/scraper/sources.sites.json` (curated KR + global job-site sources)
- Example catalog: `python/scraper/sources.example.json`
- Current default keyword families in `sources.sites.json`: `frontend`, `backend`, `software engineer`, and `blockchain` (plus site-specific developer feeds)

Each source entry uses:

```json
{
  "name": "Wanted Frontend Search",
  "url": "https://www.wanted.co.kr/search?query=...",
  "company": "Wanted",
  "source_type": "MANUAL",
  "optional": false
}
```

`source_type` can be `LINKEDIN`, `INDEED`, `SARAMIN`, `JOBKOREA`, or `MANUAL`.
Set `optional` to `true` for opportunistic sources that are useful when available but should not surface a user-facing partial-sync warning when the site blocks crawler requests.

Set `enabled` to `false` with a `disabled_reason` to pause a source entirely.
Paused sources make no network requests, are excluded from the active `sourceCount`,
and remain in `sourceResults` with `disabled: true` and `ok: false`. The app displays
them as **Paused**, rather than success or a collection failure.

Wanted searches are currently paused because the search pages reject crawler
requests with HTTP 403. Re-enable them only after an authorized integration is
available; [Wanted OpenAPI](https://openapi.wanted.jobs/) requires a separately
issued key. No key or additional service is required while Wanted is paused.

Run the offline source-control tests with:

```bash
python3 -m unittest discover -s python/scraper -p 'test_*.py'
```

## Local run

Install dependencies first:

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r python/scraper/requirements.txt
```

Indeed note: `source_type=INDEED` now uses `python-jobspy` as the first strategy to reduce 403/Cloudflare challenge failures.
Run the scraper from an environment where `python-jobspy` is installed; otherwise Indeed falls back to direct page requests, which are commonly blocked with 403.

Use default site catalog:

```bash
python3 python/scraper/scrape_jobs.py \
  --output python-scraped-jobs.json
```

Verify the generated snapshot before ingesting it:

```bash
jq '{sourceCount, jobs: (.jobs | length), errors, failed: [.sourceResults[] | select(.ok == false)]}' python-scraped-jobs.json
```

Add ad-hoc sources on top of catalog:

```bash
python3 python/scraper/scrape_jobs.py \
  --source-urls "https://www.example.com/jobs,https://jobs.example.org/openings" \
  --output python-scraped-jobs.json
```

Use custom catalog file:

```bash
python3 python/scraper/scrape_jobs.py \
  --sources-file python/scraper/sources.example.json \
  --output python-scraped-jobs.json
```

Run one platform only:

```bash
python3 python/scraper/scrape_jobs.py --platform indeed
python3 python/scraper/scrape_jobs.py --platform linkedin
python3 python/scraper/scrape_jobs.py --platform saramin
python3 python/scraper/scrape_jobs.py --platform jobkorea
```

Platform wrapper scripts:

```bash
python3 python/scraper/scrape_indeed.py
python3 python/scraper/scrape_linkedin.py
python3 python/scraper/scrape_saramin.py
python3 python/scraper/scrape_jobkorea.py
```

## Connect to RoleLens import

RoleLens runs this scraper from the `Daily Feed Sync` GitHub Actions workflow. The workflow generates `python-scraped-jobs.json`, uploads it as a short-lived artifact, posts it to `/api/jobs/ingest`, then calls `/api/jobs/cron` to warm the edge cache from the latest Supabase Postgres snapshot.

The workflow uses only the `ROLELENS_PRODUCTION_URL` repository variable for its
target. The legacy `ROLELENS_SYNC_URL` secret is ignored to prevent refreshing a
different application. The final check requires the same collection timestamp
and a `postgres` response, so writing to an old D1 app cannot pass as a successful refresh.

For local debugging or another scheduler, post the generated JSON to:

```text
POST /api/jobs/ingest
Header: x-cron-secret: $CRON_SECRET
```

For local debugging, post a generated JSON file to a local or deployed `/api/jobs/ingest` endpoint with the matching `x-cron-secret` header. The app reads the latest ingested snapshot from Supabase Postgres.

Then inspect the current app feed:

```bash
curl -s "http://localhost:3000/api/jobs/import" | jq '{sourceCount, diagnostics, errors, sourceResults}'
```
