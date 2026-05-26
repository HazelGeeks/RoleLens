# Python Site Scraper

This scraper is intended for **site-centric crawling**: scrape multiple job-board pages, generate normalized JSON, and feed RoleLens through D1 snapshots (or URL compatibility mode).

## Output format

The script writes:

- `generatedAt`
- `platform` (`all` | `indeed` | `linkedin` | `saramin` | `jobkorea`)
- `sourceCount`
- `jobs[]` (normalized postings)
- `sourceResults[]`
- `errors[]`

RoleLens ingests this payload from D1 (`/api/jobs/scraped-feed`) or from `PYTHON_SCRAPED_FEED_URL` in compatibility mode.

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
  --output data/scraped/python-scraped-jobs.json
```

Add ad-hoc sources on top of catalog:

```bash
python3 python/scraper/scrape_jobs.py \
  --source-urls "https://www.example.com/jobs,https://jobs.example.org/openings" \
  --output data/scraped/python-scraped-jobs.json
```

Use custom catalog file:

```bash
python3 python/scraper/scrape_jobs.py \
  --sources-file python/scraper/sources.example.json \
  --output data/scraped/python-scraped-jobs.json
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

Set in `.env.local` (or Cloudflare Pages variables):

```bash
PYTHON_SCRAPED_FEED_BACKEND=d1
SCRAPED_FEED_D1_BINDING=DB
PYTHON_SCRAPED_SOURCE_LABEL=Python Scraper
PYTHON_SCRAPED_SOURCE_TYPE=MANUAL
```

Upload scraped JSON to D1-backed feed endpoint, then refresh:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  --header "content-type: application/json" \
  --data-binary @data/scraped/python-scraped-jobs.json \
  "https://rolelens.pages.dev/api/jobs/scraped-feed"

curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  "https://rolelens.pages.dev/api/jobs/cron"

curl -s "http://localhost:3000/api/jobs/import?refresh=1" | jq '{sourceCount, diagnostics, errors, sourceResults}'
```

## Cloudflare-native trigger

Trigger scraping directly on Cloudflare:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  --header "content-type: application/json" \
  --data '{"platform":"all"}' \
  "https://rolelens.pages.dev/api/jobs/scraped-feed/sync"
```

Optional scoped run:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  --header "content-type: application/json" \
  --data '{"platform":"linkedin","limitPerSource":100}' \
  "https://rolelens.pages.dev/api/jobs/scraped-feed/sync"
```
