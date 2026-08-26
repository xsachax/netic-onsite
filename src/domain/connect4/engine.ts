import {
  COLUMNS,
  CONNECT_LENGTH,
  type Cell,
  type GameState,
  GameRuleError,
  type Player,
  type Position,
  ROWS,
} from "./types";

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

export function createGame(startingPlayer: Player = 1): GameState {
  return {
    board: Array.from({ length: ROWS }, () =>
      Array<Cell>(COLUMNS).fill(0),
    ),
    currentPlayer: startingPlayer,
    status: "playing",
    winner: null,
    winningLine: null,
    moves: [],
    version: 0,
  };
}

export function getLegalMoves(state: GameState): number[] {
  if (state.status !== "playing") {
    return [];
  }

  return state.board[0]
    .map((cell, column) => (cell === 0 ? column : -1))
    .filter((column) => column >= 0);
}

export function applyMove(
  state: GameState,
  column: number,
  player: Player = state.currentPlayer,
): GameState {
  if (state.status !== "playing") {
    throw new GameRuleError("GAME_OVER", "The game has already ended.");
  }
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) {
    throw new GameRuleError(
      "INVALID_COLUMN",
      `Column must be an integer from 0 to ${COLUMNS - 1}.`,
    );
  }
  if (player !== state.currentPlayer) {
    throw new GameRuleError(
      "WRONG_TURN",
      `It is player ${state.currentPlayer}'s turn.`,
    );
  }

  const row = findOpenRow(state.board, column);
  if (row === -1) {
    throw new GameRuleError("COLUMN_FULL", `Column ${column} is full.`);
  }

  const board = state.board.map((boardRow) => [...boardRow]);
  board[row][column] = player;

  const winningLine = findWinningLine(board, row, column, player);
  const isDraw = winningLine === null && board[0].every((cell) => cell !== 0);
  const move = {
    number: state.moves.length + 1,
    player,
    row,
    column,
  };

  return {
    board,
    currentPlayer: otherPlayer(player),
    status: winningLine ? "won" : isDraw ? "draw" : "playing",
    winner: winningLine ? player : null,
    winningLine,
    moves: [...state.moves, move],
    version: state.version + 1,
  };
}

export function findWinningLine(
  board: GameState["board"],
  row: number,
  column: number,
  player: Player,
): Position[] | null {
  for (const [rowDelta, columnDelta] of DIRECTIONS) {
    const line = [
      ...collectDirection(
        board,
        row,
        column,
        player,
        -rowDelta,
        -columnDelta,
      ).reverse(),
      { row, column },
      ...collectDirection(
        board,
        row,
        column,
        player,
        rowDelta,
        columnDelta,
      ),
    ];

    if (line.length >= CONNECT_LENGTH) {
      return line.slice(0, CONNECT_LENGTH);
    }
  }

  return null;
}

export function otherPlayer(player: Player): Player {
  return player === 1 ? 2 : 1;
}

function findOpenRow(board: GameState["board"], column: number): number {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === 0) {
      return row;
    }
  }

  return -1;
}

function collectDirection(
  board: GameState["board"],
  row: number,
  column: number,
  player: Player,
  rowDelta: number,
  columnDelta: number,
): Position[] {
  const positions: Position[] = [];
  let nextRow = row + rowDelta;
  let nextColumn = column + columnDelta;

  while (
    nextRow >= 0 &&
    nextRow < ROWS &&
    nextColumn >= 0 &&
    nextColumn < COLUMNS &&
    board[nextRow][nextColumn] === player
  ) {
    positions.push({ row: nextRow, column: nextColumn });
    nextRow += rowDelta;
    nextColumn += columnDelta;
  }

  return positions;
}
