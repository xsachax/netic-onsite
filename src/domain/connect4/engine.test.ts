import { describe, expect, it } from "vitest";
import {
  applyMove,
  createGame,
  getLegalMoves,
  type GameState,
  type Player,
} from ".";

function play(columns: readonly number[], startingPlayer: Player = 1): GameState {
  return columns.reduce(
    (state, column) => applyMove(state, column),
    createGame(startingPlayer),
  );
}

describe("Connect 4 engine", () => {
  it("creates an empty 6x7 game", () => {
    const game = createGame();

    expect(game.board).toHaveLength(6);
    expect(game.board.every((row) => row.length === 7)).toBe(true);
    expect(game.board.flat().every((cell) => cell === 0)).toBe(true);
    expect(game.currentPlayer).toBe(1);
    expect(game.status).toBe("playing");
    expect(game.version).toBe(0);
  });

  it("drops pieces with gravity and records immutable move history", () => {
    const initial = createGame();
    const afterFirst = applyMove(initial, 3);
    const afterSecond = applyMove(afterFirst, 3);

    expect(initial.board[5][3]).toBe(0);
    expect(afterSecond.board[5][3]).toBe(1);
    expect(afterSecond.board[4][3]).toBe(2);
    expect(afterSecond.moves).toEqual([
      { number: 1, player: 1, row: 5, column: 3 },
      { number: 2, player: 2, row: 4, column: 3 },
    ]);
    expect(afterSecond.version).toBe(2);
  });

  it("reports legal columns and excludes a full column", () => {
    const game = play([0, 0, 0, 0, 0, 0]);

    expect(getLegalMoves(game)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([-1, 7, 1.5, Number.NaN])(
    "rejects invalid column %s",
    (column) => {
      expect(() => applyMove(createGame(), column)).toThrowError(
        expect.objectContaining({ code: "INVALID_COLUMN" }),
      );
    },
  );

  it("rejects a move in a full column", () => {
    const game = play([0, 0, 0, 0, 0, 0]);

    expect(() => applyMove(game, 0)).toThrowError(
      expect.objectContaining({ code: "COLUMN_FULL" }),
    );
  });

  it("rejects a player moving out of turn", () => {
    expect(() => applyMove(createGame(), 0, 2)).toThrowError(
      expect.objectContaining({ code: "WRONG_TURN" }),
    );
  });

  it("detects a horizontal win", () => {
    const game = play([0, 0, 1, 1, 2, 2, 3]);

    expect(game.status).toBe("won");
    expect(game.winner).toBe(1);
    expect(game.winningLine).toEqual([
      { row: 5, column: 0 },
      { row: 5, column: 1 },
      { row: 5, column: 2 },
      { row: 5, column: 3 },
    ]);
  });

  it("detects a vertical win", () => {
    const game = play([0, 1, 0, 1, 0, 1, 0]);

    expect(game.status).toBe("won");
    expect(game.winner).toBe(1);
  });

  it("detects a rising diagonal win", () => {
    const game = play([0, 1, 1, 2, 3, 2, 2, 3, 4, 3, 3]);

    expect(game.status).toBe("won");
    expect(game.winner).toBe(1);
    expect(game.winningLine).toEqual([
      { row: 2, column: 3 },
      { row: 3, column: 2 },
      { row: 4, column: 1 },
      { row: 5, column: 0 },
    ]);
  });

  it("detects a falling diagonal win", () => {
    const game = play([3, 2, 2, 1, 0, 1, 1, 0, 6, 0, 0]);

    expect(game.status).toBe("won");
    expect(game.winner).toBe(1);
    expect(game.winningLine).toEqual([
      { row: 2, column: 0 },
      { row: 3, column: 1 },
      { row: 4, column: 2 },
      { row: 5, column: 3 },
    ]);
  });

  it("detects a draw on a full board", () => {
    const almostDraw: GameState = {
      board: [
        [1, 1, 2, 2, 1, 1, 0],
        [2, 2, 1, 1, 2, 2, 1],
        [1, 1, 2, 2, 1, 1, 2],
        [2, 2, 1, 1, 2, 2, 1],
        [1, 1, 2, 2, 1, 1, 2],
        [2, 2, 1, 1, 2, 2, 1],
      ],
      currentPlayer: 2,
      status: "playing",
      winner: null,
      winningLine: null,
      moves: [],
      version: 41,
    };

    const game = applyMove(almostDraw, 6);

    expect(game.status).toBe("draw");
    expect(game.winner).toBeNull();
    expect(getLegalMoves(game)).toEqual([]);
  });

  it("rejects moves after a terminal state", () => {
    const wonGame = play([0, 1, 0, 1, 0, 1, 0]);

    expect(() => applyMove(wonGame, 2)).toThrowError(
      expect.objectContaining({ code: "GAME_OVER" }),
    );
  });
});
