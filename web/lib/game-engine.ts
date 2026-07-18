export const DEFAULT_LIVES = 3;
export const DEFAULT_TURN_SECONDS = 30;

export type Direction = "clockwise" | "counterclockwise";
export type GameStatus = "in_progress" | "finished";

export interface Player {
  id: string;
  name: string;
  lives: number;
  eliminated: boolean;
}

export interface Athlete {
  firstName: string;
  lastName: string;
}

export interface AthleteSubmission extends Athlete {
  /** Supplied by the athlete lookup/verification layer. */
  isProfessional: boolean;
  /** True when the submitted name is a nickname rather than a common/legal name. */
  isNickname?: boolean;
}

export interface UsedAthlete extends Athlete {
  key: string;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  seedAthlete: UsedAthlete;
  requiredLetter: string;
  direction: Direction;
  usedAthletes: UsedAthlete[];
  turnSeconds: number;
  status: GameStatus;
  winnerId: string | null;
  turnNumber: number;
}

export type InvalidReason =
  | "game_finished"
  | "athlete_not_found"
  | "missing_full_name"
  | "wrong_initial"
  | "not_professional"
  | "nickname_not_allowed"
  | "already_used";

export type TurnResult =
  | {
      kind: "valid";
      athlete: UsedAthlete;
      reversed: boolean;
      state: GameState;
    }
  | {
      kind: "invalid";
      reason: InvalidReason;
      lostLife: boolean;
      state: GameState;
    }
  | {
      kind: "timeout";
      lostLife: true;
      state: GameState;
    };

export interface GameOptions {
  lives?: number;
  turnSeconds?: number;
  seedAthlete?: Athlete;
}

export function createGame(
  playerNames: readonly string[],
  options: GameOptions = {},
): GameState {
  if (playerNames.length < 2) {
    throw new Error("At least two players are required.");
  }

  const names = playerNames.map((name) => name.trim());
  if (names.some((name) => name.length === 0)) {
    throw new Error("Every player must have a name.");
  }

  const lives = options.lives ?? DEFAULT_LIVES;
  const turnSeconds = options.turnSeconds ?? DEFAULT_TURN_SECONDS;
  if (!Number.isInteger(lives) || lives < 1) {
    throw new Error("Lives must be a positive integer.");
  }
  if (!Number.isInteger(turnSeconds) || turnSeconds < 1) {
    throw new Error("Turn time must be a positive integer.");
  }

  const seedAthlete = sanitizeAthlete(
    options.seedAthlete ?? { firstName: "Pete", lastName: "Rose" },
  );
  if (!seedAthlete.firstName || !seedAthlete.lastName) {
    throw new Error("Seed athlete must include both a first and last name.");
  }
  const usedSeedAthlete = toUsedAthlete(seedAthlete);

  return {
    players: names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      lives,
      eliminated: false,
    })),
    currentPlayerIndex: 0,
    seedAthlete: usedSeedAthlete,
    requiredLetter: firstLetter(seedAthlete.lastName),
    direction: "clockwise",
    usedAthletes: [usedSeedAthlete],
    turnSeconds,
    status: "in_progress",
    winnerId: null,
    turnNumber: 1,
  };
}

export function submitAthlete(
  state: GameState,
  submission: AthleteSubmission,
): TurnResult {
  if (state.status === "finished") {
    return invalidWithoutPenalty(state, "game_finished");
  }

  const athlete = sanitizeAthlete(submission);
  let reason: InvalidReason | null = null;

  if (!athlete.firstName || !athlete.lastName) {
    reason = "missing_full_name";
  } else if (firstLetter(athlete.firstName) !== state.requiredLetter) {
    reason = "wrong_initial";
  } else if (!submission.isProfessional) {
    reason = "not_professional";
  } else if (submission.isNickname) {
    reason = "nickname_not_allowed";
  } else if (
    state.usedAthletes.some((used) => used.key === athleteKey(athlete))
  ) {
    reason = "already_used";
  }

  if (reason) {
    return applyPenalty(state, "invalid", reason);
  }

  const usedAthlete = toUsedAthlete(athlete);
  const reversed =
    firstLetter(athlete.firstName) === firstLetter(athlete.lastName);
  const direction = reversed ? reverseDirection(state.direction) : state.direction;
  const updated = {
    ...state,
    direction,
    requiredLetter: firstLetter(athlete.lastName),
    usedAthletes: [...state.usedAthletes, usedAthlete],
  };
  const nextState = advanceTurn(updated);

  return { kind: "valid", athlete: usedAthlete, reversed, state: nextState };
}

export function timeoutTurn(state: GameState): TurnResult {
  if (state.status === "finished") {
    return invalidWithoutPenalty(state, "game_finished");
  }
  return applyPenalty(state, "timeout");
}

export function rejectTurn(
  state: GameState,
  reason: Extract<InvalidReason, "athlete_not_found">,
): TurnResult {
  if (state.status === "finished") {
    return invalidWithoutPenalty(state, "game_finished");
  }
  return applyPenalty(state, "invalid", reason);
}

function applyPenalty(
  state: GameState,
  kind: "invalid",
  reason: InvalidReason,
): TurnResult;
function applyPenalty(state: GameState, kind: "timeout"): TurnResult;
function applyPenalty(
  state: GameState,
  kind: "invalid" | "timeout",
  reason?: InvalidReason,
): TurnResult {
  const players = state.players.map((player, index) => {
    if (index !== state.currentPlayerIndex) return player;
    const lives = player.lives - 1;
    return { ...player, lives, eliminated: lives === 0 };
  });
  const penalized = { ...state, players };
  const activePlayers = players.filter((player) => !player.eliminated);
  const nextState =
    activePlayers.length === 1
      ? {
          ...penalized,
          status: "finished" as const,
          winnerId: activePlayers[0].id,
        }
      : advanceTurn(penalized);

  if (kind === "timeout") {
    return { kind, lostLife: true, state: nextState };
  }
  return { kind, reason: reason!, lostLife: true, state: nextState };
}

function advanceTurn(state: GameState): GameState {
  const step = state.direction === "clockwise" ? 1 : -1;
  let index = state.currentPlayerIndex;

  do {
    index = (index + step + state.players.length) % state.players.length;
  } while (state.players[index].eliminated);

  return { ...state, currentPlayerIndex: index, turnNumber: state.turnNumber + 1 };
}

function invalidWithoutPenalty(
  state: GameState,
  reason: InvalidReason,
): TurnResult {
  return { kind: "invalid", reason, lostLife: false, state };
}

function sanitizeAthlete(athlete: Athlete): Athlete {
  return {
    firstName: collapseWhitespace(athlete.firstName),
    lastName: collapseWhitespace(athlete.lastName),
  };
}

function toUsedAthlete(athlete: Athlete): UsedAthlete {
  const sanitized = sanitizeAthlete(athlete);
  return { ...sanitized, key: athleteKey(sanitized) };
}

function athleteKey(athlete: Athlete): string {
  return `${athlete.firstName} ${athlete.lastName}`.toLocaleLowerCase("en-US");
}

function firstLetter(value: string): string {
  return Array.from(value.trim())[0]?.toLocaleUpperCase("en-US") ?? "";
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function reverseDirection(direction: Direction): Direction {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}
