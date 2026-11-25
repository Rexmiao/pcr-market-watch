"""A JSON-over-stdin SQLite bridge for the local-only D1 adapter."""
from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import sys
import time

# The bridge protocol is always UTF-8, including Windows paths and company names.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def statement_result(connection, sql, params):
    started = time.perf_counter()
    previous = connection.total_changes
    cursor = connection.execute(sql, params)
    rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
    changes = connection.total_changes - previous
    return {"success": True, "results": rows, "meta": {
        "changes": changes,
        "last_row_id": cursor.lastrowid,
        "duration": (time.perf_counter() - started) * 1000,
        "rows_read": len(rows),
        "rows_written": changes,
        "changed_db": changes > 0,
    }}


def schema_statements(sql):
    """Use SQLite's parser to recognize statement boundaries, including quotes."""
    buffer = ""
    for character in sql:
        buffer += character
        if character == ";" and sqlite3.complete_statement(buffer):
            value = buffer.strip()
            buffer = ""
            # Drizzle uses -- statement-breakpoint comments between statements.
            leading = re.sub(r"^(?:\s|--[^\n]*(?:\n|$)|/\*.*?\*/)+", "", value, flags=re.S).lstrip()
            if leading and not re.match(r"^(CREATE|ALTER|DROP|PRAGMA)\b", leading, re.I):
                raise ValueError("Local bootstrap accepts schema-only migrations")
            if leading:
                yield value
    remainder = re.sub(r"(?:--[^\n]*(?:\n|$)|/\*.*?\*/)", "", buffer, flags=re.S).strip()
    if remainder:
        raise ValueError("Migration contains an incomplete SQL statement")


def migrate(connection, migrations):
    if not isinstance(migrations, list):
        raise ValueError("Migration list is required")
    applied = []
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute("""CREATE TABLE IF NOT EXISTS __pcr_local_migrations (
            tag TEXT PRIMARY KEY NOT NULL,
            hash TEXT NOT NULL,
            position INTEGER NOT NULL,
            applied_at TEXT NOT NULL
        )""")
        existing = {row["tag"]: row for row in connection.execute("SELECT tag, hash, position FROM __pcr_local_migrations")}
        known = {item["tag"] for item in migrations}
        if set(existing) - known:
            raise ValueError("Local database contains migrations newer than this checkout")
        for item in migrations:
            prior = existing.get(item["tag"])
            if prior:
                if prior["position"] != item["position"]:
                    raise ValueError("An applied migration was changed: " + item["tag"])
                if prior["hash"] != item["hash"]:
                    legacy = item.get("legacyHashes", [])
                    if not isinstance(legacy, list) or prior["hash"] not in legacy:
                        raise ValueError("An applied migration was changed: " + item["tag"])
                    # Only the checksum changes. Do not replay schema operations,
                    # touch user rows, or rewrite the original applied timestamp.
                    connection.execute("UPDATE __pcr_local_migrations SET hash=? WHERE tag=?", [item["hash"], item["tag"]])
                continue
            for sql in schema_statements(item["sql"]):
                connection.execute(sql)
            connection.execute("INSERT INTO __pcr_local_migrations(tag,hash,position,applied_at) VALUES(?,?,?,?)",
                               [item["tag"], item["hash"], item["position"], dt.datetime.now(dt.timezone.utc).isoformat()])
            applied.append(item["tag"])
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return {"applied": applied, "total": len(migrations)}


def main():
    incoming = sys.stdin.read(1_000_001)
    if len(incoming) > 1_000_000:
        raise ValueError("SQLite request exceeds the size limit")
    request = json.loads(incoming)
    database_path = request["databasePath"]
    if not isinstance(database_path, str) or not database_path:
        raise ValueError("A database path is required")
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=10000")
    connection.execute("PRAGMA foreign_keys=ON")
    # No WAL sidecar is left behind: each short-lived process commits and closes.
    connection.execute("PRAGMA journal_mode=DELETE")
    try:
        if request.get("action") == "migrate":
            result = migrate(connection, request.get("migrations"))
        elif request.get("action") == "statement":
            result = statement_result(connection, request["sql"], request.get("params", []))
            connection.commit()
        elif request.get("action") == "batch":
            connection.execute("BEGIN IMMEDIATE")
            try:
                result = [statement_result(connection, item["sql"], item.get("params", [])) for item in request["statements"]]
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        else:
            raise ValueError("Unknown SQLite operation")
    finally:
        connection.close()
    print(json.dumps({"success": True, "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    # Pipes on Windows can otherwise inherit a legacy code page. Paths and saved
    # watchlist labels may contain Chinese, so the bridge protocol is always UTF-8.
    sys.stdin.reconfigure(encoding="utf-8", errors="strict")
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")
    sys.stderr.reconfigure(encoding="utf-8", errors="strict")
    try:
        main()
    except Exception as error:
        print(json.dumps({"success": False, "error": {"name": type(error).__name__, "message": str(error)}}, ensure_ascii=False))
        sys.exit(1)
