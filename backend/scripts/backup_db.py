r"""Safe online SQLite database backup utility for FINORA.

Uses SQLite's built-in online backup API so backups remain consistent even
while the FastAPI server is running.

Usage:
    .\venv\Scripts\python.exe scripts\backup_db.py
"""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB = BACKEND_DIR / "finora.db"
BACKUP_DIR = BACKEND_DIR / "backups"


def create_online_backup(
    source_db: Path = DEFAULT_DB,
    backup_dir: Path = BACKUP_DIR,
) -> Path:
    if not source_db.is_file():
        raise FileNotFoundError(f"Source database not found: {source_db}")

    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest_path = backup_dir / f"finora-backup-{stamp}.db"

    src_conn = sqlite3.connect(f"file:{source_db}?mode=ro", uri=True, timeout=10.0)
    dst_conn = sqlite3.connect(dest_path, timeout=10.0)
    try:
        src_conn.backup(dst_conn)
        integrity = dst_conn.execute("PRAGMA integrity_check;").fetchone()
        if not integrity or integrity[0] != "ok":
            raise RuntimeError(f"Backup integrity check failed: {integrity}")
    finally:
        dst_conn.close()
        src_conn.close()

    return dest_path


def main() -> int:
    try:
        backup_file = create_online_backup()
        print(f"Verified SQLite backup created at: {backup_file}")
        return 0
    except Exception as exc:
        print(f"Backup failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
