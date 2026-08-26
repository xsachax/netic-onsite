import { describe, expect, it, vi } from "vitest";
import { applyMove, createGame, type GameState } from "@/domain/connect4";
import { chooseAgentMove } from "./orchestrator";
import type {
  AgentDecisionModel,
  ModelDecision,
  ModelDecisionRequest,
} from "./types";

const modelDecision = (
  overrides: Partial<ModelDecision> = {},
): ModelDecision => ({
  column: 3,
  explanation: "The center creates the most future connections.",
  toolCalls: [],
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  ...overrides,
});

function play(columns: readonly number[]): GameState {
  return columns.reduce(
    (state, column) => applyMove(state, column),
    createGame(),
  );
}

function fakeModel(
  decide: (request: ModelDecisionRequest) => Promise<ModelDecision>,
): AgentDecisionModel {
  return {
    provider: "openai",
    model: "test-model",
    decide,
  };
}

describe("agent orchestrator", () => {
  it("accepts an admissible typed model action", async () => {
    const decide = vi.fn(async (_request: ModelDecisionRequest) =>
      modelDecision(),
    );
    const decision = await chooseAgentMove({
      state: createGame(2),
      model: fakeModel(decide),
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("llm-tools");
    expect(decision.trace.attempts).toBe(1);
    expect(decide.mock.calls[0][0].admissibleColumns).toEqual([3]);
    expect(decide.mock.calls[0][0].rankedMoves[0].column).toBe(3);
  });

  it("rejects a legal lower-ranked move and accepts a corrected top move", async () => {
    const decide = vi
      .fn<(request: ModelDecisionRequest) => Promise<ModelDecision>>()
      .mockResolvedValueOnce(modelDecision({ column: 0 }))
      .mockResolvedValueOnce(modelDecision({ column: 3 }));

    const decision = await chooseAgentMove({
      state: createGame(2),
      model: fakeModel(decide),
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("llm-tools");
    expect(decision.trace.attempts).toBe(2);
    expect(decision.trace.usage.totalTokens).toBe(240);
    expect(decide.mock.calls[1][0].validationFeedback).toContain(
      "legal but search selected column 3",
    );
    expect(decide.mock.calls[1][0].admissibleColumns).toEqual([3]);
  });

  it("keeps a clear best move at the fixed depth of six", async () => {
    const decide = vi.fn(async (request: ModelDecisionRequest) =>
      modelDecision({ column: request.admissibleColumns[0] }),
    );

    await chooseAgentMove({
      state: play([1]),
      model: fakeModel(decide),
    });

    expect(decide.mock.calls[0][0].searchDepth).toBe(6);
    expect(decide.mock.calls[0][0].rankedMoves).toHaveLength(7);
    expect(decide.mock.calls[0][0].admissibleColumns).toEqual([3]);
  });

  it("selectively refines close candidates at depth seven", async () => {
    const decide = vi.fn(async (request: ModelDecisionRequest) =>
      modelDecision({ column: request.admissibleColumns[0] }),
    );

    const decision = await chooseAgentMove({
      state: play([0]),
      model: fakeModel(decide),
    });
    const request = decide.mock.calls[0][0];

    expect(request.searchDepth).toBe(7);
    expect(request.rankedMoves.map(({ column }) => column)).toEqual([3, 1]);
    expect(request.admissibleColumns).toEqual([3]);
    expect(decision.column).toBe(3);
  });

  it("falls back to the first top-ranked move after repeated rejection", async () => {
    const decide = vi.fn(async () => modelDecision({ column: 0 }));

    const decision = await chooseAgentMove({
      state: createGame(2),
      model: fakeModel(decide),
    });

    expect(decide).toHaveBeenCalledTimes(2);
    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("search-fallback");
    expect(decision.trace.attempts).toBe(2);
    expect(decision.trace.usage.totalTokens).toBe(240);
    expect(decision.trace.fallbackReason).toContain("search move twice");
  });

  it("retries once after an illegal model action", async () => {
    const state = play([0, 0, 0, 0, 0, 0]);
    const decide = vi
      .fn<(request: ModelDecisionRequest) => Promise<ModelDecision>>()
      .mockResolvedValueOnce(modelDecision({ column: 0 }))
      .mockResolvedValueOnce(modelDecision({ column: 3 }));

    const decision = await chooseAgentMove({
      state,
      model: fakeModel(decide),
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.attempts).toBe(2);
    expect(decide.mock.calls[1][0].validationFeedback).toContain("illegal");
  });

  it("uses explicit search fallback on provider failure", async () => {
    const model = fakeModel(async () => {
      throw new Error("provider unavailable");
    });
    const decision = await chooseAgentMove({
      state: createGame(2),
      model,
    });

    expect(decision.trace.strategy).toBe("search-fallback");
    expect(decision.trace.fallbackReason).toContain("failed");
    expect(decision.trace.legalMoves).toContain(decision.column);
  });

  it("uses a deterministic guard for an immediate win", async () => {
    const state = play([0, 6, 1, 6, 2, 5]);
    const decide = vi.fn(async () => modelDecision({ column: 4 }));

    const decision = await chooseAgentMove({
      state,
      model: fakeModel(decide),
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("tactical-guard");
    expect(decide).not.toHaveBeenCalled();
  });

  it("uses a deterministic guard for a forced block", async () => {
    const state = play([6, 0, 6, 1, 5, 2]);
    const decision = await chooseAgentMove({
      state,
      model: null,
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("tactical-guard");
  });
});
