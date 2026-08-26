import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AgentProvider,
  AgentTrace,
} from "@/agent";
import { agentDecisionSchema } from "@/game/contracts";
import type { EvalScenario, SearchEvalCaseExecution } from "@/evals";
import { getDatabase } from "./client";

const MAX_PUBLIC_CASES_PER_HOUR = 100;

const evalRunRowSchema = z.object({
  id: z.string().uuid(),
  dataset_version: z.string(),
  policy_version: z.string(),
  benchmark_type: z.enum(["agent", "search"]),
  search_depth: z.coerce.number().int().min(1).max(8).nullable(),
  scenario_ids: z.array(z.string()),
  provider: z.enum(["openai", "anthropic"]).nullable(),
  status: z.enum(["running", "completed"]),
  total_cases: z.coerce.number().int(),
  completed_cases: z.coerce.number().int(),
  passed_cases: z.coerce.number().int(),
  created_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
});

const evalResultRowSchema = z.object({
  scenario_id: z.string(),
  ordinal: z.coerce.number().int(),
  scenario_name: z.string(),
  category: z.string(),
  move_history: z.array(z.coerce.number().int()),
  golden_moves: z.array(z.coerce.number().int()),
  selected_move: z.coerce.number().int().nullable(),
  passed: z.boolean(),
  strategy: z.string().nullable(),
  explanation: z.string().nullable(),
  trace: agentDecisionSchema.shape.trace.nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latency_ms: z.coerce.number().nullable(),
  search_depth: z.coerce.number().int().min(1).max(8).nullable(),
  search_nodes: z.coerce.number().int().nonnegative().nullable(),
  total_tokens: z.coerce.number().int().nullable(),
  error: z.string().nullable(),
  created_at: z.coerce.date(),
});

const countRowSchema = z.object({
  count: z.coerce.number().int(),
});

export interface StoredEvalResult {
  readonly scenarioId: string;
  readonly ordinal: number;
  readonly scenarioName: string;
  readonly category: string;
  readonly moveHistory: readonly number[];
  readonly goldenMoves: readonly number[];
  readonly selectedMove: number | null;
  readonly passed: boolean;
  readonly strategy: string | null;
  readonly explanation: string | null;
  readonly trace: AgentTrace | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly latencyMs: number | null;
  readonly searchDepth: number | null;
  readonly searchNodes: number | null;
  readonly totalTokens: number | null;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface StoredEvalRun {
  readonly id: string;
  readonly datasetVersion: string;
  readonly policyVersion: string;
  readonly benchmarkType: "agent" | "search";
  readonly searchDepth: number | null;
  readonly scenarioIds: readonly string[];
  readonly provider: AgentProvider | null;
  readonly status: "running" | "completed";
  readonly totalCases: number;
  readonly completedCases: number;
  readonly passedCases: number;
  readonly passRate: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly results: readonly StoredEvalResult[];
}

export class EvalRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Evaluation run ${runId} was not found.`);
    this.name = "EvalRunNotFoundError";
  }
}

export class EvalRunLimitError extends Error {
  constructor() {
    super(
      `The public evaluation budget is limited to ${MAX_PUBLIC_CASES_PER_HOUR} cases per hour.`,
    );
    this.name = "EvalRunLimitError";
  }
}

export class EvalScenarioNotInRunError extends Error {
  constructor(runId: string, scenarioId: string) {
    super(`Scenario ${scenarioId} is not part of evaluation run ${runId}.`);
    this.name = "EvalScenarioNotInRunError";
  }
}

export async function createEvalRun(options: {
  readonly datasetVersion: string;
  readonly policyVersion: string;
  readonly searchDepth: number;
  readonly scenarioIds: readonly string[];
}): Promise<StoredEvalRun> {
  const sql = getDatabase();
  const recentRows = await sql`
    SELECT COALESCE(SUM(total_cases), 0)::int AS count
    FROM eval_runs
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `;
  const recentCount = countRowSchema.parse(recentRows[0]).count;
  if (
    recentCount + options.scenarioIds.length >
    MAX_PUBLIC_CASES_PER_HOUR
  ) {
    throw new EvalRunLimitError();
  }

  const id = randomUUID();
  await sql`
    INSERT INTO eval_runs (
      id,
      dataset_version,
      policy_version,
      benchmark_type,
      search_depth,
      scenario_ids,
      provider,
      total_cases
    )
    VALUES (
      ${id},
      ${options.datasetVersion},
      ${options.policyVersion},
      ${"search"},
      ${options.searchDepth},
      ${options.scenarioIds},
      ${null},
      ${options.scenarioIds.length}
    )
  `;

  return getEvalRun(id);
}

export async function getEvalRun(runId: string): Promise<StoredEvalRun> {
  const sql = getDatabase();
  const [runRows, resultRows] = await sql.transaction(
    (transaction) => [
      transaction`
        SELECT
          id,
          dataset_version,
          policy_version,
          benchmark_type,
          search_depth,
          scenario_ids,
          provider,
          status,
          total_cases,
          completed_cases,
          passed_cases,
          created_at,
          completed_at
        FROM eval_runs
        WHERE id = ${runId}::uuid
      `,
      transaction`
        SELECT
          scenario_id,
          ordinal,
          scenario_name,
          category,
          move_history,
          golden_moves,
          selected_move,
          passed,
          strategy,
          explanation,
          trace,
          provider,
          model,
          latency_ms,
          search_depth,
          search_nodes,
          total_tokens,
          error,
          created_at
        FROM eval_results
        WHERE run_id = ${runId}::uuid
        ORDER BY ordinal
      `,
    ],
    { readOnly: true },
  );

  if (runRows.length === 0) {
    throw new EvalRunNotFoundError(runId);
  }

  const run = evalRunRowSchema.parse(runRows[0]);
  const results = resultRows.map((row) => mapEvalResult(row));

  return {
    id: run.id,
    datasetVersion: run.dataset_version,
    policyVersion: run.policy_version,
    benchmarkType: run.benchmark_type,
    searchDepth: run.search_depth,
    scenarioIds: run.scenario_ids,
    provider: run.provider,
    status: run.status,
    totalCases: run.total_cases,
    completedCases: run.completed_cases,
    passedCases: run.passed_cases,
    passRate:
      run.completed_cases === 0 ? 0 : run.passed_cases / run.completed_cases,
    createdAt: run.created_at.toISOString(),
    completedAt: run.completed_at?.toISOString() ?? null,
    results,
  };
}

export async function listEvalRuns(limit = 10): Promise<StoredEvalRun[]> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT id
    FROM eval_runs
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 25))}
  `;

  return Promise.all(
    rows.map((row) =>
      getEvalRun(z.object({ id: z.string().uuid() }).parse(row).id),
    ),
  );
}

export async function recordEvalExecution(options: {
  readonly run: StoredEvalRun;
  readonly ordinal: number;
  readonly execution: SearchEvalCaseExecution;
}): Promise<StoredEvalRun> {
  return recordEvalResult({
    run: options.run,
    ordinal: options.ordinal,
    scenario: options.execution.scenario,
    selectedMove: options.execution.selectedMove,
    passed: options.execution.passed,
    trace: null,
    explanation: null,
    strategy: "search-benchmark",
    latencyMs: options.execution.searchDurationMs,
    searchDepth: options.execution.searchDepth,
    searchNodes: options.execution.searchNodes,
    error: null,
  });
}

export async function recordEvalFailure(options: {
  readonly run: StoredEvalRun;
  readonly ordinal: number;
  readonly scenario: EvalScenario;
  readonly error: string;
}): Promise<StoredEvalRun> {
  return recordEvalResult({
    run: options.run,
    ordinal: options.ordinal,
    scenario: options.scenario,
    selectedMove: null,
    passed: false,
    trace: null,
    explanation: null,
    strategy: null,
    latencyMs: null,
    searchDepth: options.run.searchDepth,
    searchNodes: null,
    error: options.error,
  });
}

async function recordEvalResult(options: {
  readonly run: StoredEvalRun;
  readonly ordinal: number;
  readonly scenario: EvalScenario;
  readonly selectedMove: number | null;
  readonly passed: boolean;
  readonly trace: AgentTrace | null;
  readonly explanation: string | null;
  readonly strategy: string | null;
  readonly latencyMs: number | null;
  readonly searchDepth: number | null;
  readonly searchNodes: number | null;
  readonly error: string | null;
}): Promise<StoredEvalRun> {
  if (!options.run.scenarioIds.includes(options.scenario.id)) {
    throw new EvalScenarioNotInRunError(
      options.run.id,
      options.scenario.id,
    );
  }

  const sql = getDatabase();
  const trace = options.trace ? JSON.stringify(options.trace) : null;
  const rows = await sql`
    WITH inserted_result AS (
      INSERT INTO eval_results (
        run_id,
        scenario_id,
        ordinal,
        scenario_name,
        category,
        move_history,
        golden_moves,
        selected_move,
        passed,
        strategy,
        explanation,
        trace,
        provider,
        model,
        latency_ms,
        search_depth,
        search_nodes,
        total_tokens,
        error
      )
      VALUES (
        ${options.run.id}::uuid,
        ${options.scenario.id},
        ${options.ordinal},
        ${options.scenario.name},
        ${options.scenario.category},
        ${JSON.stringify(options.scenario.moveHistory)}::jsonb,
        ${options.scenario.goldenMoves},
        ${options.selectedMove},
        ${options.passed},
        ${options.strategy},
        ${options.explanation},
        ${trace}::jsonb,
        ${options.trace?.provider ?? null},
        ${options.trace?.model ?? null},
        ${options.latencyMs},
        ${options.searchDepth},
        ${options.searchNodes},
        ${options.trace?.usage.totalTokens ?? null},
        ${options.error}
      )
      ON CONFLICT (run_id, scenario_id) DO NOTHING
      RETURNING run_id
    ),
    updated_run AS (
      UPDATE eval_runs
      SET
        completed_cases = completed_cases + 1,
        passed_cases = passed_cases + ${options.passed ? 1 : 0},
        status = CASE
          WHEN completed_cases + 1 >= total_cases THEN 'completed'
          ELSE 'running'
        END,
        completed_at = CASE
          WHEN completed_cases + 1 >= total_cases THEN NOW()
          ELSE NULL
        END
      WHERE
        id = ${options.run.id}::uuid
        AND EXISTS (SELECT 1 FROM inserted_result)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM updated_run) AS recorded
  `;
  z.object({ recorded: z.boolean() }).parse(rows[0]);

  return getEvalRun(options.run.id);
}

function mapEvalResult(row: unknown): StoredEvalResult {
  const result = evalResultRowSchema.parse(row);

  return {
    scenarioId: result.scenario_id,
    ordinal: result.ordinal,
    scenarioName: result.scenario_name,
    category: result.category,
    moveHistory: result.move_history,
    goldenMoves: result.golden_moves,
    selectedMove: result.selected_move,
    passed: result.passed,
    strategy: result.strategy,
    explanation: result.explanation,
    trace: result.trace,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latency_ms,
    searchDepth: result.search_depth,
    searchNodes: result.search_nodes,
    totalTokens: result.total_tokens,
    error: result.error,
    createdAt: result.created_at.toISOString(),
  };
}
