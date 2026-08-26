import {
  applyMove,
  createGame,
  type GameState,
  GameRuleError,
} from "@/domain/connect4";

export class InvalidGameHistoryError extends Error {
  constructor(
    message: string,
    public readonly moveIndex: number,
  ) {
    super(message);
    this.name = "InvalidGameHistoryError";
  }
}

export function replayGame(columns: readonly number[]): GameState {
  let state = createGame();

  for (const [index, column] of columns.entries()) {
    try {
      state = applyMove(state, column);
    } catch (error) {
      if (error instanceof GameRuleError) {
        throw new InvalidGameHistoryError(
          `Move ${index + 1} is invalid: ${error.message}`,
          index,
        );
      }
      throw error;
    }
  }

  return state;
}
