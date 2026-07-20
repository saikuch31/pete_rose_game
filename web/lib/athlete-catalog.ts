import type { AthleteSubmission } from "./game-engine";

export interface AthleteRecord {
  id: string;
  importId: number;
  firstName: string;
  lastName: string;
  displayName: string;
  normalizedName: string;
  sport: string;
  isProfessional: boolean;
  isNickname: boolean;
  alternateNames: string[];
  needsReview: boolean;
}

const EXPECTED_HEADERS = [
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
] as const;

export class AthleteCatalog {
  private readonly athletesByName: Map<string, AthleteRecord>;

  constructor(readonly athletes: readonly AthleteRecord[]) {
    this.athletesByName = new Map();

    for (const athlete of athletes) {
      const key = athlete.normalizedName;
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

  findClosest(fullName: string, requiredLetter?: string): AthleteRecord | null {
    const normalizedQuery = normalizeName(fullName);
    if (!normalizedQuery) return null;

    const required = requiredLetter?.trim().toLocaleUpperCase("en-US");
    let bestMatch: AthleteRecord | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const athlete of this.athletes) {
      if (
        required &&
        athlete.firstName.charAt(0).toLocaleUpperCase("en-US") !== required
      ) {
        continue;
      }

      const distance = levenshteinDistance(
        normalizedQuery,
        normalizeName(athlete.displayName),
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = athlete;
      }
    }

    if (!bestMatch) return null;

    const maxDistance = normalizedQuery.length <= 8 ? 2 : 3;
    return bestDistance <= maxDistance ? bestMatch : null;
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

  random(): AthleteRecord {
    if (this.athletes.length === 0) {
      throw new Error("Athlete catalog is empty.");
    }

    const index = Math.floor(Math.random() * this.athletes.length);
    return this.athletes[index];
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
        throw new Error(`CSV line ${lineNumber} has ${row.length} columns; expected 10.`);
      }

      const [
        importId,
        firstName,
        lastName,
        displayName,
        normalizedName,
        sport,
        professional,
        nickname,
        alternateNames,
        needsReview,
      ] =
        row.map((value) => value.trim());
      if (
        !importId ||
        !firstName ||
        !lastName ||
        !displayName ||
        !normalizedName ||
        !sport
      ) {
        throw new Error(`CSV line ${lineNumber} has a missing required value.`);
      }
      const parsedImportId = parseImportId(importId, lineNumber);
      if (seenIds.has(importId)) throw new Error(`Duplicate athlete id: ${importId}`);
      seenIds.add(importId);

      return {
        id: importId,
        importId: parsedImportId,
        firstName,
        lastName,
        displayName,
        normalizedName: normalizeName(normalizedName),
        sport,
        isProfessional: parseBoolean(professional, lineNumber, "is_professional"),
        isNickname: parseBoolean(nickname, lineNumber, "is_nickname"),
        alternateNames: parseAlternateNames(alternateNames),
        needsReview: parseBoolean(needsReview, lineNumber, "needs_review"),
      };
    });

    return new AthleteCatalog(athletes);
  }
}

function parseImportId(value: string, line: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`CSV line ${line} has invalid import_id: ${value}`);
  }
  return parsed;
}

function parseBoolean(value: string, line: number, column: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`CSV line ${line} has invalid ${column}: ${value}`);
}

function parseAlternateNames(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return [];
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let previousDiagonal = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const temp = previousRow[rightIndex + 1];
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        previousDiagonal + substitutionCost,
      );
      previousDiagonal = temp;
    }
  }

  return previousRow[right.length];
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
