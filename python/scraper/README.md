# Python Site Scraper

This scraper is intended for **site-centric crawling**: scrape multiple job-board pages, generate normalized JSON, and ingest that output into RoleLens D1 through `/api/jobs/ingest`.

## Output format

The script writes:

- `generatedAt`
- `platform` (`all` | `indeed` | `linkedin` | `saramin` | `jobkorea`)
- `sourceCount`
- `jobs[]` (normalized postings)
- `sourceResults[]`
- `errors[]`

RoleLens ingests this payload into D1. The app then reads the latest D1-ingested snapshot through `/api/jobs/import`.

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
  "source_type": "MANUAL"
}
```

`source_type` can be `LINKEDIN`, `INDEED`, `SARAMIN`, `JOBKOREA`, or `MANUAL`.

## Local run

Install dependencies first:

```bash
python3 -m pip install -r python/scraper/requirements.txt
```

Indeed note: `source_type=INDEED` now uses `python-jobspy` as the first strategy to reduce 403/Cloudflare challenge failures.

Use default site catalog:

```bash
python3 python/scraper/scrape_jobs.py \
  --output python-scraped-jobs.json
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

RoleLens no longer runs this scraper from GitHub Actions. If you run the scraper manually or from another scheduler, post the generated JSON to:

```text
POST /api/jobs/ingest
Header: x-cron-secret: $CRON_SECRET
```

For local debugging, post a generated JSON file to a local or deployed `/api/jobs/ingest` endpoint with the matching `x-cron-secret` header. The app reads the latest ingested snapshot from D1.

Then inspect the current app feed:

```bash
curl -s "http://localhost:3000/api/jobs/import" | jq '{sourceCount, diagnostics, errors, sourceResults}'
```
