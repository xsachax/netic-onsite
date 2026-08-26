import { describe, expect, it } from "vitest";
import {
  EVAL_DATASET_VERSION,
  EVAL_SCENARIOS,
  findEvalScenario,
} from "./dataset";
import { prepareEvalScenario } from "./evaluator";

describe("golden evaluation dataset", () => {
  it("contains valid, unique, solver-backed scenarios", () => {
    expect(EVAL_DATASET_VERSION).toMatch(/^pons-golden-v\d+$/);
    expect(EVAL_SCENARIOS).toHaveLength(28);
    expect(new Set(EVAL_SCENARIOS.map(({ id }) => id)).size).toBe(
      EVAL_SCENARIOS.length,
    );

    for (const scenario of EVAL_SCENARIOS) {
      expect(() => prepareEvalScenario(scenario)).not.toThrow();
      expect(scenario.solverScores).toHaveLength(7);
      expect(scenario.source.url).toContain("connect4.gamesolver.org/solve");
    }
  });

  it("supports looking up a scenario by its stable id", () => {
    expect(findEvalScenario("mandatory-midgame-block")?.category).toBe("block");
    expect(findEvalScenario("missing")).toBeUndefined();
  });

  it("retains multiple equally optimal golden moves", () => {
    expect(findEvalScenario("equivalent-winning-lines")?.goldenMoves).toEqual([
      2, 3,
    ]);
  });
});
