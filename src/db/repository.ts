import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AgentDecision,
  AgentDifficulty,
  AgentProvider,
} from "@/agent";
import type { GameState, Move } from "@/domain/connect4";
import { agentDecisionSchema } from "@/game/contracts";
import { replayGame } from "@/game/history";
import { getDatabase } from "./client";

const gameRowSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["playing", "won", "draw"]),
  current_player: z.coerce.number().int().min(1).max(2),
  winner: z.coerce.number().int().min(1).max(2).nullable(),
  version: z.coerce.number().int().min(0).max(42),
  difficulty: z.enum(["easy", "medium", "hard"]),
  provider: z.enum(["openai", "anthropic"]),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
});

const moveRowSchema = z.object({
  ply: z.coerce.number().int().min(1).max(42),
  player: z.coerce.number().int().min(1).max(2),
  column_index: z.coerce.number().int().min(0).max(6),
  row_index: z.coerce.number().int().min(0).max(5),
  strategy: z
    .enum(["llm-tools", "tactical-guard", "search-fallback"])
    .nullable(),
  explanation: z.string().nullable(),
  trace: z.unknown().nullable(),
});

const commitRowSchema = z.object({
  committed: z.boolean(),
});

const commandRowSchema = z.object({
  resulting_version: z.coerce.number().int(),
});

const analyticsRowSchema = z.object({
  total_games: z.coerce.number().int(),
  active_games: z.coerce.number().int(),
  completed_games: z.coerce.number().int(),
  human_wins: z.coerce.number().int(),
  agent_wins: z.coerce.number().int(),
  draws: z.coerce.number().int(),
  agent_moves: z.coerce.number().int(),
  llm_moves: z.coerce.number().int(),
  tactical_moves: z.coerce.number().int(),
  fallback_moves: z.coerce.number().int(),
  total_tokens: z.coerce.number(),
  average_latency_ms: z.coerce.number(),
});

const providerAnalyticsRowSchema = z.object({
  provider: z.string(),
  model: z.string(),
  moves: z.coerce.number().int(),
  total_tokens: z.coerce.number(),
  average_latency_ms: z.coerce.number(),
});

export interface PersistentGame {
  readonly id: string;
  readonly state: GameState;
  readonly difficulty: AgentDifficulty;
  readonly provider: AgentProvider;
  readonly latestAgentDecision: AgentDecision | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GameAnalytics {
  readonly totalGames: number;
  readonly activeGames: number;
  readonly completedGames: number;
  readonly humanWins: number;
  readonly agentWins: number;
  readonly draws: number;
  readonly agentMoves: number;
  readonly llmMoves: number;
  readonly tacticalMoves: number;
  readonly fallbackMoves: number;
  readonly fallbackRate: number;
  readonly totalTokens: number;
  readonly averageLatencyMs: number;
  readonly providers: readonly {
    readonly provider: string;
    readonly model: string;
    readonly moves: number;
    readonly totalTokens: number;
    readonly averageLatencyMs: number;
  }[];
}

export class PersistentGameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Game ${gameId} was not found.`);
    this.name = "PersistentGameNotFoundError";
  }
}

export class GameVersionConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Expected game version ${expectedVersion}, but the current version is ${actualVersion}.`,
    );
    this.name = "GameVersionConflictError";
  }
}

export class GameDataIntegrityError extends Error {
  constructor(gameId: string) {
    super(`Stored state for game ${gameId} failed integrity validation.`);
    this.name = "GameDataIntegrityError";
  }
}

export async function createPersistentGame(options?: {
  readonly difficulty?: AgentDifficulty;
  readonly provider?: AgentProvider;
}): Promise<PersistentGame> {
  const sql = getDatabase();
  const id = randomUUID();
  const difficulty = options?.difficulty ?? "medium";
  const provider = options?.provider ?? "openai";

  await sql`
    INSERT INTO games (id, difficulty, provider)
    VALUES (${id}, ${difficulty}, ${provider})
  `;

  return getPersistentGame(id);
}

export async function getPersistentGame(
  gameId: string,
): Promise<PersistentGame> {
  const sql = getDatabase();
  const [gameRows, moveRows] = await sql.transaction(
    (transaction) => [
      transaction`
        SELECT
          id,
          status,
          current_player,
          winner,
          version,
          difficulty,
          provider,
          created_at,
          updated_at,
          completed_at
        FROM games
        WHERE id = ${gameId}::uuid
      `,
      transaction`
        SELECT
          ply,
          player,
          column_index,
          row_index,
          strategy,
          explanation,
          trace
        FROM moves
        WHERE game_id = ${gameId}::uuid
        ORDER BY ply
      `,
    ],
    { readOnly: true },
  );

  if (gameRows.length === 0) {
    throw new PersistentGameNotFoundError(gameId);
  }

  const gameRow = gameRowSchema.parse(gameRows[0]);
  const moves = moveRows.map((row) => moveRowSchema.parse(row));
  const state = replayGame(moves.map((move) => move.column_index));

  if (
    state.version !== gameRow.version ||
    state.status !== gameRow.status ||
    state.currentPlayer !== gameRow.current_player ||
    state.winner !== gameRow.winner
  ) {
    throw new GameDataIntegrityError(gameId);
  }

  const latestAgentMove = moves.findLast((move) => move.player === 2);
  const latestAgentDecision =
    latestAgentMove?.trace && latestAgentMove.explanation
      ? agentDecisionSchema.parse({
          column: latestAgentMove.column_index,
          explanation: latestAgentMove.explanation,
          trace: latestAgentMove.trace,
        })
      : null;

  return {
    id: gameRow.id,
    state,
    difficulty: gameRow.difficulty,
    provider: gameRow.provider,
    latestAgentDecision,
    createdAt: gameRow.created_at.toISOString(),
    updatedAt: gameRow.updated_at.toISOString(),
  };
}

export async function commitPersistentTurn(options: {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly difficulty: AgentDifficulty;
  readonly provider: AgentProvider;
  readonly resultingState: GameState;
  readonly humanMove: Move;
  readonly agentMove: Move | null;
  readonly agentDecision: AgentDecision | null;
}): Promise<{ readonly game: PersistentGame; readonly duplicate: boolean }> {
  const sql = getDatabase();
  const {
    gameId,
    expectedVersion,
    idempotencyKey,
    difficulty,
    provider,
    resultingState,
    humanMove,
    agentMove,
    agentDecision,
  } = options;
  const completedAt =
    resultingState.status === "playing" ? null : new Date().toISOString();
  const trace = agentDecision ? JSON.stringify(agentDecision.trace) : null;
  const modelProvider = agentDecision?.trace.provider ?? null;
  const model = agentDecision?.trace.model ?? null;
  const strategy = agentDecision?.trace.strategy ?? null;
  const explanation = agentDecision?.explanation ?? null;
  const latency = agentDecision?.trace.latencyMs ?? null;
  const inputTokens = agentDecision?.trace.usage.inputTokens ?? null;
  const outputTokens = agentDecision?.trace.usage.outputTokens ?? null;
  const totalTokens = agentDecision?.trace.usage.totalTokens ?? null;

  const rows = await sql`
    WITH updated_game AS (
      UPDATE games
      SET
        status = ${resultingState.status},
        current_player = ${resultingState.currentPlayer},
        winner = ${resultingState.winner},
        version = ${resultingState.version},
        difficulty = ${difficulty},
        provider = ${provider},
        updated_at = NOW(),
        completed_at = ${completedAt}::timestamptz
      WHERE
        id = ${gameId}::uuid
        AND version = ${expectedVersion}
        AND NOT EXISTS (
          SELECT 1
          FROM game_commands
          WHERE
            game_id = ${gameId}::uuid
            AND idempotency_key = ${idempotencyKey}::uuid
        )
      RETURNING id
    ),
    inserted_command AS (
      INSERT INTO game_commands (
        game_id,
        idempotency_key,
        expected_version,
        resulting_version
      )
      SELECT
        id,
        ${idempotencyKey}::uuid,
        ${expectedVersion},
        ${resultingState.version}
      FROM updated_game
      RETURNING game_id
    ),
    inserted_human_move AS (
      INSERT INTO moves (
        game_id,
        ply,
        player,
        column_index,
        row_index
      )
      SELECT
        game_id,
        ${humanMove.number},
        ${humanMove.player},
        ${humanMove.column},
        ${humanMove.row}
      FROM inserted_command
      RETURNING game_id
    ),
    inserted_agent_move AS (
      INSERT INTO moves (
        game_id,
        ply,
        player,
        column_index,
        row_index,
        strategy,
        explanation,
        trace,
        provider,
        model,
        latency_ms,
        input_tokens,
        output_tokens,
        total_tokens
      )
      SELECT
        game_id,
        ${agentMove?.number ?? 0},
        ${agentMove?.player ?? 2},
        ${agentMove?.column ?? 0},
        ${agentMove?.row ?? 0},
        ${strategy},
        ${explanation},
        ${trace}::jsonb,
        ${modelProvider},
        ${model},
        ${latency},
        ${inputTokens},
        ${outputTokens},
        ${totalTokens}
      FROM inserted_human_move
      WHERE ${agentMove !== null}
      RETURNING game_id
    )
    SELECT EXISTS (SELECT 1 FROM inserted_command) AS committed
  `;
  const { committed } = commitRowSchema.parse(rows[0]);

  if (committed) {
    return { game: await getPersistentGame(gameId), duplicate: false };
  }

  const commandRows = await sql`
    SELECT resulting_version
    FROM game_commands
    WHERE
      game_id = ${gameId}::uuid
      AND idempotency_key = ${idempotencyKey}::uuid
  `;

  if (commandRows.length > 0) {
    commandRowSchema.parse(commandRows[0]);
    return { game: await getPersistentGame(gameId), duplicate: true };
  }

  const currentGame = await getPersistentGame(gameId);
  throw new GameVersionConflictError(
    expectedVersion,
    currentGame.state.version,
  );
}

export async function getPersistentCommandResult(
  gameId: string,
  idempotencyKey: string,
): Promise<PersistentGame | null> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT resulting_version
    FROM game_commands
    WHERE
      game_id = ${gameId}::uuid
      AND idempotency_key = ${idempotencyKey}::uuid
  `;

  if (rows.length === 0) {
    return null;
  }

  commandRowSchema.parse(rows[0]);
  return getPersistentGame(gameId);
}

export async function getGameAnalytics(): Promise<GameAnalytics> {
  const sql = getDatabase();
  const [overallRows, providerRows] = await sql.transaction(
    (transaction) => [
      transaction`
        SELECT
          COUNT(*)::int AS total_games,
          COUNT(*) FILTER (WHERE status = 'playing')::int AS active_games,
          COUNT(*) FILTER (WHERE status <> 'playing')::int AS completed_games,
          COUNT(*) FILTER (WHERE winner = 1)::int AS human_wins,
          COUNT(*) FILTER (WHERE winner = 2)::int AS agent_wins,
          COUNT(*) FILTER (WHERE status = 'draw')::int AS draws,
          COALESCE((
            SELECT COUNT(*)::int FROM moves WHERE player = 2
          ), 0) AS agent_moves,
          COALESCE((
            SELECT COUNT(*)::int
            FROM moves
            WHERE player = 2 AND strategy = 'llm-tools'
          ), 0) AS llm_moves,
          COALESCE((
            SELECT COUNT(*)::int
            FROM moves
            WHERE player = 2 AND strategy = 'tactical-guard'
          ), 0) AS tactical_moves,
          COALESCE((
            SELECT COUNT(*)::int
            FROM moves
            WHERE player = 2 AND strategy = 'search-fallback'
          ), 0) AS fallback_moves,
          COALESCE((
            SELECT SUM(total_tokens)::bigint FROM moves WHERE player = 2
          ), 0) AS total_tokens,
          COALESCE((
            SELECT AVG(latency_ms) FROM moves WHERE player = 2
          ), 0) AS average_latency_ms
        FROM games
      `,
      transaction`
        SELECT
          COALESCE(provider, 'deterministic') AS provider,
          COALESCE(model, 'search') AS model,
          COUNT(*)::int AS moves,
          COALESCE(SUM(total_tokens)::bigint, 0) AS total_tokens,
          COALESCE(AVG(latency_ms), 0) AS average_latency_ms
        FROM moves
        WHERE player = 2
        GROUP BY provider, model
        ORDER BY moves DESC
      `,
    ],
    { readOnly: true },
  );
  const overall = analyticsRowSchema.parse(overallRows[0]);
  const providers = providerRows.map((row) =>
    providerAnalyticsRowSchema.parse(row),
  );

  return {
    totalGames: overall.total_games,
    activeGames: overall.active_games,
    completedGames: overall.completed_games,
    humanWins: overall.human_wins,
    agentWins: overall.agent_wins,
    draws: overall.draws,
    agentMoves: overall.agent_moves,
    llmMoves: overall.llm_moves,
    tacticalMoves: overall.tactical_moves,
    fallbackMoves: overall.fallback_moves,
    fallbackRate:
      overall.agent_moves === 0
        ? 0
        : overall.fallback_moves / overall.agent_moves,
    totalTokens: overall.total_tokens,
    averageLatencyMs: Math.round(overall.average_latency_ms * 10) / 10,
    providers: providers.map((row) => ({
      provider: row.provider,
      model: row.model,
      moves: row.moves,
      totalTokens: row.total_tokens,
      averageLatencyMs: Math.round(row.average_latency_ms * 10) / 10,
    })),
  };
}
