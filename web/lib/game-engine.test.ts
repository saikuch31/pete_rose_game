import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGame, rejectTurn, submitAthlete, timeoutTurn } from "./game-engine";

const pro = (firstName: string, lastName: string) => ({
  firstName,
  lastName,
  isProfessional: true,
});

describe("createGame", () => {
  it("starts with the supplied seed athlete and uses their last-name initial", () => {
    const state = createGame(["A", "B"], {
      seedAthlete: { firstName: "Walter", lastName: "Payton" },
    });
    assert.equal(state.requiredLetter, "P");
    assert.equal(state.seedAthlete.key, "walter payton");
    assert.equal(state.usedAthletes[0].key, "walter payton");
    assert.equal(state.players[0].lives, 3);
    assert.equal(state.turnSeconds, 30);
  });

  it("defaults to Pete Rose when no seed athlete is provided", () => {
    const state = createGame(["A", "B"]);
    assert.equal(state.requiredLetter, "R");
    assert.equal(state.usedAthletes[0].key, "pete rose");
  });

  it("requires at least two players and valid settings", () => {
    assert.throws(() => createGame(["A"]), /At least two/);
    assert.throws(() => createGame(["A", "B"], { lives: 0 }), /Lives/);
    assert.throws(
      () => createGame(["A", "B"], { turnSeconds: 1.5 }),
      /Turn time/,
    );
    assert.throws(
      () => createGame(["A", "B"], { seedAthlete: { firstName: "Pete", lastName: "" } }),
      /Seed athlete/,
    );
  });
});

describe("submitting athletes", () => {
  it("accepts a valid athlete, records them, and advances the turn", () => {
    const result = submitAthlete(createGame(["A", "B"]), pro("Rasheed", "Wallace"));
    assert.equal(result.kind, "valid");
    assert.equal(result.state.requiredLetter, "W");
    assert.equal(result.state.currentPlayerIndex, 1);
    assert.equal(result.state.usedAthletes.at(-1)?.key, "rasheed wallace");
  });

  it("rejects wrong initials, non-professionals, nicknames, and reused names", () => {
    const initial = createGame(["A", "B"], { lives: 5 });
    const wrong = submitAthlete(initial, pro("Michael", "Jordan"));
    assert.equal(wrong.kind, "invalid");
    assert.equal(wrong.kind === "invalid" && wrong.reason, "wrong_initial");
    assert.equal(wrong.state.requiredLetter, "R");

    const amateur = submitAthlete(wrong.state, {
      ...pro("Roger", "Smith"),
      isProfessional: false,
    });
    assert.equal(amateur.kind === "invalid" && amateur.reason, "not_professional");

    const nickname = submitAthlete(amateur.state, {
      ...pro("Rocket", "Richard"),
      isNickname: true,
    });
    assert.equal(
      nickname.kind === "invalid" && nickname.reason,
      "nickname_not_allowed",
    );

    const valid = submitAthlete(nickname.state, pro("Rasheed", "Wallace"));
    const reused = submitAthlete(valid.state, pro("rasheed", "wallace"));
    assert.equal(reused.kind === "invalid" && reused.reason, "wrong_initial");

    const reusedState = { ...valid.state, requiredLetter: "R" };
    const actualReuse = submitAthlete(reusedState, pro(" rasheed ", " WALLACE "));
    assert.equal(actualReuse.kind === "invalid" && actualReuse.reason, "already_used");
  });

  it("reverses direction when first and last initials match", () => {
    const result = submitAthlete(createGame(["A", "B", "C"]), pro("Ron", "Rivera"));
    assert.equal(result.kind, "valid");
    assert.equal(result.kind === "valid" && result.reversed, true);
    assert.equal(result.state.direction, "counterclockwise");
    assert.equal(result.state.currentPlayerIndex, 2);
  });
});

describe("penalties and elimination", () => {
  it("takes one life on an invalid answer and keeps the letter", () => {
    const state = createGame(["A", "B"]);
    const result = submitAthlete(state, pro("Michael", "Jordan"));
    assert.equal(result.state.players[0].lives, 2);
    assert.equal(result.state.requiredLetter, "R");
    assert.equal(result.state.currentPlayerIndex, 1);
  });

  it("takes one life when the lookup cannot find an athlete", () => {
    const result = rejectTurn(createGame(["A", "B"]), "athlete_not_found");
    assert.equal(result.kind === "invalid" && result.reason, "athlete_not_found");
    assert.equal(result.state.players[0].lives, 2);
    assert.equal(result.state.requiredLetter, "R");
  });

  it("takes one life on timeout and skips eliminated players", () => {
    let state = createGame(["A", "B", "C"], { lives: 1 });
    state = timeoutTurn(state).state;
    assert.equal(state.players[0].eliminated, true);
    assert.equal(state.currentPlayerIndex, 1);
    state = submitAthlete(state, pro("Rasheed", "Wallace")).state;
    state = submitAthlete(state, pro("Walter", "Payton")).state;
    assert.equal(state.currentPlayerIndex, 1);
  });

  it("declares the last active player the winner", () => {
    const result = timeoutTurn(createGame(["A", "B"], { lives: 1 }));
    assert.equal(result.state.status, "finished");
    assert.equal(result.state.winnerId, "player-2");
    assert.equal(result.state.turnNumber, 1);

    const afterFinish = timeoutTurn(result.state);
    assert.equal(afterFinish.kind, "invalid");
    assert.equal(afterFinish.kind === "invalid" && afterFinish.reason, "game_finished");
    assert.equal(afterFinish.kind === "invalid" && afterFinish.lostLife, false);
  });
});
