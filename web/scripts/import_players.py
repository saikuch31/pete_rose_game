"""Append football players from Null_positions.csv to athletes.csv.

Players with at least two whitespace-separated name components are appended
to athletes.csv. Players with only one name are omitted from athletes.csv
and written to single_name_players.csv for later review.

Run from any directory:

    python3 path/to/scripts/import_players.py

Default paths:
    Source: data/Null_positions.csv
    Destination: data/athletes.csv
    Single-name output: data/single_name_players.csv

Use --players, --athletes, and --single-names to override these paths.
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

SINGLE_NAME_HEADERS = [
    "Name",
    "Alternative positions",
]

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def clean_name(name):
    """Remove leading, trailing, and repeated whitespace."""
    return " ".join((name or "").split())


def normalize_name(name):
    """Normalize a name for duplicate detection."""
    return clean_name(name).lower()


def split_player_name(display_name):
    """Split a full name into first and last names.

    The first word becomes first_name. Everything after the first word
    becomes last_name.

    Examples:
        Erling Haaland -> Erling, Haaland
        Gianluigi Donnarumma -> Gianluigi, Donnarumma
        Virgil van Dijk -> Virgil, van Dijk
        Neymar -> None

    A one-word name returns None.
    """
    parts = display_name.split(maxsplit=1)

    if len(parts) < 2:
        return None

    first_name = parts[0].strip()
    last_name = parts[1].strip()

    if not first_name or not last_name:
        return None

    return first_name, last_name


def load_existing_athletes(athletes_path):
    """Load athletes.csv and validate its headers."""
    if not athletes_path.exists():
        raise FileNotFoundError(
            f"Athletes file not found: {athletes_path}"
        )

    with athletes_path.open(
        newline="",
        encoding="utf-8-sig",
    ) as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != HEADERS:
            raise ValueError(
                "athletes.csv has unexpected column headers.\n"
                f"Expected: {HEADERS}\n"
                f"Found: {reader.fieldnames}"
            )

        return list(reader)


def get_next_import_id(existing):
    """Return the next available numeric import ID."""
    existing_ids = []

    for row in existing:
        try:
            existing_ids.append(int(row["import_id"]))
        except (KeyError, TypeError, ValueError):
            continue

    return max(existing_ids, default=0) + 1


def append_athletes(athletes_path, additions):
    """Append athlete records while preserving existing contents."""
    if not additions:
        return

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


def write_single_name_players(single_names_path, single_name_rows):
    """Write unique one-word player names to a separate CSV.

    Existing rows in single_name_players.csv are retained. New names are
    appended only when they are not already present.
    """
    existing_rows = []
    seen_single_names = set()

    if single_names_path.exists():
        with single_names_path.open(
            newline="",
            encoding="utf-8-sig",
        ) as file:
            reader = csv.DictReader(file)

            if reader.fieldnames != SINGLE_NAME_HEADERS:
                raise ValueError(
                    "single_name_players.csv has unexpected headers.\n"
                    f"Expected: {SINGLE_NAME_HEADERS}\n"
                    f"Found: {reader.fieldnames}"
                )

            existing_rows = list(reader)

        seen_single_names = {
            normalize_name(row.get("Name", ""))
            for row in existing_rows
            if clean_name(row.get("Name", ""))
        }

    new_rows = []

    for row in single_name_rows:
        normalized_name = normalize_name(row["Name"])

        if normalized_name in seen_single_names:
            continue

        new_rows.append(row)
        seen_single_names.add(normalized_name)

    if not new_rows and single_names_path.exists():
        return 0

    single_names_path.parent.mkdir(parents=True, exist_ok=True)

    with single_names_path.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=SINGLE_NAME_HEADERS,
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(existing_rows)
        writer.writerows(new_rows)

    return len(new_rows)


def import_players(players_path, athletes_path, single_names_path):
    """Import players from Null_positions.csv."""

    if not players_path.exists():
        raise FileNotFoundError(
            f"Players file not found: {players_path}"
        )

    existing = load_existing_athletes(athletes_path)

    seen = {
        normalize_name(
            row.get("normalized_name")
            or row.get("display_name")
            or ""
        )
        for row in existing
        if row.get("normalized_name") or row.get("display_name")
    }

    next_id = get_next_import_id(existing)

    additions = []
    single_name_rows = []
    duplicates = 0
    invalid = 0

    with players_path.open(
        newline="",
        encoding="utf-8-sig",
    ) as file:
        reader = csv.DictReader(file)

        required_columns = {"Name", "Alternative positions"}

        if not reader.fieldnames:
            raise ValueError("Null_positions.csv is missing headers")

        missing_columns = required_columns - set(reader.fieldnames)

        if missing_columns:
            raise ValueError(
                "Null_positions.csv is missing required columns: "
                + ", ".join(sorted(missing_columns))
            )

        for row in reader:
            display_name = clean_name(row.get("Name"))

            if not display_name:
                invalid += 1
                continue

            split_name = split_player_name(display_name)

            # Store one-word names separately.
            if split_name is None:
                single_name_rows.append(
                    {
                        "Name": display_name,
                        "Alternative positions": clean_name(
                            row.get("Alternative positions")
                        ),
                    }
                )
                continue

            first_name, last_name = split_name
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
                    "sport": "Football",
                    "is_professional": "true",
                    "is_nickname": "false",
                    "alternate_names": "{}",
                    "needs_review": "false",
                }
            )

            seen.add(normalized_name)
            next_id += 1

    append_athletes(athletes_path, additions)

    single_names_added = write_single_name_players(
        single_names_path,
        single_name_rows,
    )

    print(
        f"Added {len(additions)} football players to athletes.csv; "
        f"skipped {duplicates} duplicates and {invalid} invalid rows; "
        f"added {single_names_added} one-word names to "
        f"{single_names_path.name}."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument(
        "--players",
        type=Path,
        default=DATA_DIR / "sample.csv",
        help="Path to Null_positions.csv",
    )

    parser.add_argument(
        "--athletes",
        type=Path,
        default=DATA_DIR / "athletes.csv",
        help="Path to athletes.csv",
    )

    parser.add_argument(
        "--single-names",
        type=Path,
        default=DATA_DIR / "single_name_players.csv",
        help="Output path for players with one-word names",
    )

    args = parser.parse_args()

    import_players(
        players_path=args.players,
        athletes_path=args.athletes,
        single_names_path=args.single_names,
    )