"""Import a player CSV directly into Supabase (Python standard library only).

Example: python3 scripts/import_players_supabase.py --players data/players.csv
Add --dry-run to preview without writing to Supabase or local files.
"""

import argparse
import csv
import json
import os
from pathlib import Path
import shlex
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from import_players import (
    DATA_DIR,
    clean_name,
    get_next_import_id,
    normalize_name,
    split_player_name,
    write_single_name_players,
)


PROJECT_DIR = Path(__file__).resolve().parent.parent


def load_environment():
    """Read literal credentials; shell overrides .env.local, which overrides .env."""
    keys = {"SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL",
            "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"}
    for path in (PROJECT_DIR / ".env.local", PROJECT_DIR / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.strip().removeprefix("export ").partition("=")
            key = key.strip()
            if separator and key in keys and key not in os.environ:
                # Support plain or quoted values and trailing comments, without
                # executing shell code or loading unrelated application secrets.
                parts = shlex.split(value, comments=True)
                if len(parts) == 1 and not parts[0].startswith("$"):
                    os.environ[key] = parts[0]


class SupabaseTable:
    def __init__(self, url, key):
        parsed = urlparse(url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("SUPABASE_URL must be an http(s) project URL.")
        self.url = url.rstrip("/") + "/rest/v1/athletes"
        self.key = key

    def request(self, method="GET", params=None, rows=None):
        url = self.url + ("?" + urlencode(params) if params else "")
        headers = {"apikey": self.key, "Accept": "application/json"}
        # New secret keys go only in apikey. Legacy service-role JWTs also
        # need the Authorization header.
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        if rows is not None:
            headers.update({"Content-Type": "application/json", "Prefer": "return=minimal"})
        request = Request(url, method=method, headers=headers,
                          data=json.dumps(rows).encode() if rows is not None else None)
        try:
            with urlopen(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except HTTPError as error:
            # Do not echo request headers or server responses containing credentials.
            raise RuntimeError(
                f"Supabase returned HTTP {error.code}. Check table permissions, "
                "credentials, and column constraints."
            ) from None
        except (URLError, TimeoutError, OSError):
            raise RuntimeError("Could not reach Supabase. Check the URL and connection.") from None

    def existing(self):
        rows = []
        while True:
            page = self.request(params={
                "select": "import_id,normalized_name,display_name",
                "order": "id.asc", "offset": len(rows), "limit": 1000,
            })
            if not isinstance(page, list):
                raise RuntimeError("Supabase returned an unexpected athlete response.")
            if not page:
                return rows
            rows.extend(page)

    def insert(self, rows):
        self.request(method="POST", rows=rows)


def prepare_players(players_path, existing, sport):
    seen = {normalize_name(row.get("normalized_name") or row.get("display_name"))
            for row in existing}
    next_id = get_next_import_id(existing)
    additions, single_names = [], []
    duplicates = invalid = 0
    with players_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or "Name" not in reader.fieldnames:
            raise ValueError("Player CSV must have a Name column (Alternative positions is optional).")
        for row in reader:
            name = clean_name(row.get("Name"))
            if not name:
                invalid += 1
                continue
            parts = split_player_name(name)
            if parts is None:
                single_names.append({"Name": name, "Alternative positions": clean_name(row.get("Alternative positions"))})
                continue
            normalized = normalize_name(name)
            if normalized in seen:
                duplicates += 1
                continue
            additions.append({
                "import_id": next_id, "first_name": parts[0], "last_name": parts[1],
                "display_name": name, "normalized_name": normalized, "sport": sport,
                "is_professional": True, "is_nickname": False,
                "alternate_names": [], "needs_review": False,
            })
            seen.add(normalized)
            next_id += 1
    return additions, single_names, duplicates, invalid


def run_import(table, players_path, single_names_path, sport="Football", dry_run=False, batch_size=500):
    if batch_size < 1:
        raise ValueError("Batch size must be positive.")
    if not players_path.is_file():
        raise ValueError(f"Player CSV not found: {players_path}")
    if players_path.resolve() == single_names_path.resolve():
        raise ValueError("Single-name output must not overwrite the source CSV.")
    additions, singles, duplicates, invalid = prepare_players(players_path, table.existing(), sport)
    print(f"Found {len(additions)} new athletes; skipped {duplicates} duplicates "
          f"and {invalid} empty names; {len(singles)} single-name rows for review.")
    if dry_run:
        print("Dry run: no database or file changes.")
        for row in additions[:10]:
            print(f"  {row['import_id']}: {row['display_name']} ({row['sport']})")
        if len(additions) > 10:
            print(f"  ...and {len(additions) - 10} more.")
        return

    # Save review rows first, so a bad output path cannot fail after DB writes.
    reviewed = write_single_name_players(single_names_path, singles)
    inserted = 0
    try:
        for offset in range(0, len(additions), batch_size):
            batch = additions[offset:offset + batch_size]
            table.insert(batch)
            inserted += len(batch)
            print(f"Imported {inserted}/{len(additions)} athletes.")
    except RuntimeError as error:
        raise RuntimeError(
            f"{error} {inserted} inserts confirmed before failure. "
            "A timed-out batch may have committed; rerun to recheck existing names."
        ) from None
    print(f"Done: added {inserted} athletes to Supabase and {reviewed} single-name review entries.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=Path, required=True, help="Source CSV with a Name column")
    parser.add_argument("--single-names", type=Path, default=DATA_DIR / "single_name_players.csv")
    parser.add_argument("--sport", default="Football")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        load_environment()
        url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local, .env, or your shell.")
        if not clean_name(args.sport):
            raise ValueError("Sport cannot be empty.")
        run_import(SupabaseTable(url, key), args.players, args.single_names,
                   clean_name(args.sport), args.dry_run, args.batch_size)
    except (ValueError, OSError, RuntimeError, csv.Error) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
