import { describe, expect, it } from "vitest";
import { InvalidGameHistoryError, replayGame } from "./history";

describe("game history replay", () => {
  it("reconstructs authoritative state from columns", () => {
    const state = replayGame([3, 2, 3]);

    expect(state.version).toBe(3);
    expect(state.currentPlayer).toBe(2);
    expect(state.board[5][3]).toBe(1);
    expect(state.board[4][3]).toBe(1);
    expect(state.board[5][2]).toBe(2);
  });

  it("rejects histories that continue after a win", () => {
    expect(() => replayGame([0, 1, 0, 1, 0, 1, 0, 2])).toThrowError(
      expect.objectContaining({
        moveIndex: 7,
      }),
    );
  });

  it("rejects histories containing a move in a full column", () => {
    expect(() => replayGame([0, 0, 0, 0, 0, 0, 0])).toThrowError(
      InvalidGameHistoryError,
    );
  });
});
