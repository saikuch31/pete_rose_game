"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import GameClientView, {
  type HistoryEntry,
} from "./game-client-view";

import {
  createGame,
  type GameState,
  type InvalidReason,
  rejectTurn,
  submitAthlete,
  timeoutTurn,
  type TurnResult,
} from "@/lib/game-engine";

type LookupAthlete = {
  firstName: string;
  lastName: string;
  displayName: string;
  sport: string;
  isProfessional: boolean;
  isNickname: boolean;
};

type PendingSuggestion = {
  athlete: LookupAthlete;
  submittedName: string;
  playerName: string;
  turnNumber: number;
};

const reasonLabels: Record<InvalidReason, string> = {
  game_finished: "game is over",
  athlete_not_found: "who is that?",
  missing_full_name: "need a first and last name",
  wrong_initial: "he first name starts with the wrong letter",
  not_professional: "that person is not marked as a professional athlete.",
  nickname_not_allowed: "nicknames are not allowed (yet)",
  already_used: "this athlete has already been used.",
};

export default function GameClient() {
  const [playerNames, setPlayerNames] = useState(["", ""]);
  const [lives, setLives] = useState(3);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [game, setGame] = useState<GameState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(turnSeconds);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const resolvingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!game || game.status === "finished" || pendingSuggestion) return;
    resolvingRef.current = false;
    let remaining = game.turnSeconds;
    inputRef.current?.focus();

    const turnNumber = game.turnNumber;
    const timer = window.setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining > 0) return;

      window.clearInterval(timer);
      const snapshot = gameRef.current;
      if (
        !snapshot ||
        snapshot.status === "finished" ||
        snapshot.turnNumber !== turnNumber ||
        resolvingRef.current
      ) {
        return;
      }

      resolvingRef.current = true;
      const playerName = snapshot.players[snapshot.currentPlayerIndex].name;
      const result = timeoutTurn(snapshot);
      setHistory((entries) => [
        {
          id: Date.now(),
          player: playerName,
          answer: "Time expired",
          detail: "Lost one life",
          valid: false,
        },
        ...entries,
      ]);
      setFeedback(`${playerName} ran out of time and lost one life.`);
      setSecondsLeft(result.state.turnSeconds);
      setGame(result.state);
      setAnswer("");
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game, pendingSuggestion]);

  function updatePlayer(index: number, value: string) {
    setPlayerNames((names) =>
      names.map((name, position) => (position === index ? value : name)),
    );
  }

  function addPlayer() {
    setPlayerNames((names) => [...names, ""]);
  }

  function removePlayer(index: number) {
    setPlayerNames((names) => names.filter((_, position) => position !== index));
  }

  async function fetchRandomSeedAthlete(): Promise<LookupAthlete> {
    const response = await fetch("/api/athletes/lookup?random=1");
    if (!response.ok) {
      throw new Error("Random athlete lookup failed.");
    }

    const data = (await response.json()) as { athlete?: LookupAthlete | null };
    if (!data.athlete) {
      throw new Error("Random athlete lookup returned no athlete.");
    }

    return data.athlete;
  }

  async function startGame(event: FormEvent) {
    event.preventDefault();
    try {
      const seedAthlete = await fetchRandomSeedAthlete();
      const nextGame = createGame(playerNames, {
        lives,
        turnSeconds,
        seedAthlete,
      });
      setGame(nextGame);
      setSecondsLeft(nextGame.turnSeconds);
      setHistory([]);
      setFeedback(
        `${seedAthlete.displayName} starts the game. Opening letter: ${nextGame.requiredLetter}.`,
      );
      setAnswer("");
      setPendingSuggestion(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to start the game.");
    }
  }

  async function startQuickTest() {
    try {
      const seedAthlete = await fetchRandomSeedAthlete();
      const nextGame = createGame(["Player 1", "Player 2"], {
        lives: 3,
        turnSeconds: 30,
        seedAthlete,
      });
      setPlayerNames(["Player 1", "Player 2"]);
      setLives(3);
      setTurnSeconds(30);
      setGame(nextGame);
      setSecondsLeft(30);
      setHistory([]);
      setFeedback(
        `Quick test started with ${seedAthlete.displayName}. Opening letter: ${nextGame.requiredLetter}.`,
      );
      setAnswer("");
      setPendingSuggestion(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to start the quick test.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const snapshot = gameRef.current;
    const submittedName = answer.trim();
    if (!snapshot || !submittedName || resolvingRef.current) return;

    resolvingRef.current = true;
    setSubmitting(true);
    const playerName = snapshot.players[snapshot.currentPlayerIndex].name;

    try {
      const response = await fetch("/api/athletes/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: submittedName,
          requiredLetter: snapshot.requiredLetter,
        }),
      });
      if (!response.ok) throw new Error("Athlete lookup failed.");
      const data = (await response.json()) as {
        athlete: LookupAthlete | null;
        suggestion?: LookupAthlete | null;
      };
      if (!data.athlete && data.suggestion) {
        setPendingSuggestion({
          athlete: data.suggestion,
          submittedName,
          playerName,
          turnNumber: snapshot.turnNumber,
        });
        setFeedback(`Did you mean ${data.suggestion.displayName}?`);
        resolvingRef.current = false;
        return;
      }

      const result = data.athlete
        ? submitAthlete(snapshot, data.athlete)
        : rejectTurn(snapshot, "athlete_not_found");
      recordResult(result, playerName, submittedName, data.athlete);
    } catch {
      resolvingRef.current = false;
      setFeedback("The athlete lookup is unavailable. Your turn was not charged.");
    } finally {
      setSubmitting(false);
    }
  }

  function recordResult(
    result: TurnResult,
    playerName: string,
    submittedName: string,
    athlete: LookupAthlete | null,
  ) {
    const valid = result.kind === "valid";
    const detail = valid
      ? `${athlete?.sport ?? "Athlete"}${result.reversed ? " · direction reversed" : ""}`
      : result.kind === "invalid"
        ? reasonLabels[result.reason]
        : "Time expired";
    setHistory((entries) => [
      { id: Date.now(), player: playerName, answer: submittedName, detail, valid },
      ...entries,
    ]);
    setFeedback(valid ? `${athlete?.displayName} is valid. Next letter: ${result.state.requiredLetter}.` : detail);
    setAnswer("");
    setPendingSuggestion(null);
    setSecondsLeft(result.state.turnSeconds);
    setGame(result.state);
  }

  function resetGame() {
    setGame(null);
    setHistory([]);
    setFeedback("");
    setAnswer("");
    setPendingSuggestion(null);
  }

  function acceptSuggestedAthlete() {
    const snapshot = gameRef.current;
    if (
      !snapshot ||
      !pendingSuggestion ||
      snapshot.status === "finished" ||
      snapshot.turnNumber !== pendingSuggestion.turnNumber
    ) {
      setPendingSuggestion(null);
      return;
    }

    resolvingRef.current = true;
    const result = submitAthlete(snapshot, pendingSuggestion.athlete);
    recordResult(
      result,
      pendingSuggestion.playerName,
      pendingSuggestion.athlete.displayName,
      pendingSuggestion.athlete,
    );
  }

  function rejectSuggestedAthlete() {
    setPendingSuggestion(null);
    setFeedback("Edit the name and try again.");
    inputRef.current?.focus();
  }

  const currentPlayerName = game ? game.players[game.currentPlayerIndex].name : null;
  const winnerName = game
    ? game.players.find((player) => player.id === game.winnerId)?.name ?? null
    : null;
  const seedName = game
    ? `${game.seedAthlete.firstName} ${game.seedAthlete.lastName}`
    : null;
  const timerPercent = game ? Math.max(0, (secondsLeft / game.turnSeconds) * 100) : 0;

  return (
    <GameClientView
      answer={answer}
      currentPlayerName={currentPlayerName}
      feedback={feedback}
      game={game}
      history={history}
      inputRef={inputRef}
      lives={lives}
      playerNames={playerNames}
      seedName={seedName}
      secondsLeft={secondsLeft}
      submitting={submitting}
      timerPercent={timerPercent}
      turnSeconds={turnSeconds}
      winnerName={winnerName}
      onAddPlayer={addPlayer}
      onAnswerChange={(value) => {
        setAnswer(value);
        setPendingSuggestion(null);
      }}
      onAcceptSuggestion={acceptSuggestedAthlete}
      onLivesChange={setLives}
      onPlayerChange={updatePlayer}
      onQuickTest={startQuickTest}
      onRejectSuggestion={rejectSuggestedAthlete}
      onRemovePlayer={removePlayer}
      onResetGame={resetGame}
      onStartGame={startGame}
      onSubmitAnswer={handleSubmit}
      pendingSuggestionName={pendingSuggestion?.athlete.displayName ?? null}
      onTurnSecondsChange={setTurnSeconds}
    />
  );
}
