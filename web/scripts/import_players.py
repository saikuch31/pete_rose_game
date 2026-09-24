"""Append professional tennis players from atp_ranking.csv to athletes.csv.

Run from any directory:

    python3 path/to/scripts/import_players.py

Default paths:
    Source: data/atp_ranking.csv
    Destination: data/athletes.csv

Use --players and --athletes to override the default paths.

The ATP source stores names as "Last, First". This script converts them
to "First Last" before adding them to the athlete catalog.

No nicknames or alternate names are generated.
"""

import argparse
import csv
from pathlib import Path


HEADERS = [
    "import_id",
    "first_name",
    "last_name",
    "display_name",
    "normalized_name",
    "sport",
    "is_professional",
    "is_nickname",
    "alternate_names",
    "needs_review",
]

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def normalize_name(name):
    """Normalize whitespace and casing for duplicate detection."""
    return " ".join(name.split()).lower()


def parse_atp_name(player_name):
    """Convert an ATP name from 'Last, First' to separate name fields.

    Examples:
        Alcaraz, Carlos -> Carlos, Alcaraz
        Auger-Aliassime, Felix -> Felix, Auger-Aliassime

    Returns:
        A tuple of first_name, last_name, and display_name.
        Returns None when the value cannot be parsed.
    """
    player_name = " ".join(player_name.split())

    if not player_name or "," not in player_name:
        return None

    last_name, first_name = player_name.split(",", maxsplit=1)

    first_name = first_name.strip()
    last_name = last_name.strip()

    if not first_name or not last_name:
        return None

    display_name = f"{first_name} {last_name}"

    return first_name, last_name, display_name


def import_players(players_path, athletes_path):
    """Import unique ATP players into athletes.csv."""

    if not players_path.exists():
        raise FileNotFoundError(f"Players file not found: {players_path}")

    if not athletes_path.exists():
        raise FileNotFoundError(f"Athletes file not found: {athletes_path}")

    # Load existing athlete records.
    with athletes_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != HEADERS:
            raise ValueError(
                "athletes.csv has unexpected column headers.\n"
                f"Expected: {HEADERS}\n"
                f"Found: {reader.fieldnames}"
            )

        existing = list(reader)

    # Build a set of existing names for duplicate detection.
    seen = {
        normalize_name(
            row.get("normalized_name")
            or row.get("display_name")
            or ""
        )
        for row in existing
        if row.get("normalized_name") or row.get("display_name")
    }

    # Determine the next available import ID.
    existing_ids = []

    for row in existing:
        try:
            existing_ids.append(int(row["import_id"]))
        except (KeyError, TypeError, ValueError):
            continue

    next_id = max(existing_ids, default=0) + 1

    additions = []
    duplicates = 0
    skipped = 0

    # Read ATP players.
    with players_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames or "player" not in reader.fieldnames:
            raise ValueError(
                "atp_ranking.csv must contain a player column"
            )

        for row in reader:
            player_name = row.get("player") or ""
            parsed_name = parse_atp_name(player_name)

            if parsed_name is None:
                skipped += 1
                continue

            first_name, last_name, display_name = parsed_name
            normalized_name = normalize_name(display_name)

            if normalized_name in seen:
                duplicates += 1
                continue

            additions.append(
                {
                    "import_id": str(next_id),
                    "first_name": first_name,
                    "last_name": last_name,
                    "display_name": display_name,
                    "normalized_name": normalized_name,
                    "sport": "Tennis",
                    "is_professional": "true",
                    "is_nickname": "false",
                    "alternate_names": "{}",
                    "needs_review": "false",
                }
            )

            seen.add(normalized_name)
            next_id += 1

    # Append new records to athletes.csv.
    if additions:
        needs_newline = False

        if athletes_path.stat().st_size > 0:
            with athletes_path.open("rb") as file:
                file.seek(-1, 2)
                needs_newline = file.read(1) not in (b"\n", b"\r")

        with athletes_path.open(
            "a",
            newline="",
            encoding="utf-8",
        ) as file:
            if needs_newline:
                file.write("\n")

            writer = csv.DictWriter(
                file,
                fieldnames=HEADERS,
                lineterminator="\n",
            )
            writer.writerows(additions)

    print(
        f"Added {len(additions)} tennis players; "
        f"skipped {duplicates} duplicates and "
        f"{skipped} invalid names."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument(
        "--players",
        type=Path,
        default=DATA_DIR / "atp_ranking.csv",
        help="Path to atp_ranking.csv",
    )

    parser.add_argument(
        "--athletes",
        type=Path,
        default=DATA_DIR / "athletes.csv",
        help="Path to athletes.csv",
    )

    args = parser.parse_args()

    import_players(
        players_path=args.players,
        athletes_path=args.athletes,
    )