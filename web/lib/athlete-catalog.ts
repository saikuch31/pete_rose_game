import type { AthleteSubmission } from "./game-engine";

export interface AthleteRecord {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  sport: string;
  isProfessional: boolean;
  isNickname: boolean;
}

const EXPECTED_HEADERS = [
  "id",
  "first_name",
  "last_name",
  "display_name",
  "sport",
  "is_professional",
  "is_nickname",
] as const;

export class AthleteCatalog {
  private readonly athletesByName: Map<string, AthleteRecord>;

  constructor(readonly athletes: readonly AthleteRecord[]) {
    this.athletesByName = new Map();

    for (const athlete of athletes) {
      const key = normalizeName(athlete.displayName);
      if (this.athletesByName.has(key)) {
        throw new Error(`Duplicate athlete name: ${athlete.displayName}`);
      }
      this.athletesByName.set(key, athlete);
    }
  }

  find(fullName: string): AthleteRecord | null {
    return this.athletesByName.get(normalizeName(fullName)) ?? null;
  }

  suggest(query: string, requiredLetter?: string, limit = 8): AthleteRecord[] {
    const normalizedQuery = normalizeName(query);
    if (!normalizedQuery) return [];

    const [typedFirstName] = normalizedQuery.split(" ");
    const hasCompletedFirstName = this.athletes.some(
      (athlete) => normalizeName(athlete.firstName) === typedFirstName,
    );
    if (!hasCompletedFirstName) return [];

    const required = requiredLetter?.trim().toLocaleUpperCase("en-US");
    return this.athletes
      .filter((athlete) => {
        if (
          required &&
          athlete.firstName.charAt(0).toLocaleUpperCase("en-US") !== required
        ) return false;
        return normalizeName(athlete.displayName).startsWith(normalizedQuery);
      })
      .slice(0, limit);
  }

  toSubmission(fullName: string): AthleteSubmission | null {
    const athlete = this.find(fullName);
    if (!athlete) return null;

    return {
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      isProfessional: athlete.isProfessional,
      isNickname: athlete.isNickname,
    };
  }

  static fromCsv(csv: string): AthleteCatalog {
    const rows = parseCsv(csv);
    if (rows.length === 0) throw new Error("Athlete CSV is empty.");

    const headers = rows[0].map((value) => value.trim());
    if (
      headers.length !== EXPECTED_HEADERS.length ||
      EXPECTED_HEADERS.some((header, index) => headers[index] !== header)
    ) {
      throw new Error(`CSV headers must be: ${EXPECTED_HEADERS.join(",")}`);
    }

    const seenIds = new Set<string>();
    const athletes = rows.slice(1).map((row, index) => {
      const lineNumber = index + 2;
      if (row.length !== EXPECTED_HEADERS.length) {
        throw new Error(`CSV line ${lineNumber} has ${row.length} columns; expected 7.`);
      }

      const [id, firstName, lastName, displayName, sport, professional, nickname] =
        row.map((value) => value.trim());
      if (!id || !firstName || !lastName || !displayName || !sport) {
        throw new Error(`CSV line ${lineNumber} has a missing required value.`);
      }
      if (seenIds.has(id)) throw new Error(`Duplicate athlete id: ${id}`);
      seenIds.add(id);

      return {
        id,
        firstName,
        lastName,
        displayName,
        sport,
        isProfessional: parseBoolean(professional, lineNumber, "is_professional"),
        isNickname: parseBoolean(nickname, lineNumber, "is_nickname"),
      };
    });

    return new AthleteCatalog(athletes);
  }
}

function parseBoolean(value: string, line: number, column: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`CSV line ${line} has invalid ${column}: ${value}`);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Parses standard CSV quoting, including commas and escaped quotes in fields. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}
