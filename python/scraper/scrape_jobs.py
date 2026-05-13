#!/usr/bin/env python3
"""Site-centric job scraping utility for RoleLens.

This script scrapes job-like links from job boards or careers pages and writes a
normalized JSON payload that RoleLens can ingest via `PYTHON_SCRAPED_FEED_URL`.
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
from urllib.parse import urljoin, urlparse
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
WHITESPACE_RE = re.compile(r"\s+")
ALLOWED_SOURCES = {"LINKEDIN", "INDEED", "COMPANY_SITE", "MANUAL"}


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


def slugify(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = lowered.strip("-")
    return lowered or "source"


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

            source_type = clean_text(str(entry.get("source_type", "COMPANY_SITE"))).upper()
            if source_type not in ALLOWED_SOURCES:
                source_type = "COMPANY_SITE"

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
                "source_type": "COMPANY_SITE",
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

    if len(normalized_title) < 2:
        return False

    return bool(
        ROLE_HINT_RE.search(normalized_title) or JOB_HINT_RE.search(searchable_href)
    )


def scrape_source(source: dict[str, str], timeout_seconds: int, limit_per_source: int) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, str] | None]:
    label = f"PythonScraper:{source['name']}"

    request = Request(
        source["url"],
        headers={
            "user-agent": "RoleLensPythonScraper/1.0 (+https://rolelens.pages.dev)",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read().decode(charset, errors="ignore")
    except Exception as exc:  # pragma: no cover - network/runtime dependent
        message = f"Scrape request failed: {exc}"
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

        jobs.append(
            {
                "externalId": f"py:{source_slug}:{digest}",
                "source": source["source_type"],
                "sourceLabel": label,
                "sourceUrl": absolute_url,
                "company": source["company"],
                "title": title,
                "descriptionRaw": f"Scraped link from {source['url']}",
                "publishedAt": now_iso,
                "tags": ["python-scraper", source_slug],
            }
        )

    return jobs, {"source": label, "ok": True, "importedJobs": len(jobs)}, None


def build_output_payload(
    jobs: list[dict[str, Any]],
    source_results: list[dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceCount": len(source_results),
        "jobs": jobs,
        "sourceResults": source_results,
        "errors": errors,
    }


def parse_args() -> argparse.Namespace:
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
        default="data/scraped/python-scraped-jobs.json",
        help="Output JSON path consumed by RoleLens via PYTHON_SCRAPED_FEED_URL.",
    )
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout per source.")
    parser.add_argument(
        "--limit-per-source",
        type=int,
        default=150,
        help="Maximum scraped links to keep per source.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

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

    payload = build_output_payload(all_jobs, source_results, errors)

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
