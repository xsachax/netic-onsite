import { describe, expect, it } from "vitest";
import { getLegalMoves } from "@/domain/connect4";
import { replayGame } from "@/game/history";
import { simulateGames, type SimulationOptions } from "./simulation";

const options: SimulationOptions = {
  games: 8,
  seed: 4_204,
  playerOnePolicy: "heuristic",
  playerTwoPolicy: "random",
  candidateCount: 12,
  baselineDepth: 3,
};

describe("automated game simulation", () => {
  it("produces repeatable games and candidate positions", () => {
    expect(simulateGames(options)).toEqual(simulateGames(options));
  });

  it("plays every game to a valid terminal state", () => {
    const batch = simulateGames(options);

    expect(batch.games).toHaveLength(options.games);
    expect(
      batch.summary.playerOneWins +
        batch.summary.playerTwoWins +
        batch.summary.draws,
    ).toBe(options.games);

    for (const game of batch.games) {
      const state = replayGame(game.moveHistory);
      expect(state.status).not.toBe("playing");
      expect(state.winner).toBe(game.winner);
    }
  });

  it("captures legal agent-to-move candidates with explicit approximate labels", () => {
    const batch = simulateGames(options);

    expect(batch.candidates.length).toBeGreaterThan(0);
    expect(batch.candidates.length).toBeLessThanOrEqual(options.candidateCount);

    for (const candidate of batch.candidates) {
      const state = replayGame(candidate.moveHistory);
      const legalMoves = getLegalMoves(state);

      expect(state.currentPlayer).toBe(2);
      expect(legalMoves).toContain(candidate.simulatedMove);
      expect(candidate.baseline.exact).toBe(false);
      expect(candidate.baseline.depth).toBe(options.baselineDepth);
      expect(candidate.baseline.bestMoves.length).toBeGreaterThan(0);
      expect(
        candidate.baseline.bestMoves.every((move) => legalMoves.includes(move)),
      ).toBe(true);
    }
  });
});
