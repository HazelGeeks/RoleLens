"""Offline tests for explicitly paused sources and source health reporting."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scrape_jobs import build_output_payload, load_sources, scrape_source


class PausedSourceTests(unittest.TestCase):
    def test_paused_source_does_not_send_requests_or_report_success(self):
        source = {
            "name": "Wanted Frontend Search",
            "url": "https://www.wanted.co.kr/search?query=frontend",
            "source_type": "MANUAL",
            "enabled": False,
            "disabled_reason": "Waiting for an authorized API connection.",
        }
        with patch("scrape_jobs.urlopen") as request:
            jobs, result, error = scrape_source(source, 20, 150)
        request.assert_not_called()
        self.assertEqual(jobs, [])
        self.assertFalse(result["ok"])
        self.assertTrue(result["disabled"])
        self.assertEqual(result["message"], source["disabled_reason"])
        self.assertIsNone(error)

    def test_catalog_keeps_existing_sources_enabled_by_default(self):
        with TemporaryDirectory() as directory:
            file = Path(directory) / "sources.json"
            file.write_text(json.dumps([
                {"name": "Active", "url": "https://example.test/jobs"},
                {"name": "Paused", "url": "https://example.test/paused", "enabled": False},
            ]))
            active, paused = load_sources(file, [])
        self.assertTrue(active["enabled"])
        self.assertFalse(paused["enabled"])

    def test_source_count_excludes_paused_sources_but_retains_diagnostics(self):
        results = [
            {"source": "Active", "ok": True, "importedJobs": 1},
            {"source": "Failed", "ok": False, "importedJobs": 0},
            {"source": "Paused", "ok": False, "disabled": True, "importedJobs": 0},
        ]
        payload = build_output_payload([], results, [], "all")
        self.assertEqual(payload["sourceCount"], 2)
        self.assertEqual(len(payload["sourceResults"]), 3)

    def test_wanted_catalog_is_paused_until_authorized_integration_is_available(self):
        sources = load_sources(Path(__file__).with_name("sources.sites.json"), [])
        wanted = [source for source in sources if source["company"] == "Wanted"]
        self.assertEqual(len(wanted), 4)
        self.assertTrue(all(not source["enabled"] for source in wanted))
        self.assertTrue(any(source["enabled"] for source in sources))


if __name__ == "__main__":
    unittest.main()
