import {
  applyMove,
  COLUMNS,
  CONNECT_LENGTH,
  type GameState,
  getLegalMoves,
  type Player,
  ROWS,
} from "@/domain/connect4";
import type {
  MoveAnalysis,
  MoveCategory,
  SearchOptions,
  SearchResult,
} from "./types";

const WIN_SCORE = 1_000_000;
const DEFAULT_DEPTH = 4;
const MAX_DEPTH = 7;
const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6] as const;
const WINDOW_SCORES = [0, 2, 12, 90, WIN_SCORE] as const;

interface SearchContext {
  nodes: number;
  readonly rootPlayer: Player;
}

interface NodeResult {
  readonly score: number;
  readonly line: readonly number[];
}

export function analyzeMoves(
  state: GameState,
  options: SearchOptions = {},
): SearchResult {
  const startedAt = performance.now();
  const depth = clampDepth(options.depth ?? DEFAULT_DEPTH);
  const context: SearchContext = {
    nodes: 0,
    rootPlayer: state.currentPlayer,
  };
  const threats = immediateWinningMoves(state, opponent(state.currentPlayer));
  const moves = orderedLegalMoves(state, options.columns).map((column): MoveAnalysis => {
    const nextState = applyMove(state, column);
    const opponentWinningReplies =
      nextState.status === "playing"
        ? immediateWinningMoves(nextState, nextState.currentPlayer)
        : [];
    const result =
      nextState.winner === context.rootPlayer
        ? { score: WIN_SCORE + depth, line: [] }
        : minimax(
            nextState,
            depth - 1,
            Number.NEGATIVE_INFINITY,
            Number.POSITIVE_INFINITY,
            context,
          );

    return {
      column,
      score: result.score,
      category: categorizeMove(
        nextState.winner === context.rootPlayer,
        threats,
        column,
        opponentWinningReplies,
      ),
      principalVariation: [column, ...result.line],
      opponentWinningReplies,
    };
  });

  moves.sort(
    (left, right) =>
      right.score - left.score ||
      MOVE_ORDER.indexOf(left.column as (typeof MOVE_ORDER)[number]) -
        MOVE_ORDER.indexOf(right.column as (typeof MOVE_ORDER)[number]),
  );

  return {
    depth,
    nodes: context.nodes,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    moves,
  };
}

export function inspectMove(
  state: GameState,
  column: number,
): MoveAnalysis | null {
  return (
    analyzeMoves(state, { depth: 2 }).moves.find(
      (analysis) => analysis.column === column,
    ) ?? null
  );
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
): NodeResult {
  context.nodes += 1;

  if (state.status !== "playing" || depth === 0) {
    return {
      score: evaluateState(state, context.rootPlayer, depth),
      line: [],
    };
  }

  const maximizing = state.currentPlayer === context.rootPlayer;
  let bestScore = maximizing
    ? Number.NEGATIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  let bestLine: readonly number[] = [];
  let nextAlpha = alpha;
  let nextBeta = beta;

  for (const column of orderedLegalMoves(state)) {
    const child = minimax(
      applyMove(state, column),
      depth - 1,
      nextAlpha,
      nextBeta,
      context,
    );

    if (
      (maximizing && child.score > bestScore) ||
      (!maximizing && child.score < bestScore)
    ) {
      bestScore = child.score;
      bestLine = [column, ...child.line];
    }

    if (maximizing) {
      nextAlpha = Math.max(nextAlpha, bestScore);
    } else {
      nextBeta = Math.min(nextBeta, bestScore);
    }

    if (nextBeta <= nextAlpha) {
      break;
    }
  }

  return { score: bestScore, line: bestLine };
}

function evaluateState(
  state: GameState,
  rootPlayer: Player,
  remainingDepth: number,
): number {
  if (state.winner === rootPlayer) {
    return WIN_SCORE + remainingDepth;
  }
  if (state.winner !== null) {
    return -WIN_SCORE - remainingDepth;
  }
  if (state.status === "draw") {
    return 0;
  }

  const opponentPlayer = opponent(rootPlayer);
  let score = 0;

  for (let row = 0; row < ROWS; row += 1) {
    if (state.board[row][3] === rootPlayer) {
      score += 7;
    } else if (state.board[row][3] === opponentPlayer) {
      score -= 7;
    }
  }

  forEachWindow(state, (window) => {
    score += scoreWindow(window, rootPlayer, opponentPlayer);
  });

  return score;
}

function forEachWindow(
  state: GameState,
  visit: (window: readonly (0 | Player)[]) => void,
): void {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column <= COLUMNS - CONNECT_LENGTH; column += 1) {
      visit(state.board[row].slice(column, column + CONNECT_LENGTH));
    }
  }

  for (let column = 0; column < COLUMNS; column += 1) {
    for (let row = 0; row <= ROWS - CONNECT_LENGTH; row += 1) {
      visit(
        Array.from(
          { length: CONNECT_LENGTH },
          (_, offset) => state.board[row + offset][column],
        ),
      );
    }
  }

  for (let row = 0; row <= ROWS - CONNECT_LENGTH; row += 1) {
    for (let column = 0; column <= COLUMNS - CONNECT_LENGTH; column += 1) {
      visit(
        Array.from(
          { length: CONNECT_LENGTH },
          (_, offset) => state.board[row + offset][column + offset],
        ),
      );
      visit(
        Array.from(
          { length: CONNECT_LENGTH },
          (_, offset) =>
            state.board[row + offset][
              column + CONNECT_LENGTH - 1 - offset
            ],
        ),
      );
    }
  }
}

function scoreWindow(
  window: readonly (0 | Player)[],
  rootPlayer: Player,
  opponentPlayer: Player,
): number {
  const rootCount = window.filter((cell) => cell === rootPlayer).length;
  const opponentCount = window.filter((cell) => cell === opponentPlayer).length;

  if (rootCount > 0 && opponentCount > 0) {
    return 0;
  }
  if (rootCount > 0) {
    return WINDOW_SCORES[rootCount];
  }
  if (opponentCount > 0) {
    return -WINDOW_SCORES[opponentCount];
  }

  return 0;
}

function immediateWinningMoves(
  state: GameState,
  player: Player,
): number[] {
  if (state.status !== "playing") {
    return [];
  }

  const simulationState =
    state.currentPlayer === player ? state : { ...state, currentPlayer: player };

  return orderedLegalMoves(simulationState).filter(
    (column) => applyMove(simulationState, column).winner === player,
  );
}

function orderedLegalMoves(
  state: GameState,
  columns?: readonly number[],
): number[] {
  const legalMoves = new Set(getLegalMoves(state));
  const requestedMoves = columns ? new Set(columns) : null;
  return MOVE_ORDER.filter(
    (column) =>
      legalMoves.has(column) &&
      (requestedMoves === null || requestedMoves.has(column)),
  );
}

function categorizeMove(
  isImmediateWin: boolean,
  threats: readonly number[],
  column: number,
  opponentWinningReplies: readonly number[],
): MoveCategory {
  if (isImmediateWin) {
    return "immediate-win";
  }
  if (threats.includes(column) && opponentWinningReplies.length === 0) {
    return "forced-block";
  }
  if (opponentWinningReplies.length > 0) {
    return "risky";
  }

  return "safe";
}

function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) {
    return DEFAULT_DEPTH;
  }

  return Math.max(1, Math.min(MAX_DEPTH, Math.floor(depth)));
}

function opponent(player: Player): Player {
  return player === 1 ? 2 : 1;
}
