"use client";

import { useEffect, useMemo, useState } from "react";
import {
  evalOverviewSchema,
  evalRunResponseSchema,
  type EvalOverviewContract,
  type EvalRunContract,
  type EvalScenarioContract,
} from "@/evals";
import { replayGame } from "@/game/history";
import { AppNav } from "../components/app-nav";

export default function EvaluationsPage() {
  const [overview, setOverview] = useState<EvalOverviewContract | null>(null);
  const [activeRun, setActiveRun] = useState<EvalRunContract | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const isRunning = runningScenarioId !== null;
  const resultByScenario = useMemo(
    () =>
      new Map(
        activeRun?.results.map((result) => [result.scenarioId, result]) ?? [],
      ),
    [activeRun],
  );

  useEffect(() => {
    let active = true;

    async function hydrate(): Promise<void> {
      const nextOverview = await loadOverview();
      if (!active) return;

      setOverview(nextOverview);
      setSelectedIds(nextOverview.scenarios.map((scenario) => scenario.id));
      setActiveRun(nextOverview.recentRuns[0] ?? null);
    }

    void hydrate().catch((loadError) => {
      if (active) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Evaluations could not be loaded.",
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function startRun(): Promise<void> {
    if (selectedIds.length === 0 || isRunning) return;

    setError(null);
    setRunningScenarioId("creating");

    try {
      let run = await createRun({
        scenarioIds: selectedIds,
        provider,
        difficulty,
      });
      setActiveRun(run);

      for (const scenarioId of run.scenarioIds) {
        if (run.results.some((result) => result.scenarioId === scenarioId)) {
          continue;
        }

        setRunningScenarioId(scenarioId);
        run = await executeCase(run.id, scenarioId);
        setActiveRun(run);
      }

      setOverview(await loadOverview());
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The evaluation run could not be completed.",
      );
    } finally {
      setRunningScenarioId(null);
    }
  }

  function toggleScenario(scenarioId: string): void {
    setSelectedIds((current) =>
      current.includes(scenarioId)
        ? current.filter((id) => id !== scenarioId)
        : [...current, scenarioId],
    );
  }

  return (
    <main className="app-shell eval-shell">
      <AppNav />

      <header className="eval-hero">
        <div>
          <p className="eyebrow">Golden move benchmark</p>
          <h1>Agent evaluations<span className="title-dot">.</span></h1>
          <p className="subtitle">
            Versioned scenarios, accepted optimal moves, and inspectable model
            decisions.
          </p>
        </div>
        {overview && (
          <div className="dataset-card">
            <span>Dataset</span>
            <strong>{overview.datasetVersion}</strong>
            <small>{overview.scenarios.length} public scenarios</small>
          </div>
        )}
      </header>

      <section className="eval-toolbar">
        <div className="eval-control">
          <span>Provider</span>
          <div className="segmented-control">
            {(["openai", "anthropic"] as const).map((option) => (
              <button
                className={provider === option ? "selected" : ""}
                disabled={isRunning}
                key={option}
                onClick={() => setProvider(option)}
                type="button"
              >
                {option === "openai" ? "OpenAI" : "Anthropic"}
              </button>
            ))}
          </div>
        </div>
        <div className="eval-control">
          <span>Agent policy</span>
          <div className="segmented-control">
            {(["easy", "medium", "hard"] as const).map((option) => (
              <button
                className={difficulty === option ? "selected" : ""}
                disabled={isRunning}
                key={option}
                onClick={() => setDifficulty(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <button
          className="run-eval-button"
          disabled={isRunning || selectedIds.length === 0 || !overview}
          onClick={() => void startRun()}
          type="button"
        >
          {isRunning
            ? `Running ${activeRun?.completedCases ?? 0}/${
                activeRun?.totalCases ?? selectedIds.length
              }`
            : `Run ${selectedIds.length} scenarios`}
        </button>
      </section>

      {activeRun && <RunSummary run={activeRun} />}
      {error && <div className="error-banner">{error}</div>}

      <section className="eval-layout">
        <div className="scenario-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Scenario suite</p>
              <h2>Golden positions</h2>
            </div>
            <button
              disabled={isRunning}
              onClick={() =>
                setSelectedIds(
                  selectedIds.length === overview?.scenarios.length
                    ? []
                    : (overview?.scenarios.map((scenario) => scenario.id) ?? []),
                )
              }
              type="button"
            >
              {selectedIds.length === overview?.scenarios.length
                ? "Clear all"
                : "Select all"}
            </button>
          </div>

          {overview?.scenarios.map((scenario) => (
            <ScenarioCard
              checked={selectedIds.includes(scenario.id)}
              isRunning={runningScenarioId === scenario.id}
              key={scenario.id}
              onToggle={() => toggleScenario(scenario.id)}
              result={resultByScenario.get(scenario.id)}
              scenario={scenario}
            />
          ))}

          {!overview && <ScenarioSkeletons />}
        </div>

        <aside className="run-history">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Persistent history</p>
              <h2>Recent runs</h2>
            </div>
          </div>
          {overview?.recentRuns.map((run) => (
            <button
              className={`history-run${
                activeRun?.id === run.id ? " active" : ""
              }`}
              key={run.id}
              onClick={() => setActiveRun(run)}
              type="button"
            >
              <span
                className={`history-score${
                  run.passRate === 1 ? " perfect" : ""
                }`}
              >
                {Math.round(run.passRate * 100)}%
              </span>
              <div>
                <strong>{run.provider} · {run.difficulty}</strong>
                <small>
                  {run.passedCases}/{run.completedCases} passed ·{" "}
                  {new Date(run.createdAt).toLocaleTimeString()}
                </small>
              </div>
            </button>
          ))}
          {overview?.recentRuns.length === 0 && (
            <p className="empty-history">
              Completed evaluations will remain available here.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}

function RunSummary({ run }: { readonly run: EvalRunContract }) {
  const failed = run.completedCases - run.passedCases;

  return (
    <section className="run-summary">
      <div>
        <span>Pass rate</span>
        <strong>{Math.round(run.passRate * 100)}%</strong>
      </div>
      <div>
        <span>Passed</span>
        <strong className="pass-value">{run.passedCases}</strong>
      </div>
      <div>
        <span>Failed</span>
        <strong className="fail-value">{failed}</strong>
      </div>
      <div>
        <span>Progress</span>
        <strong>{run.completedCases}/{run.totalCases}</strong>
      </div>
      <div>
        <span>Configuration</span>
        <strong>{run.provider} · {run.difficulty}</strong>
      </div>
    </section>
  );
}

function ScenarioCard({
  scenario,
  result,
  checked,
  isRunning,
  onToggle,
}: {
  readonly scenario: EvalScenarioContract;
  readonly result: EvalRunContract["results"][number] | undefined;
  readonly checked: boolean;
  readonly isRunning: boolean;
  readonly onToggle: () => void;
}) {
  const state = replayGame(scenario.moveHistory);
  const status = result
    ? result.passed
      ? "pass"
      : "fail"
    : isRunning
      ? "running"
      : "pending";

  return (
    <article className={`scenario-card ${status}`}>
      <label className="scenario-select">
        <input
          checked={checked}
          disabled={isRunning}
          onChange={onToggle}
          type="checkbox"
        />
        <span />
      </label>

      <MiniBoard board={state.board} />

      <div className="scenario-copy">
        <div>
          <span className="category-badge">{scenario.category}</span>
          <span className={`case-status ${status}`}>
            {status === "running" ? "evaluating" : status}
          </span>
        </div>
        <h3>{scenario.name}</h3>
        <p>{scenario.description}</p>
        <div className="golden-answer">
          <span>Golden</span>
          <strong>
            {scenario.goldenMoves.map((column) => column + 1).join(" or ")}
          </strong>
          {result && (
            <>
              <i />
              <span>Agent</span>
              <strong>
                {result.selectedMove === null ? "error" : result.selectedMove + 1}
              </strong>
            </>
          )}
        </div>
        {result?.explanation && <q>{result.explanation}</q>}
        {result?.error && <p className="case-error">{result.error}</p>}
      </div>

      <div className="scenario-meta">
        <a href={scenario.source.url}>{scenario.source.name}</a>
        {result?.trace && (
          <>
            <span>{Math.round(result.trace.latencyMs)} ms</span>
            <span>{result.trace.strategy}</span>
          </>
        )}
      </div>
    </article>
  );
}

function MiniBoard({
  board,
}: {
  readonly board: readonly (readonly (0 | 1 | 2)[])[];
}) {
  return (
    <div className="mini-board" aria-label="Scenario board">
      {board.flatMap((row, rowIndex) =>
        row.map((cell, column) => (
          <span
            className={`mini-piece mini-piece-${cell}`}
            key={`${rowIndex}-${column}`}
          />
        )),
      )}
    </div>
  );
}

function ScenarioSkeletons() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div className="scenario-skeleton" key={index} />
      ))}
    </>
  );
}

async function loadOverview(): Promise<EvalOverviewContract> {
  const response = await fetch("/api/evals");
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return evalOverviewSchema.parse(payload);
}

async function createRun(input: {
  readonly scenarioIds: readonly string[];
  readonly provider: "openai" | "anthropic";
  readonly difficulty: "easy" | "medium" | "hard";
}): Promise<EvalRunContract> {
  const response = await fetch("/api/evals/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return evalRunResponseSchema.parse(payload).run;
}

async function executeCase(
  runId: string,
  scenarioId: string,
): Promise<EvalRunContract> {
  const response = await fetch(`/api/evals/runs/${runId}/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return evalRunResponseSchema.parse(payload).run;
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

  return "The evaluation request could not be completed.";
}
