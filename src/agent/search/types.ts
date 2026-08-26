export type MoveCategory =
  | "immediate-win"
  | "forced-block"
  | "safe"
  | "risky";

export interface MoveAnalysis {
  readonly column: number;
  readonly score: number;
  readonly category: MoveCategory;
  readonly principalVariation: readonly number[];
  readonly opponentWinningReplies: readonly number[];
}

export interface SearchResult {
  readonly depth: number;
  readonly nodes: number;
  readonly durationMs: number;
  readonly moves: readonly MoveAnalysis[];
}

export interface SearchOptions {
  readonly depth?: number;
}
