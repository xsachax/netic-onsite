import { getLegalMoves, type GameState } from "@/domain/connect4";
import { analyzeMoves } from "./search";
import type {
  AgentDecision,
  AgentDecisionModel,
  AgentStrategy,
  AgentToolCall,
  AgentUsage,
  ModelDecision,
} from "./types";

const BASE_SEARCH_DEPTH = 6;
const EXTENDED_SEARCH_DEPTH = 7;
const CLOSE_SCORE_MARGIN = 12;
export const AGENT_POLICY_VERSION = "d6-selective-d7-margin12-v1";

const EMPTY_USAGE: AgentUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
};

export async function chooseAgentMove(options: {
  readonly state: GameState;
  readonly model: AgentDecisionModel | null;
}): Promise<AgentDecision> {
  const startedAt = performance.now();
  const { state, model } = options;
  const legalMoves = getLegalMoves(state);

  if (state.status !== "playing" || legalMoves.length === 0) {
    throw new Error("The agent cannot move in a terminal game.");
  }

  const search = rankMoves(state);
  const admissibleColumns: readonly [number] = [search.moves[0].column];
  const tacticalMove = search.moves.find(
    ({ category }) =>
      category === "immediate-win" || category === "forced-block",
  );

  if (tacticalMove) {
    return buildDecision({
      column: tacticalMove.column,
      explanation:
        tacticalMove.category === "immediate-win"
          ? `Column ${tacticalMove.column + 1} completes a winning line.`
          : `Column ${tacticalMove.column + 1} blocks your immediate threat.`,
      strategy: "tactical-guard",
      state,
      search,
      model,
      toolCalls: [],
      attempts: 0,
      usage: EMPTY_USAGE,
      startedAt,
      fallbackReason: null,
    });
  }

  if (model === null) {
    return searchFallback({
      reason: "No model API key is configured.",
      state,
      search,
      model,
      toolCalls: [],
      attempts: 0,
      usage: EMPTY_USAGE,
      startedAt,
    });
  }

  const toolCalls: AgentToolCall[] = [];
  let usage = EMPTY_USAGE;
  let validationFeedback: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let decision: ModelDecision;

    try {
      decision = await model.decide({
        state,
        searchDepth: search.depth,
        rankedMoves: search.moves,
        admissibleColumns,
        validationFeedback,
      });
    } catch {
      return searchFallback({
        reason: "The model request failed or timed out.",
        state,
        search,
        model,
        toolCalls,
        attempts: attempt,
        usage,
        startedAt,
      });
    }

    toolCalls.push(...decision.toolCalls);
    usage = addUsage(usage, decision.usage);

    if (
      legalMoves.includes(decision.column) &&
      admissibleColumns.includes(decision.column)
    ) {
      return buildDecision({
        column: decision.column,
        explanation: decision.explanation,
        strategy: "llm-tools",
        state,
        search,
        model,
        toolCalls,
        attempts: attempt,
        usage,
        startedAt,
        fallbackReason: null,
      });
    }

    validationFeedback = legalMoves.includes(decision.column)
      ? `Column ${decision.column} is legal but search selected column ${admissibleColumns[0]}. Choose column ${admissibleColumns[0]}.`
      : `Column ${decision.column} is illegal. Legal columns: ${legalMoves.join(
          ", ",
        )}. Search selected column ${admissibleColumns[0]}.`;
  }

  return searchFallback({
    reason: "The model rejected the authoritative search move twice.",
    state,
    search,
    model,
    toolCalls,
    attempts: 2,
    usage,
    startedAt,
  });
}

function rankMoves(state: GameState): ReturnType<typeof analyzeMoves> {
  const baseSearch = analyzeMoves(state, { depth: BASE_SEARCH_DEPTH });
  const topScore = baseSearch.moves[0].score;
  const closeColumns = baseSearch.moves
    .filter((move) => topScore - move.score <= CLOSE_SCORE_MARGIN)
    .map((move) => move.column);

  if (closeColumns.length === 1) {
    return baseSearch;
  }

  const refinedSearch = analyzeMoves(state, {
    depth: EXTENDED_SEARCH_DEPTH,
    columns: closeColumns,
  });

  return {
    ...refinedSearch,
    nodes: baseSearch.nodes + refinedSearch.nodes,
    durationMs:
      Math.round((baseSearch.durationMs + refinedSearch.durationMs) * 10) / 10,
  };
}

function searchFallback(options: {
  readonly reason: string;
  readonly state: GameState;
  readonly search: ReturnType<typeof analyzeMoves>;
  readonly model: AgentDecisionModel | null;
  readonly toolCalls: readonly AgentToolCall[];
  readonly attempts: number;
  readonly usage: AgentUsage;
  readonly startedAt: number;
}): AgentDecision {
  const bestMove = options.search.moves[0];

  return buildDecision({
    column: bestMove.column,
    explanation: `Search selected column ${bestMove.column + 1} as the strongest available move.`,
    strategy: "search-fallback",
    fallbackReason: options.reason,
    ...options,
  });
}

function buildDecision(options: {
  readonly column: number;
  readonly explanation: string;
  readonly strategy: AgentStrategy;
  readonly state: GameState;
  readonly search: ReturnType<typeof analyzeMoves>;
  readonly model: AgentDecisionModel | null;
  readonly toolCalls: readonly AgentToolCall[];
  readonly attempts: number;
  readonly usage: AgentUsage;
  readonly startedAt: number;
  readonly fallbackReason: string | null;
}): AgentDecision {
  return {
    column: options.column,
    explanation: options.explanation,
    trace: {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      strategy: options.strategy,
      provider: options.model?.provider ?? null,
      model: options.model?.model ?? null,
      gameVersion: options.state.version,
      legalMoves: getLegalMoves(options.state),
      search: {
        depth: options.search.depth,
        nodes: options.search.nodes,
        durationMs: options.search.durationMs,
        topMoves: options.search.moves.slice(0, 3),
      },
      toolCalls: options.toolCalls,
      attempts: options.attempts,
      usage: options.usage,
      latencyMs:
        Math.round((performance.now() - options.startedAt) * 10) / 10,
      fallbackReason: options.fallbackReason,
    },
  };
}

function addUsage(left: AgentUsage, right: AgentUsage): AgentUsage {
  return {
    inputTokens: addNullable(left.inputTokens, right.inputTokens),
    outputTokens: addNullable(left.outputTokens, right.outputTokens),
    totalTokens: addNullable(left.totalTokens, right.totalTokens),
  };
}

function addNullable(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null && right === null) {
    return null;
  }

  return (left ?? 0) + (right ?? 0);
}
