#!/usr/bin/env python3
"""Convert a Wrangler D1 SQL export into data-only PostgreSQL inserts."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import TextIO


TABLES = (
    "persistent_jobs",
    "persistent_job_notes",
    "persistent_job_create_requests",
    "auth_users",
    "auth_sessions",
    "persistent_goals",
    "persistent_goal_followups",
    "feed_import_snapshots",
)


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def quote_value(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bytes):
        return "decode('" + value.hex() + "', 'hex')"

    return "'" + str(value).replace("'", "''") + "'"


def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def write_postgres_inserts(connection: sqlite3.Connection, output: TextIO) -> None:
    output.write("begin;\n")
    total_rows = 0

    for table in TABLES:
        if not table_exists(connection, table):
            output.write(f"-- {table}: missing in source export\n")
            continue

        columns = [
            row[1]
            for row in connection.execute(
                f"pragma table_info({quote_identifier(table)})"
            ).fetchall()
        ]
        quoted_columns = ", ".join(quote_identifier(column) for column in columns)
        rows = connection.execute(
            f"select * from {quote_identifier(table)}"
        ).fetchall()
        output.write(f"-- {table}: {len(rows)} row(s)\n")

        for row in rows:
            values = ", ".join(quote_value(value) for value in row)
            output.write(
                f"insert into public.{quote_identifier(table)} "
                f"({quoted_columns}) values ({values}) on conflict do nothing;\n"
            )

        total_rows += len(rows)

    output.write(f"-- total: {total_rows} row(s)\n")
    output.write("commit;\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a Wrangler D1 SQL export to PostgreSQL data inserts."
    )
    parser.add_argument("input", type=Path, help="Path to the D1 SQL export")
    parser.add_argument(
        "--output",
        type=Path,
        help="Output SQL path (defaults to stdout)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_sql = args.input.read_text(encoding="utf-8")
    connection = sqlite3.connect(":memory:")

    try:
        connection.executescript(source_sql)
        if args.output:
            with args.output.open("w", encoding="utf-8", newline="\n") as output:
                write_postgres_inserts(connection, output)
        else:
            write_postgres_inserts(connection, sys.stdout)
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
