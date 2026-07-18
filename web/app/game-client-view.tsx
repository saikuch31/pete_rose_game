import { type FormEvent, useId, type RefObject } from "react";

import type { GameState } from "@/lib/game-engine";

export type HistoryEntry = {
  id: number;
  player: string;
  answer: string;
  detail: string;
  valid: boolean;
};

type GameClientViewProps = {
  answer: string;
  currentPlayerName: string | null;
  feedback: string;
  game: GameState | null;
  history: HistoryEntry[];
  inputRef: RefObject<HTMLInputElement | null>;
  lives: number;
  onAcceptSuggestion: () => void;
  playerNames: string[];
  pendingSuggestionName: string | null;
  onRejectSuggestion: () => void;
  seedName: string | null;
  secondsLeft: number;
  submitting: boolean;
  timerPercent: number;
  turnSeconds: number;
  winnerName: string | null;
  onAddPlayer: () => void;
  onAnswerChange: (value: string) => void;
  onLivesChange: (value: number) => void;
  onPlayerChange: (index: number, value: string) => void;
  onQuickTest: () => void;
  onRemovePlayer: (index: number) => void;
  onResetGame: () => void;
  onStartGame: (event: FormEvent) => void;
  onSubmitAnswer: (event: FormEvent) => void;
  onTurnSecondsChange: (value: number) => void;
};

function CornerLogo() {
  const pathId = useId().replaceAll(":", "");

  return (
    <div className="corner-logo" aria-label="Sai Kuchulakanti">
      <svg viewBox="0 0 220 220" role="img" aria-hidden="true">
        <defs>
          <path
            id={pathId}
            d="M110 110 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0"
          />
        </defs>
        <circle cx="110" cy="110" r="51" />
        <text>
          <textPath href={`#${pathId}`}>sai kuchulakanti</textPath>
        </text>
      </svg>
    </div>
  );
}

export default function GameClientView({
  answer,
  currentPlayerName,
  feedback,
  game,
  history,
  inputRef,
  lives,
  onAcceptSuggestion,
  playerNames,
  pendingSuggestionName,
  onRejectSuggestion,
  seedName,
  secondsLeft,
  submitting,
  timerPercent,
  turnSeconds,
  winnerName,
  onAddPlayer,
  onAnswerChange,
  onLivesChange,
  onPlayerChange,
  onQuickTest,
  onRemovePlayer,
  onResetGame,
  onStartGame,
  onSubmitAnswer,
  onTurnSecondsChange,
}: GameClientViewProps) {
  if (!game) {
    return (
      <main className="setup-shell">
        <CornerLogo />
        <section className="intro-panel">
          <p className="eyebrow">name game</p>
          <h1>How much ball do you know?</h1>
          <p className="intro-copy">
            Start with an athlete. Their last name sets the first letter of the next athlete.
          </p>
          <div className="chain-preview" aria-label="Example play sequence">
            <p>for example</p>
            <span>Pete Rose</span>
            <i>R</i>
            <span>Rasheed Wallace</span>
            <i>W</i>
            <span>Walter Payton</span>
          </div>
        </section>

        <section className="setup-card">
          <p className="step-label">game setup</p>
          <h2>Players</h2>
          <form onSubmit={onStartGame}>
            <div className="player-inputs">
              {playerNames.map((name, index) => (
                <div className="player-row" key={index}>
                  <span>{index + 1}</span>
                  <input
                    aria-label={`Player ${index + 1} name`}
                    value={name}
                    onChange={(event) => onPlayerChange(index, event.target.value)}
                    maxLength={24}
                    placeholder="add name here"
                  />
                  {playerNames.length > 2 && (
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => onRemovePlayer(index)}
                      aria-label={`Remove ${name || `player ${index + 1}`}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="add-button"
              type="button"
              onClick={onAddPlayer}
              disabled={playerNames.length >= 8}
            >
              + Add player
            </button>
            <div className="settings-row">
              <label>
                Lives
                <select value={lives} onChange={(event) => onLivesChange(Number(event.target.value))}>
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                  <option>5</option>
                </select>
              </label>
              <label>
                Turn time
                <select
                  value={turnSeconds}
                  onChange={(event) => onTurnSecondsChange(Number(event.target.value))}
                >
                  <option value="15">15 sec</option>
                  <option value="30">30 sec</option>
                  <option value="45">45 sec</option>
                  <option value="60">60 sec</option>
                </select>
              </label>
            </div>
            {feedback && <p className="form-error">{feedback}</p>}
            <button className="primary-button" type="submit">
              Start
              <span>↵</span>
            </button>
            <button className="quick-test-button" type="button" onClick={onQuickTest}>
              Quick test with 2 players
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <CornerLogo />
      <header className="game-header">
        <div className="mini-brand">
          <span>ng</span>
          <strong>{seedName ?? "Pete Rose"}</strong>
        </div>
        <div className="header-meta">
          <span>Turn {game.turnNumber}</span>
          <span>{game.direction === "clockwise" ? "Clockwise" : "Counterclockwise"}</span>
          <button onClick={onResetGame}>New game</button>
        </div>
      </header>

      {game.status === "finished" ? (
        <section className="winner-card">
          <p className="eyebrow">Last player standing</p>
          <div className="trophy">01</div>
          <h1> nice job, {winnerName} </h1>
          <p>you won!</p>
          <button className="primary-button" onClick={onResetGame}>
            Play again
            <span>↵</span>
          </button>
        </section>
      ) : (
        <div className="game-grid">
          <aside className="scoreboard">
            <p className="section-kicker">Players</p>
            {game.players.map((player, index) => (
              <div
                className={`score-row ${index === game.currentPlayerIndex ? "active" : ""} ${player.eliminated ? "eliminated" : ""}`}
                key={player.id}
              >
                <div className="avatar">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <strong>{player.name}</strong>
                  <small>
                    {player.eliminated
                      ? "Eliminated"
                      : index === game.currentPlayerIndex
                        ? "Up now"
                        : "Waiting"}
                  </small>
                </div>
                <div className="lives" aria-label={`${player.lives} lives`}>
                  {Array.from({ length: lives }, (_, heart) => (
                    <span className={heart >= player.lives ? "lost" : ""} key={heart}>
                      ●
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <section className="turn-card">
            <div className="turn-top">
              <div>
                <p className="section-kicker">{currentPlayerName}&apos;s turn</p>
                <p className="prompt">First name must begin with</p>
              </div>
              <div className={`timer ${secondsLeft <= 5 ? "danger" : ""}`}>
                <strong>{secondsLeft}</strong>
                <small>sec</small>
              </div>
            </div>
            <div className="letter-display">{game.requiredLetter}</div>
            <form className="answer-form" onSubmit={onSubmitAnswer}>
              <label htmlFor="athlete-answer">Professional athlete</label>
              <div className="autocomplete">
                <div className="answer-row">
                  <input
                    id="athlete-answer"
                    ref={inputRef}
                    value={answer}
                    onChange={(event) => onAnswerChange(event.target.value)}
                    placeholder={`${game.requiredLetter}...`}
                    autoComplete="off"
                    disabled={submitting || pendingSuggestionName !== null}
                    role="combobox"
                    aria-autocomplete="none"
                    aria-controls="athlete-confirm-dialog"
                    aria-expanded={pendingSuggestionName !== null}
                  />
                  <button
                    type="submit"
                    disabled={!answer.trim() || submitting || pendingSuggestionName !== null}
                  >
                    {submitting ? "Checking" : "Submit"}
                  </button>
                </div>
              </div>
            </form>
            <div className="timer-track" aria-hidden="true">
              <span style={{ width: `${timerPercent}%` }} />
            </div>
            <p className="feedback" aria-live="polite">
              {feedback}
            </p>
          </section>

          <aside className="history-panel">
            <p className="section-kicker">Chain</p>
            <div className="history-list">
              {history.map((entry) => (
                <div className={`history-item ${entry.valid ? "valid" : "invalid"}`} key={entry.id}>
                  <span>{entry.valid ? "✓" : "×"}</span>
                  <div>
                    <strong>{entry.answer}</strong>
                    <small>
                      {entry.player} · {entry.detail}
                    </small>
                  </div>
                </div>
              ))}
              <div className="history-item seed">
                <span>●</span>
                <div>
                  <strong>{seedName ?? "Pete Rose"}</strong>
                  <small>The seed</small>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {pendingSuggestionName && (
        <div className="confirm-overlay" role="presentation">
          <div
            className="confirm-dialog"
            id="athlete-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fuzzy-confirm-title"
          >
            <p className="section-kicker" id="fuzzy-confirm-title">
              Confirm athlete
            </p>
            <h2>Did you mean {pendingSuggestionName}?</h2>
            {/* <p className="confirm-copy">
              Select yes to accept that athlete for this turn, or no to keep editing.
            </p> */}
            <div className="confirm-actions">
              <button type="button" className="confirm-secondary" onClick={onRejectSuggestion}>
                No
              </button>
              <button type="button" className="primary-button" onClick={onAcceptSuggestion}>
                Yes
                <span>↵</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
