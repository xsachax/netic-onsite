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
  it("accepts a legal typed model action", async () => {
    const decide = vi.fn(async () => modelDecision());
    const decision = await chooseAgentMove({
      state: createGame(2),
      difficulty: "medium",
      model: fakeModel(decide),
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("llm-tools");
    expect(decision.trace.attempts).toBe(1);
  });

  it("retries once after an illegal model action", async () => {
    const state = play([0, 0, 0, 0, 0, 0]);
    const decide = vi
      .fn<(request: ModelDecisionRequest) => Promise<ModelDecision>>()
      .mockResolvedValueOnce(modelDecision({ column: 0 }))
      .mockResolvedValueOnce(modelDecision({ column: 3 }));

    const decision = await chooseAgentMove({
      state,
      difficulty: "medium",
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
      difficulty: "medium",
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
      difficulty: "medium",
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
      difficulty: "medium",
      model: null,
    });

    expect(decision.column).toBe(3);
    expect(decision.trace.strategy).toBe("tactical-guard");
  });
});
