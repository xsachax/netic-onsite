"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  createGame,
  getLegalMoves,
  type GameState,
  type Position,
} from "@/domain/connect4";
import {
  configResponseSchema,
  agentDecisionSchema,
  turnResponseSchema,
  type AgentDecisionContract,
  type ConfigResponse,
} from "@/game/contracts";
import { replayGame } from "@/game/history";

const STORAGE_KEY = "connect-four-agent-game-v1";

interface StoredGame {
  readonly moves: readonly number[];
  readonly provider: "openai" | "anthropic";
  readonly difficulty: "easy" | "medium" | "hard";
  readonly agentDecision: AgentDecisionContract | null;
}

const storedGameSchema = z.object({
  moves: z.array(z.number().int().min(0).max(6)).max(42),
  provider: z.enum(["openai", "anthropic"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  agentDecision: agentDecisionSchema.nullable(),
});

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [agentDecision, setAgentDecision] =
    useState<AgentDecisionContract | null>(null);
  const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legalMoves = useMemo(() => new Set(getLegalMoves(game)), [game]);

  useEffect(() => {
    let active = true;

    async function hydrate(): Promise<void> {
      const stored = loadStoredGame();
      await Promise.resolve();
      if (!active) return;

      if (stored) {
        setGame(replayGame(stored.moves));
        setProvider(stored.provider);
        setDifficulty(stored.difficulty);
        setAgentDecision(stored.agentDecision);
      }
      setIsHydrated(true);

      try {
        const nextConfig = await loadConfig();
        if (!active) return;
        setConfig(nextConfig);
        if (!stored) {
          setProvider(nextConfig.defaultProvider);
        }
      } catch {
        if (active) {
          setError("Agent configuration could not be loaded.");
        }
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const stored: StoredGame = {
      moves: game.moves.map(({ column }) => column),
      provider,
      difficulty,
      agentDecision,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [agentDecision, difficulty, game, isHydrated, provider]);

  const playColumn = useCallback(
    async (column: number) => {
      if (
        isThinking ||
        game.status !== "playing" ||
        game.currentPlayer !== 1 ||
        !legalMoves.has(column)
      ) {
        return;
      }

      setIsThinking(true);
      setError(null);

      try {
        const response = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moves: game.moves.map((move) => move.column),
            column,
            difficulty,
            provider,
          }),
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(readApiError(payload));
        }

        const result = turnResponseSchema.parse(payload);
        setGame(result.state);
        setAgentDecision(result.agentDecision);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The turn could not be completed.",
        );
      } finally {
        setIsThinking(false);
      }
    },
    [difficulty, game, isThinking, legalMoves, provider],
  );

  function resetGame(): void {
    setGame(createGame());
    setAgentDecision(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const status = statusCopy(game, isThinking);
  const providerAvailable = config?.providers[provider].available ?? false;

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Structured environment agent</p>
          <h1>Connect Four<span className="title-dot">.</span></h1>
          <p className="subtitle">
            Deterministic rules. Tactical search. LLM-guided decisions.
          </p>
        </div>
        <div className="status-card" data-status={game.status}>
          <span className="status-light" />
          <div>
            <span className="status-label">Game status</span>
            <strong>{status.title}</strong>
            <small>{status.detail}</small>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="game-panel">
          <div className="controls">
            <div className="control-group">
              <span>Model</span>
              <div className="segmented-control">
                {(["openai", "anthropic"] as const).map((option) => (
                  <button
                    className={provider === option ? "selected" : ""}
                    key={option}
                    onClick={() => setProvider(option)}
                    type="button"
                  >
                    {option === "openai" ? "OpenAI" : "Anthropic"}
                    {config && !config.providers[option].available && (
                      <span className="unavailable-dot" title="Key not configured" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span>Search depth</span>
              <div className="segmented-control">
                {(["easy", "medium", "hard"] as const).map((option) => (
                  <button
                    className={difficulty === option ? "selected" : ""}
                    key={option}
                    onClick={() => setDifficulty(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <button className="reset-button" onClick={resetGame} type="button">
              New game
            </button>
          </div>

          {!providerAvailable && config && (
            <div className="notice">
              {provider === "openai" ? "OpenAI" : "Anthropic"} is not configured.
              The deterministic search agent will take over transparently.
            </div>
          )}

          <div className="column-hints" aria-hidden="true">
            {Array.from({ length: 7 }, (_, column) => (
              <span key={column}>{column + 1}</span>
            ))}
          </div>

          <div className="board-frame">
            <div
              aria-busy={isThinking}
              aria-label="Connect Four board"
              className="board"
              role="grid"
            >
              {game.board.flatMap((row, rowIndex) =>
                row.map((cell, column) => {
                  const isWinner = includesPosition(
                    game.winningLine,
                    rowIndex,
                    column,
                  );
                  const disabled =
                    isThinking ||
                    game.status !== "playing" ||
                    !legalMoves.has(column);

                  return (
                    <button
                      aria-label={
                        cell === 0
                          ? `Play column ${column + 1}`
                          : `Row ${rowIndex + 1}, column ${column + 1}: ${
                              cell === 1 ? "human" : "agent"
                            } piece`
                      }
                      className="slot"
                      disabled={disabled}
                      key={`${rowIndex}-${column}`}
                      onClick={() => void playColumn(column)}
                      role="gridcell"
                      type="button"
                    >
                      <span
                        className={`piece piece-${cell}${
                          isWinner ? " winning-piece" : ""
                        }`}
                      />
                    </button>
                  );
                }),
              )}
            </div>
          </div>

          <div className="legend">
            <span><i className="legend-piece human" />You</span>
            <span><i className="legend-piece agent" />Agent</span>
            <span className="move-counter">{game.moves.length} / 42 moves</span>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <aside className="inspector">
          <div className="inspector-heading">
            <div>
              <p className="eyebrow">Decision inspector</p>
              <h2>Agent trace</h2>
            </div>
            {agentDecision && (
              <span className={`strategy-badge ${agentDecision.trace.strategy}`}>
                {agentDecision.trace.strategy.replace("-", " ")}
              </span>
            )}
          </div>

          {isThinking ? (
            <ThinkingState />
          ) : agentDecision ? (
            <DecisionInspector decision={agentDecision} />
          ) : (
            <div className="empty-inspector">
              <div className="trace-orbit"><span /></div>
              <h3>No decision yet</h3>
              <p>
                Play a column to see the agent&apos;s search, tools, model usage,
                and final action.
              </p>
            </div>
          )}
        </aside>
      </section>

      <footer>
        <span>State transitions are deterministic and server-validated.</span>
        <a href="https://github.com/xsachax/netic-onsite">
          View architecture on GitHub
        </a>
      </footer>
    </main>
  );
}

function DecisionInspector({
  decision,
}: {
  readonly decision: AgentDecisionContract;
}) {
  const { trace } = decision;

  return (
    <div className="decision">
      <div className="explanation">
        <span>Agent played column {decision.column + 1}</span>
        <p>&ldquo;{decision.explanation}&rdquo;</p>
      </div>

      {trace.fallbackReason && (
        <div className="fallback-note">
          <strong>Degraded gracefully</strong>
          <span>{trace.fallbackReason}</span>
        </div>
      )}

      <div className="metric-grid">
        <Metric label="Search depth" value={String(trace.search.depth)} />
        <Metric label="Nodes explored" value={trace.search.nodes.toLocaleString()} />
        <Metric label="Decision time" value={`${trace.latencyMs} ms`} />
        <Metric
          label="Tokens"
          value={trace.usage.totalTokens?.toLocaleString() ?? "n/a"}
        />
      </div>

      <div className="rankings">
        <h3>Ranked candidates</h3>
        {trace.search.topMoves.map((move, index) => (
          <div className="ranked-move" key={move.column}>
            <span className="rank">{index + 1}</span>
            <div>
              <strong>Column {move.column + 1}</strong>
              <small>{move.category.replace("-", " ")}</small>
            </div>
            <code>{formatScore(move.score)}</code>
          </div>
        ))}
      </div>

      <details>
        <summary>Raw execution trace</summary>
        <pre>
          {JSON.stringify(
            {
              id: trace.id,
              strategy: trace.strategy,
              provider: trace.provider,
              model: trace.model,
              legalMoves: trace.legalMoves,
              attempts: trace.attempts,
              tools: trace.toolCalls,
              usage: trace.usage,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function ThinkingState() {
  return (
    <div className="thinking">
      <div className="thinking-grid">
        {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
      </div>
      <h3>Agent is reasoning</h3>
      <p>Inspecting legal moves and running bounded tactical search…</p>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusCopy(game: GameState, thinking: boolean) {
  if (thinking) {
    return { title: "Agent thinking", detail: "Tool loop in progress" };
  }
  if (game.status === "won") {
    return game.winner === 1
      ? { title: "You won", detail: "Four connected" }
      : { title: "Agent won", detail: "Four connected" };
  }
  if (game.status === "draw") {
    return { title: "Draw", detail: "The board is full" };
  }

  return { title: "Your turn", detail: "Choose any open column" };
}

function includesPosition(
  line: readonly Position[] | null,
  row: number,
  column: number,
): boolean {
  return line?.some((position) => position.row === row && position.column === column) ?? false;
}

function formatScore(score: number): string {
  if (score >= 1_000_000) return "WIN";
  if (score <= -1_000_000) return "LOSS";
  return score > 0 ? `+${score}` : String(score);
}

async function loadConfig(): Promise<ConfigResponse> {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Agent configuration could not be loaded.");
  }

  return configResponseSchema.parse(await response.json());
}

function loadStoredGame(): StoredGame | null {
  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    const result = storedGameSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readApiError(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return "The turn could not be completed.";
}
