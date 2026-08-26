export const ROWS = 6;
export const COLUMNS = 7;
export const CONNECT_LENGTH = 4;

export type Player = 1 | 2;
export type Cell = Player | 0;
export type GameStatus = "playing" | "won" | "draw";

export interface Position {
  readonly row: number;
  readonly column: number;
}

export interface Move extends Position {
  readonly number: number;
  readonly player: Player;
}

export interface GameState {
  readonly board: readonly (readonly Cell[])[];
  readonly currentPlayer: Player;
  readonly status: GameStatus;
  readonly winner: Player | null;
  readonly winningLine: readonly Position[] | null;
  readonly moves: readonly Move[];
  readonly version: number;
}

export type GameRuleErrorCode =
  | "GAME_OVER"
  | "INVALID_COLUMN"
  | "COLUMN_FULL"
  | "WRONG_TURN";

export class GameRuleError extends Error {
  constructor(
    public readonly code: GameRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}
