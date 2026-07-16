"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

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

type HistoryEntry = {
  id: number;
  player: string;
  answer: string;
  detail: string;
  valid: boolean;
};

type Suggestion = { displayName: string; sport: string };

const reasonLabels: Record<InvalidReason, string> = {
  game_finished: "The game has already finished.",
  athlete_not_found: "That athlete is not in the current catalog.",
  missing_full_name: "Enter both a first and last name.",
  wrong_initial: "The first name starts with the wrong letter.",
  not_professional: "That person is not marked as a professional athlete.",
  nickname_not_allowed: "Nicknames are not allowed.",
  already_used: "That athlete has already been used.",
};

export default function GameClient() {
  const [playerNames, setPlayerNames] = useState(["Player 1", "Player 2"]);
  const [lives, setLives] = useState(3);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [game, setGame] = useState<GameState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(turnSeconds);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const gameRef = useRef<GameState | null>(null);
  const resolvingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!game || game.status === "finished" || !answer.trim()) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: answer, letter: game.requiredLetter });
        const response = await fetch(`/api/athletes/lookup?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
        }
      }
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [answer, game]);

  useEffect(() => {
    if (!game || game.status === "finished") return;
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
      ) return;

      resolvingRef.current = true;
      const playerName = snapshot.players[snapshot.currentPlayerIndex].name;
      const result = timeoutTurn(snapshot);
      setHistory((entries) => [
        { id: Date.now(), player: playerName, answer: "Time expired", detail: "Lost one life", valid: false },
        ...entries,
      ]);
      setFeedback(`${playerName} ran out of time and lost one life.`);
      setSecondsLeft(result.state.turnSeconds);
      setGame(result.state);
      setAnswer("");
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game]);

  function updatePlayer(index: number, value: string) {
    setPlayerNames((names) => names.map((name, position) => (position === index ? value : name)));
  }

  function addPlayer() {
    setPlayerNames((names) => [...names, `Player ${names.length + 1}`]);
  }

  function removePlayer(index: number) {
    setPlayerNames((names) => names.filter((_, position) => position !== index));
  }

  function startGame(event: FormEvent) {
    event.preventDefault();
    try {
      const nextGame = createGame(playerNames, { lives, turnSeconds });
      setGame(nextGame);
      setSecondsLeft(nextGame.turnSeconds);
      setHistory([]);
      setFeedback("Pete Rose sets the opening letter: R.");
      setAnswer("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to start the game.");
    }
  }

  function startQuickTest() {
    const nextGame = createGame(["Player 1", "Player 2"], {
      lives: 3,
      turnSeconds: 30,
    });
    setPlayerNames(["Player 1", "Player 2"]);
    setLives(3);
    setTurnSeconds(30);
    setGame(nextGame);
    setSecondsLeft(30);
    setHistory([]);
    setFeedback("Quick test started. Pete Rose sets the opening letter: R.");
    setAnswer("");
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
        body: JSON.stringify({ name: submittedName }),
      });
      if (!response.ok) throw new Error("Athlete lookup failed.");
      const data = (await response.json()) as { athlete: LookupAthlete | null };
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
    setSuggestions([]);
    setSecondsLeft(result.state.turnSeconds);
    setGame(result.state);
  }

  function resetGame() {
    setGame(null);
    setHistory([]);
    setFeedback("");
    setAnswer("");
  }

  if (!game) {
    return (
      <main className="setup-shell">
        <section className="intro-panel">
          <div className="brand-mark">PR</div>
          <p className="eyebrow">The name-chain elimination game</p>
          <h1>Pete Rose</h1>
          {/* <p className="intro-copy">Name a pro athlete whose first name begins with the last name before it. Miss once, lose a life.</p>
          <div className="chain-preview" aria-label="Example play sequence">
            <span>Pete <b>Rose</b></span><i>R</i><span><b>R</b>asheed Wallace</span><i>W</i><span><b>W</b>alter Payton</span>
          </div> */}
        </section>

        <section className="setup-card">
          <p className="step-label">Game setup</p>
          <h2>Who&apos;s playing?</h2>
          <form onSubmit={startGame}>
            <div className="player-inputs">
              {playerNames.map((name, index) => (
                <div className="player-row" key={index}>
                  <span>{index + 1}</span>
                  <input aria-label={`Player ${index + 1} name`} value={name} onChange={(event) => updatePlayer(index, event.target.value)} maxLength={24} />
                  {playerNames.length > 2 && <button type="button" className="remove-button" onClick={() => removePlayer(index)} aria-label={`Remove ${name}`}>×</button>}
                </div>
              ))}
            </div>
            <button className="add-button" type="button" onClick={addPlayer} disabled={playerNames.length >= 8}>+ Add player</button>
            <div className="settings-row">
              <label>Lives<select value={lives} onChange={(event) => setLives(Number(event.target.value))}><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
              <label>Turn time<select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}><option value="15">15 sec</option><option value="30">30 sec</option><option value="45">45 sec</option><option value="60">60 sec</option></select></label>
            </div>
            {feedback && <p className="form-error">{feedback}</p>}
            <button className="primary-button" type="submit">Start the game <span>→</span></button>
            <button className="quick-test-button" type="button" onClick={startQuickTest}>Quick test with 2 players</button>
          </form>
        </section>
      </main>
    );
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  const winner = game.players.find((player) => player.id === game.winnerId);
  const timerPercent = Math.max(0, (secondsLeft / game.turnSeconds) * 100);

  return (
    <main className="game-shell">
      <header className="game-header"><div className="mini-brand"><span>PR</span><strong>Pete Rose</strong></div><div className="header-meta"><span>Round {game.turnNumber}</span><span>{game.direction === "clockwise" ? "↻ Clockwise" : "↺ Counterclockwise"}</span><button onClick={resetGame}>New game</button></div></header>

      {game.status === "finished" ? (
        <section className="winner-card"><p className="eyebrow">Last player standing</p><div className="trophy">★</div><h1>{winner?.name} wins</h1><p>Strong names. Better memory. The chain ends here.</p><button className="primary-button" onClick={resetGame}>Play again <span>→</span></button></section>
      ) : (
        <div className="game-grid">
          <aside className="scoreboard"><p className="section-kicker">Players</p>{game.players.map((player, index) => <div className={`score-row ${index === game.currentPlayerIndex ? "active" : ""} ${player.eliminated ? "eliminated" : ""}`} key={player.id}><div className="avatar">{player.name.charAt(0).toUpperCase()}</div><div><strong>{player.name}</strong><small>{player.eliminated ? "Eliminated" : index === game.currentPlayerIndex ? "Up now" : "Waiting"}</small></div><div className="lives" aria-label={`${player.lives} lives`}>{Array.from({ length: lives }, (_, heart) => <span className={heart >= player.lives ? "lost" : ""} key={heart}>♥</span>)}</div></div>)}</aside>

          <section className="turn-card">
            <div className="turn-top"><div><p className="section-kicker">{currentPlayer.name}&apos;s turn</p><p className="prompt">Name an athlete starting with</p></div><div className={`timer ${secondsLeft <= 5 ? "danger" : ""}`}><strong>{secondsLeft}</strong><small>seconds</small></div></div>
            <div className="letter-display">{game.requiredLetter}</div>
            <form className="answer-form" onSubmit={handleSubmit}><label htmlFor="athlete-answer">Professional athlete&apos;s full name</label><div className="autocomplete"><div className="answer-row"><input id="athlete-answer" ref={inputRef} value={answer} onChange={(event) => { setAnswer(event.target.value); setSuggestions([]); }} placeholder={`${game.requiredLetter}...`} autoComplete="off" disabled={submitting} role="combobox" aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-controls="athlete-suggestions" /><button type="submit" disabled={!answer.trim() || submitting}>{submitting ? "Checking…" : "Lock it in"}</button></div>{suggestions.length > 0 && <div className="suggestions" id="athlete-suggestions" role="listbox">{suggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.displayName} onClick={() => { setAnswer(suggestion.displayName); setSuggestions([]); inputRef.current?.focus(); }}><strong>{suggestion.displayName}</strong><span>{suggestion.sport}</span></button>)}</div>}</div></form>
            <div className="timer-track"><span style={{ width: `${timerPercent}%` }} /></div>
            <p className="feedback" aria-live="polite">{feedback}</p>
          </section>

          <aside className="history-panel"><p className="section-kicker">Name chain</p><div className="history-list">{history.map((entry) => <div className={`history-item ${entry.valid ? "valid" : "invalid"}`} key={entry.id}><span>{entry.valid ? "✓" : "×"}</span><div><strong>{entry.answer}</strong><small>{entry.player} · {entry.detail}</small></div></div>)}<div className="history-item seed"><span>●</span><div><strong>Pete Rose</strong><small>The seed · Baseball</small></div></div></div></aside>
        </div>
      )}
    </main>
  );
}
