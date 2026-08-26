import { describe, expect, it } from "vitest";
import { applyMove, createGame, type GameState } from "@/domain/connect4";
import { analyzeMoves, inspectMove } from ".";

function play(columns: readonly number[]): GameState {
  return columns.reduce(
    (state, column) => applyMove(state, column),
    createGame(),
  );
}

describe("tactical search", () => {
  it("prefers the center on an empty board", () => {
    const result = analyzeMoves(createGame(), { depth: 3 });

    expect(result.moves[0].column).toBe(3);
    expect(result.nodes).toBeGreaterThan(0);
  });

  it("takes an immediate win", () => {
    const state = play([0, 6, 1, 6, 2, 5]);
    const result = analyzeMoves(state, { depth: 4 });

    expect(result.moves[0]).toMatchObject({
      column: 3,
      category: "immediate-win",
    });
  });

  it("blocks an opponent win in one", () => {
    const state = play([6, 0, 6, 1, 5, 2]);
    const result = analyzeMoves(state, { depth: 4 });

    expect(result.moves[0]).toMatchObject({
      column: 3,
      category: "forced-block",
    });
  });

  it("marks moves that allow an immediate reply as risky", () => {
    const state = play([6, 0, 6, 1, 5, 2]);
    const move = inspectMove(state, 4);

    expect(move?.category).toBe("risky");
    expect(move?.opponentWinningReplies).toContain(3);
  });

  it("only analyzes legal moves", () => {
    const state = play([0, 0, 0, 0, 0, 0]);
    const result = analyzeMoves(state, { depth: 2 });

    expect(result.moves.map(({ column }) => column)).not.toContain(0);
    expect(result.moves).toHaveLength(6);
  });
});
