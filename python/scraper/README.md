# Python Site Scraper

This scraper is now intended for **site-centric crawling**: scrape multiple job-board pages, generate normalized JSON, and feed RoleLens through `PYTHON_SCRAPED_FEED_URL`.

## Output format

The script writes:

- `generatedAt`
- `platform` (`all` | `indeed` | `linkedin` | `saramin` | `jobkorea`)
- `sourceCount`
- `jobs[]` (normalized postings)
- `sourceResults[]`
- `errors[]`

RoleLens ingests this payload from `PYTHON_SCRAPED_FEED_URL`.

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
PYTHON_SCRAPED_FEED_URL=https://raw.githubusercontent.com/<owner>/<repo>/main/data/scraped/python-scraped-jobs.json
PYTHON_SCRAPED_SOURCE_LABEL=Python Scraper
PYTHON_SCRAPED_SOURCE_TYPE=MANUAL
```

Then refresh:

```bash
curl -s "http://localhost:3000/api/jobs/import?refresh=1" | jq '{sourceCount, diagnostics, errors, sourceResults}'
```

## GitHub Actions

Use `.github/workflows/python-scrape-now.yml` (`workflow_dispatch`):

- `sources_file` defaults to `python/scraper/sources.sites.json`
- `source_urls` is optional and merged with the file
- `timeout_seconds` / `limit_per_source` tune run behavior
- `platform` can scope runs to `all`, `indeed`, `linkedin`, `saramin`, or `jobkorea`
- `commit_changes=true` commits updated JSON snapshot
