import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { AthleteCatalog } from "./athlete-catalog";
import { createGame, submitAthlete } from "./game-engine";

const csv = readFileSync(resolve(process.cwd(), "data/athletes.csv"), "utf8");

describe("AthleteCatalog", () => {
  it("loads the provided testing.csv", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    assert.equal(catalog.athletes.length, 20);
    assert.deepEqual(catalog.find("  rasheed   WALLACE "), {
      id: "1",
      importId: 1,
      firstName: "Rasheed",
      lastName: "Wallace",
      displayName: "Rasheed Wallace",
      normalizedName: "rasheed wallace",
      sport: "Basketball",
      isProfessional: true,
      isNickname: false,
      alternateNames: [],
      needsReview: false,
    });
  });

  it("converts a CSV record into a valid engine submission", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    const submission = catalog.toSubmission("Rasheed Wallace");
    assert.ok(submission);

    const result = submitAthlete(createGame(["A", "B"]), submission);
    assert.equal(result.kind, "valid");
    assert.equal(result.state.requiredLetter, "W");
  });

  it("returns null for an athlete outside the catalog", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    assert.equal(catalog.find("Unknown Person"), null);
    assert.equal(catalog.toSubmission("Unknown Person"), null);
  });

  it("returns a random athlete from the catalog", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    const athlete = catalog.random();
    assert.ok(catalog.athletes.includes(athlete));
  });

  it("finds a close fuzzy match for a misspelled athlete name", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    const athlete = catalog.findClosest("Wilt Chamberlen", "W");
    assert.equal(athlete?.displayName, "Wilt Chamberlain");
  });

  it("does not fuzzy match across the wrong required letter", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    const athlete = catalog.findClosest("Wilt Chamberlen", "R");
    assert.equal(athlete, null);
  });

  it("suggests only after a complete first name and narrows by full-name prefix", () => {
    const catalog = AthleteCatalog.fromCsv(csv);
    assert.deepEqual(catalog.suggest("Way", "W"), []);
    assert.deepEqual(
      catalog.suggest("Wayne", "W").map((athlete) => athlete.displayName),
      ["Wayne Gretzky"],
    );
    assert.deepEqual(catalog.suggest("Wayne G", "W")[0]?.displayName, "Wayne Gretzky");
    assert.deepEqual(catalog.suggest("Wayne X", "W"), []);
    assert.deepEqual(catalog.suggest("Wayne", "R"), []);
  });

  it("rejects invalid headers and typed values", () => {
    assert.throws(() => AthleteCatalog.fromCsv("name\nRasheed Wallace"), /headers/);
    assert.throws(
      () => AthleteCatalog.fromCsv(csv.replace(",true,false,{},false", ",yes,false,{},false")),
      /invalid is_professional/,
    );
    assert.throws(
      () => AthleteCatalog.fromCsv(csv.replace("import_id", "source_row_id")),
      /headers/,
    );
  });
});
