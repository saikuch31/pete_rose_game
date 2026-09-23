"""Append football players to the athlete catalog using only Python's standard library.

Run from any directory: python3 path/to/scripts/import_players.py
Uses web/data by default; --players and --athletes can override the paths.
Uses the first two whitespace-separated words for first/last names, ignoring
later words. For hyphenated surnames, uses the final part (Clinton-Dix -> Dix).
The complete display name is preserved for lookup; no aliases are generated.
"""

import argparse
import csv
from pathlib import Path


HEADERS = [
    "import_id", "first_name", "last_name", "display_name", "normalized_name",
    "sport", "is_professional", "is_nickname", "alternate_names", "needs_review",
]
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def normalize_name(name):
    return " ".join(name.split()).lower()


def import_players(players_path, athletes_path):
    with athletes_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames != HEADERS:
            raise ValueError("athletes.csv has unexpected column headers")
        existing = list(reader)

    seen = {normalize_name(row["normalized_name"]) for row in existing}
    next_id = max((int(row["import_id"]) for row in existing), default=0) + 1
    additions = []
    duplicates = 0
    skipped = 0

    with players_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or "displayName" not in reader.fieldnames:
            raise ValueError("players.csv must contain a displayName column")
        for row in reader:
            display_name = " ".join((row.get("displayName") or "").split())
            parts = display_name.split()
            # This dataset spells the user's Ha-Ha example as "Ha Ha".
            if len(parts) >= 3 and parts[:2] == ["Ha", "Ha"]:
                parts = ["Ha-Ha", *parts[2:]]
            if len(parts) < 2:
                skipped += 1
                continue
            first_name = parts[0]
            last_name = parts[1].rsplit("-", 1)[-1]
            if not last_name:
                skipped += 1
                continue
            normalized_name = normalize_name(display_name)
            if normalized_name in seen:
                duplicates += 1
                continue
            additions.append(dict(zip(HEADERS, [
                next_id, first_name, last_name, display_name, normalized_name,
                "Football", "true", "false", "{}", "false",
            ])))
            seen.add(normalized_name)
            next_id += 1

    if additions:
        # Preserve existing contents, including a file without a final newline.
        with athletes_path.open("rb") as file:
            file.seek(-1, 2)
            needs_newline = file.read(1) not in (b"\n", b"\r")
        with athletes_path.open("a", newline="", encoding="utf-8") as file:
            if needs_newline:
                file.write("\n")
            csv.DictWriter(file, fieldnames=HEADERS, lineterminator="\n").writerows(additions)

    print(f"Added {len(additions)} players; skipped {duplicates} duplicates and {skipped} invalid names.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=Path, default=DATA_DIR / "players.csv")
    parser.add_argument("--athletes", type=Path, default=DATA_DIR / "athletes.csv")
    args = parser.parse_args()
    import_players(args.players, args.athletes)
