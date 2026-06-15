#!/usr/bin/env python3
"""Site-centric job scraping utility for RoleLens.

This script scrapes job-like links from job boards or careers pages and writes a
normalized JSON payload that RoleLens can ingest into D1 via `/api/jobs/ingest`.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote_plus, urljoin, urlparse
from urllib.request import Request, urlopen

ROLE_HINT_RE = re.compile(
    r"(engineer|developer|frontend|front-end|backend|back-end|full\s*stack|software|ios|android|designer|design|data|analyst|scientist|ml|ai|devops|sre|qa|test|product|pm|intern|개발자|엔지니어|프론트엔드|백엔드|데이터|디자이너|인턴)",
    re.IGNORECASE,
)
JOB_HINT_RE = re.compile(
    r"(job|jobs|career|careers|position|opening|hiring|recruit|apply|채용|공고|모집|직무|포지션)",
    re.IGNORECASE,
)
NAV_NOISE_RE = re.compile(
    r"(login|log-in|sign[\s_-]?in|sign[\s_-]?up|join|register|privacy|terms|help|support|about|home|skip to|cookie|mypage|회원가입|로그인|이용약관|개인정보|고객센터|문의|공지|메인)",
    re.IGNORECASE,
)
URL_NOISE_RE = re.compile(
    r"(/categories/|/category/|/career-services/|/job-seekers/|/find-your-plan|/post-a-remote-job|/listing_ads/|/remote-job-rss-feed|/remote-work-hiring-guide|/top-trending-remote-jobs|[?&]utm_)",
    re.IGNORECASE,
)
WHITESPACE_RE = re.compile(r"\s+")
INLINE_WHITESPACE_RE = re.compile(r"[ \t\f\v]+")
BOARD_COMPANY_LABELS = {
    "linkedin",
    "indeed",
    "jobkorea",
    "saramin",
    "weworkremotely",
    "remoteok",
    "wanted",
    "rocketpunch",
    "remember",
    "remotive",
    "pythonscraper",
}
ALLOWED_SOURCES = {"LINKEDIN", "INDEED", "SARAMIN", "JOBKOREA", "MANUAL"}
PLATFORM_MATCHERS: dict[str, tuple[str, ...]] = {
    "all": tuple(),
    "indeed": ("indeed",),
    "linkedin": ("linkedin",),
    "saramin": ("saramin", "사람인", "jumpit.saramin", "hiring.saramin"),
    "jobkorea": ("jobkorea", "jobkorea.co.kr"),
}


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._current_href: str | None = None
        self._buffer: list[str] = []
        self.anchors: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return

        href = ""
        for key, value in attrs:
            if key.lower() == "href" and value:
                href = value.strip()
                break

        if not href:
            return

        self._current_href = href
        self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._current_href:
            return

        text = clean_text("".join(self._buffer))
        self.anchors.append((self._current_href, text))
        self._current_href = None
        self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._current_href is not None:
            self._buffer.append(data)

    def handle_entityref(self, name: str) -> None:
        if self._current_href is not None:
            self._buffer.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._current_href is not None:
            self._buffer.append(f"&#{name};")


def clean_text(value: str) -> str:
    return WHITESPACE_RE.sub(" ", unescape(value)).strip()


def clean_multiline_text(value: str) -> str:
    normalized = unescape(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [INLINE_WHITESPACE_RE.sub(" ", line).strip() for line in normalized.split("\n")]

    compacted: list[str] = []
    for line in lines:
        if line:
            compacted.append(line)
            continue

        if compacted and compacted[-1] != "":
            compacted.append("")

    return "\n".join(compacted).strip()


def slugify(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = lowered.strip("-")
    return lowered or "source"


def to_display_name_from_slug(value: str) -> str:
    chunks = [chunk for chunk in value.split("-") if chunk]
    if not chunks:
        return value
    return " ".join(chunk[0].upper() + chunk[1:] for chunk in chunks)


def normalize_company_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def is_board_company_label(value: str) -> bool:
    return normalize_company_token(value) in BOARD_COMPANY_LABELS


def infer_company_from_linkedin_url(source_url: str) -> str | None:
    match = re.search(r"/jobs/view/[^/?#]*-at-([a-z0-9-]+)-\d+", source_url, re.IGNORECASE)
    if not match:
        return None

    inferred = to_display_name_from_slug(match.group(1).lower())
    return None if is_board_company_label(inferred) else inferred


def infer_company_from_title(title: str) -> str | None:
    at_match = re.search(r"\bat\s+([^|,·•]+)$", title, re.IGNORECASE)
    if at_match:
        candidate = clean_text(at_match.group(1))
        if 2 <= len(candidate) <= 80 and not is_board_company_label(candidate):
            return candidate
    return None


def infer_company(source: dict[str, str], title: str, source_url: str) -> str | None:
    if source.get("source_type") == "LINKEDIN":
        from_url = infer_company_from_linkedin_url(source_url)
        if from_url:
            return from_url

    from_title = infer_company_from_title(title)
    if from_title:
        return from_title

    return None


def parse_source_urls(raw: str | None) -> list[str]:
    if not raw:
        return []

    urls: list[str] = []
    for chunk in re.split(r"[\n,]", raw):
        candidate = chunk.strip()
        if not candidate:
            continue
        urls.append(candidate)

    return urls


def is_http_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def is_likely_job_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.lower()
    query = parsed.query.lower()
    path_and_query = f"{path}?{query}"

    if URL_NOISE_RE.search(path_and_query):
        return False

    if "linkedin.com" in host:
        return "/jobs/view/" in path
    if "indeed." in host:
        return "/viewjob" in path or "jk=" in query
    if "jobkorea.co.kr" in host:
        return "/recruit/gi_read/" in path
    if "saramin.co.kr" in host:
        return "/zf_user/jobs/relay/view" in path or "/zf_user/jobs/view" in path
    if "weworkremotely.com" in host:
        if "/remote-jobs/" not in path:
            return False
        return not path.rstrip("/").endswith("/remote-jobs")

    return True


def to_source_name_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    host = host.removeprefix("www.")
    return host or "source"


def load_sources(sources_file: Path | None, inline_urls: list[str]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []

    if sources_file and sources_file.exists():
        raw = json.loads(sources_file.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError("sources file must be a JSON array")

        for idx, entry in enumerate(raw):
            if not isinstance(entry, dict):
                raise ValueError(f"sources[{idx}] must be an object")

            name = clean_text(str(entry.get("name", "")))
            url = clean_text(str(entry.get("url", "")))
            if not name or not url:
                continue
            if not is_http_url(url):
                continue

            source_type = clean_text(str(entry.get("source_type", "MANUAL"))).upper()
            if source_type not in ALLOWED_SOURCES:
                source_type = "MANUAL"

            source: dict[str, str] = {
                "name": name,
                "url": url,
                "company": clean_text(str(entry.get("company", ""))) or name,
                "source_type": source_type,
            }
            sources.append(source)

    for url in inline_urls:
        if not is_http_url(url):
            continue
        name = to_source_name_from_url(url)
        sources.append(
            {
                "name": name,
                "url": url,
                "company": name,
                "source_type": "MANUAL",
            }
        )

    deduped: list[dict[str, str]] = []
    seen = set()
    for source in sources:
        key = source["url"].lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(source)

    return deduped


def should_keep_link(title: str, href: str) -> bool:
    if not title and not href:
        return False

    if title and len(title) > 200:
        return False

    normalized_title = title.lower()
    parsed_href = urlparse(href)
    searchable_href = f"{parsed_href.path} {parsed_href.query}".lower()

    if NAV_NOISE_RE.search(normalized_title) or NAV_NOISE_RE.search(searchable_href):
        return False
    if URL_NOISE_RE.search(searchable_href):
        return False

    if len(normalized_title) < 2:
        return False

    return bool(
        ROLE_HINT_RE.search(normalized_title) or JOB_HINT_RE.search(searchable_href)
    )



def parse_indeed_search_params(source_url: str) -> tuple[str, str]:
    parsed = urlparse(source_url)
    query = parse_qs(parsed.query)

    raw_term = query.get("q", [""])[0]
    raw_location = query.get("l", [""])[0]

    search_term = clean_text(unquote_plus(raw_term)) or "frontend engineer"
    location = clean_text(unquote_plus(raw_location)) or "Canada"
    return search_term, location


def infer_indeed_country(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower().removeprefix("www.")

    if host.startswith("ca.") or host.endswith(".ca"):
        return "canada"
    if host.startswith("uk.") or host.endswith(".co.uk"):
        return "uk"
    if host.startswith("de.") or host.endswith(".de"):
        return "germany"
    if host.startswith("fr.") or host.endswith(".fr"):
        return "france"
    if host.startswith("au.") or host.endswith(".com.au"):
        return "australia"
    if host.startswith("nz.") or host.endswith(".co.nz"):
        return "new zealand"
    return "usa"


def normalize_indeed_posted_at(value: Any) -> str:
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc).isoformat()
        return value.astimezone(dt.timezone.utc).isoformat()

    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min, tzinfo=dt.timezone.utc).isoformat()

    return dt.datetime.now(dt.timezone.utc).isoformat()


def scrape_source_with_jobspy_indeed(
    source: dict[str, str],
    limit_per_source: int,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, str] | None] | None:
    try:
        from jobspy import scrape_jobs as jobspy_scrape_jobs  # type: ignore
    except Exception:
        return None

    label = f"PythonScraper:{source['name']}"
    search_term, location = parse_indeed_search_params(source["url"])
    country_indeed = infer_indeed_country(source["url"])

    try:
        rows = jobspy_scrape_jobs(
            site_name=["indeed"],
            search_term=search_term,
            location=location,
            results_wanted=max(limit_per_source, 50),
            hours_old=168,
            country_indeed=country_indeed,
        )
    except Exception as exc:  # pragma: no cover - network/runtime dependent
        message = f"Indeed scrape via jobspy failed: {exc}"
        return (
            [],
            {"source": label, "ok": False, "importedJobs": 0, "message": message},
            {"source": label, "message": message},
        )

    source_slug = slugify(source["name"])
    jobs: list[dict[str, Any]] = []

    for entry in rows.to_dict(orient="records"):
        if len(jobs) >= limit_per_source:
            break

        title = clean_text(str(entry.get("title") or ""))
        source_url = clean_text(
            str(entry.get("job_url") or entry.get("job_url_direct") or "")
        )
        if not title or not source_url or not is_http_url(source_url):
            continue

        external_id = clean_text(str(entry.get("id") or ""))
        if not external_id:
            seed = f"{source_slug}|{source_url}|{title}"
            external_id = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]

        company = clean_text(str(entry.get("company") or ""))
        if not company or is_board_company_label(company):
            company = infer_company(source, title, source_url) or ""

        job: dict[str, Any] = {
            "externalId": f"py:{source_slug}:{external_id}",
            "source": source["source_type"],
            "sourceLabel": label,
            "sourceUrl": source_url,
            "title": title,
            "descriptionRaw": clean_multiline_text(str(entry.get("description") or ""))
            or f"Scraped via Indeed from {source['url']}",
            "publishedAt": normalize_indeed_posted_at(entry.get("date_posted")),
            "tags": ["python-scraper", source_slug, "jobspy"],
        }
        if company:
            job["company"] = company

        jobs.append(job)

    return jobs, {"source": label, "ok": True, "importedJobs": len(jobs)}, None


def scrape_source(source: dict[str, str], timeout_seconds: int, limit_per_source: int) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, str] | None]:
    label = f"PythonScraper:{source['name']}"

    if source.get("source_type") == "INDEED":
        jobspy_result = scrape_source_with_jobspy_indeed(source, limit_per_source)
        if jobspy_result is not None:
            return jobspy_result

    request = Request(
        source["url"],
        headers={
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9,ko;q=0.8",
            "cache-control": "no-cache",
        },
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read().decode(charset, errors="ignore")
    except Exception as exc:  # pragma: no cover - network/runtime dependent
        message = f"Scrape request failed: {exc}"
        if source.get("source_type") == "INDEED" and "403" in str(exc):
            message = (
                f"{message}. Indeed is blocking direct crawler requests (Cloudflare challenge). "
                "Use platform-scoped runs and refresh later, or provide an alternate feed source."
            )
        return (
            [],
            {"source": label, "ok": False, "importedJobs": 0, "message": message},
            {"source": label, "message": message},
        )

    parser = AnchorParser()
    parser.feed(html)

    jobs: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    source_slug = slugify(source["name"])

    for href, raw_title in parser.anchors:
        if len(jobs) >= limit_per_source:
            break

        href_lower = href.strip().lower()
        if href_lower.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        absolute_url = urljoin(source["url"], href)
        if not is_http_url(absolute_url):
            continue
        if not is_likely_job_url(absolute_url):
            continue

        title = clean_text(raw_title)
        if not title:
            continue
        if not should_keep_link(title, absolute_url):
            continue

        url_key = absolute_url.lower()
        if url_key in seen_urls:
            continue
        seen_urls.add(url_key)

        seed = f"{source_slug}|{absolute_url}|{title}"
        digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]

        job: dict[str, Any] = {
            "externalId": f"py:{source_slug}:{digest}",
            "source": source["source_type"],
            "sourceLabel": label,
            "sourceUrl": absolute_url,
            "title": title,
            "descriptionRaw": f"Scraped link from {source['url']}",
            "publishedAt": now_iso,
            "tags": ["python-scraper", source_slug],
        }
        inferred_company = infer_company(source, title, absolute_url)
        if inferred_company:
            job["company"] = inferred_company

        jobs.append(job)

    return jobs, {"source": label, "ok": True, "importedJobs": len(jobs)}, None


def build_output_payload(
    jobs: list[dict[str, Any]],
    source_results: list[dict[str, Any]],
    errors: list[dict[str, str]],
    platform: str,
) -> dict[str, Any]:
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "platform": platform,
        "sourceCount": len(source_results),
        "jobs": jobs,
        "sourceResults": source_results,
        "errors": errors,
    }


def source_matches_platform(source: dict[str, str], platform: str) -> bool:
    if platform == "all":
        return True

    markers = PLATFORM_MATCHERS.get(platform)
    if not markers:
        return False

    searchable = " ".join(
        [
            source.get("source_type", ""),
            source.get("name", ""),
            source.get("company", ""),
            source.get("url", ""),
        ]
    ).lower()
    return any(marker in searchable for marker in markers)


def filter_sources_by_platform(sources: list[dict[str, str]], platform: str) -> list[dict[str, str]]:
    return [source for source in sources if source_matches_platform(source, platform)]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RoleLens Python site scraper")
    parser.add_argument(
        "--sources-file",
        default="python/scraper/sources.sites.json",
        help="Path to JSON array of source objects ({name,url,company?,source_type?}).",
    )
    parser.add_argument(
        "--source-urls",
        default="",
        help="Comma/newline separated source URLs (merged with sources file).",
    )
    parser.add_argument(
        "--output",
        default="python-scraped-jobs.json",
        help="Temporary output JSON path posted to RoleLens D1 ingestion.",
    )
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout per source.")
    parser.add_argument(
        "--limit-per-source",
        type=int,
        default=150,
        help="Maximum scraped links to keep per source.",
    )
    parser.add_argument(
        "--platform",
        choices=["all", "indeed", "linkedin", "saramin", "jobkorea"],
        default="all",
        help="Limit scraping to a single platform family.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    raw_urls = args.source_urls or ""
    env_urls = parse_source_urls(raw_urls)

    sources_file = Path(args.sources_file)
    try:
        sources = load_sources(sources_file, env_urls)
    except Exception as exc:
        print(f"[error] Failed to load sources: {exc}", file=sys.stderr)
        return 2

    if not sources:
        print(
            "[error] No valid sources found. Provide --source-urls or create sources file.",
            file=sys.stderr,
        )
        return 2

    sources = filter_sources_by_platform(sources, args.platform)
    if not sources:
        print(
            f"[error] No sources matched platform={args.platform}. Update sources file and retry.",
            file=sys.stderr,
        )
        return 2

    all_jobs: list[dict[str, Any]] = []
    source_results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for source in sources:
        jobs, result, error = scrape_source(
            source=source,
            timeout_seconds=args.timeout,
            limit_per_source=args.limit_per_source,
        )
        all_jobs.extend(jobs)
        source_results.append(result)
        if error:
            errors.append(error)

    payload = build_output_payload(all_jobs, source_results, errors, args.platform)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    success_count = sum(1 for result in source_results if bool(result.get("ok")))
    if success_count == 0:
        print(
            f"[error] No source succeeded. sources={len(sources)} errors={len(errors)} -> {output_path}",
            file=sys.stderr,
        )
        return 1

    print(
        f"[ok] Scraped sources={len(sources)} jobs={len(all_jobs)} errors={len(errors)} -> {output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
