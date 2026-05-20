#!/usr/bin/env python3
from __future__ import annotations

import sys

from scrape_jobs import main


if __name__ == "__main__":
    raise SystemExit(main(["--platform", "jobkorea", *sys.argv[1:]]))
