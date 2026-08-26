import { describe, expect, it } from "vitest";
import { evaluateSelectedMove, prepareEvalScenario } from "./evaluator";
import type { EvalScenario } from "./types";

const source = {
  name: "Test fixture",
  url: "https://example.com",
  method: "Hand-verified test scenario",
};

function scenario(
  overrides: Partial<EvalScenario> = {},
): EvalScenario {
  return {
    id: "win-in-one",
    name: "Win in one",
    category: "win",
    description: "The agent has one immediate winning move.",
    moveHistory: [6, 0, 6, 1, 5, 2, 5],
    goldenMoves: [3],
    source,
    ...overrides,
  };
}

describe("evaluation scenarios", () => {
  it("reconstructs a valid agent-to-move position", () => {
    const prepared = prepareEvalScenario(scenario());

    expect(prepared.state.currentPlayer).toBe(2);
    expect(prepared.state.version).toBe(7);
  });

  it("accepts any move in a multi-move golden set", () => {
    const fixture = scenario({ goldenMoves: [2, 3] });

    expect(evaluateSelectedMove(fixture, 2)).toBe(true);
    expect(evaluateSelectedMove(fixture, 3)).toBe(true);
    expect(evaluateSelectedMove(fixture, 4)).toBe(false);
  });

  it("rejects positions where the human is to move", () => {
    expect(() =>
      prepareEvalScenario(scenario({ moveHistory: [3, 2] })),
    ).toThrow(/does not have the agent to move/);
  });

  it("rejects illegal golden moves", () => {
    expect(() =>
      prepareEvalScenario(
        scenario({
          moveHistory: [0, 0, 0, 0, 0, 0, 1],
          goldenMoves: [0],
        }),
      ),
    ).toThrow(/illegal move/);
  });

  it("rejects golden moves that disagree with exact solver scores", () => {
    expect(() =>
      prepareEvalScenario(
        scenario({
          goldenMoves: [4],
          solverScores: [-2, -1, 0, 1, 0, -1, -2],
        }),
      ),
    ).toThrow(/does not match the solver scores/);
  });
});
