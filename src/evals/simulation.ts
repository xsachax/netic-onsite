import { analyzeMoves } from "@/agent/search";
import {
  applyMove,
  COLUMNS,
  createGame,
  type GameState,
  getLegalMoves,
  type Player,
} from "@/domain/connect4";
import { replayGame } from "@/game/history";
import { z } from "zod";

export const SIMULATION_DATA_VERSION = "generated-candidates-v1";

export const simulationPolicySchema = z.enum([
  "random",
  "heuristic",
  "search",
]);
export type SimulationPolicy = z.infer<typeof simulationPolicySchema>;

const simulationStageSchema = z.enum(["opening", "midgame", "endgame"]);
export type SimulationStage = z.infer<typeof simulationStageSchema>;

export const generatedEvalCandidateSchema = z.object({
  id: z.string(),
  gameNumber: z.number().int().positive(),
  ply: z.number().int().nonnegative(),
  stage: simulationStageSchema,
  moveHistory: z.array(z.number().int().min(0).max(COLUMNS - 1)),
  simulatedPolicy: simulationPolicySchema,
  simulatedMove: z.number().int().min(0).max(COLUMNS - 1),
  baseline: z.object({
    kind: z.literal("bounded-alpha-beta"),
    depth: z.number().int().min(1).max(7),
    exact: z.literal(false),
    bestMoves: z.array(z.number().int().min(0).max(COLUMNS - 1)).min(1),
    moveScores: z.array(z.number().nullable()).length(COLUMNS),
    simulatedMoveScore: z.number(),
    regret: z.number().nonnegative(),
  }),
});
export type GeneratedEvalCandidate = z.infer<
  typeof generatedEvalCandidateSchema
>;

const simulatedGameSchema = z.object({
  gameNumber: z.number().int().positive(),
  winner: z.union([z.literal(1), z.literal(2)]).nullable(),
  status: z.enum(["won", "draw"]),
  moveHistory: z.array(z.number().int().min(0).max(COLUMNS - 1)),
});
export type SimulatedGame = z.infer<typeof simulatedGameSchema>;

export const simulationBatchSchema = z.object({
  version: z.literal(SIMULATION_DATA_VERSION),
  options: z.object({
    games: z.number().int().positive(),
    seed: z.number().int(),
    playerOnePolicy: simulationPolicySchema,
    playerTwoPolicy: simulationPolicySchema,
    candidateCount: z.number().int().positive(),
    baselineDepth: z.number().int().min(1).max(7),
  }),
  summary: z.object({
    games: z.number().int().positive(),
    playerOneWins: z.number().int().nonnegative(),
    playerTwoWins: z.number().int().nonnegative(),
    draws: z.number().int().nonnegative(),
    averageMoves: z.number().nonnegative(),
    capturedPositions: z.number().int().nonnegative(),
    uniquePositions: z.number().int().nonnegative(),
    candidates: z.number().int().nonnegative(),
  }),
  games: z.array(simulatedGameSchema),
  candidates: z.array(generatedEvalCandidateSchema),
});
export type SimulationBatch = z.infer<typeof simulationBatchSchema>;

export interface SimulationOptions {
  readonly games: number;
  readonly seed: number;
  readonly playerOnePolicy: SimulationPolicy;
  readonly playerTwoPolicy: SimulationPolicy;
  readonly candidateCount: number;
  readonly baselineDepth: number;
}

interface CapturedPosition {
  readonly gameNumber: number;
  readonly moveHistory: readonly number[];
  readonly simulatedPolicy: SimulationPolicy;
  readonly simulatedMove: number;
}

export function simulateGames(options: SimulationOptions): SimulationBatch {
  const normalized = normalizeOptions(options);
  const random = seededRandom(normalized.seed);
  const games: SimulatedGame[] = [];
  const capturedPositions: CapturedPosition[] = [];

  for (let gameNumber = 1; gameNumber <= normalized.games; gameNumber += 1) {
    let state = createGame();

    while (state.status === "playing") {
      const policy =
        state.currentPlayer === 1
          ? normalized.playerOnePolicy
          : normalized.playerTwoPolicy;
      const moveHistory = state.moves.map((move) => move.column);
      const selectedMove = choosePolicyMove(state, policy, random);

      if (state.currentPlayer === 2) {
        capturedPositions.push({
          gameNumber,
          moveHistory,
          simulatedPolicy: policy,
          simulatedMove: selectedMove,
        });
      }

      state = applyMove(state, selectedMove);
    }

    games.push({
      gameNumber,
      winner: state.winner,
      status: state.status,
      moveHistory: state.moves.map((move) => move.column),
    });
  }

  const uniquePositions = uniqueCapturedPositions(capturedPositions);
  const selectedPositions = selectDiversePositions(
    uniquePositions,
    normalized.candidateCount,
    normalized.seed ^ 0x9e3779b9,
  );
  const candidates = selectedPositions.map((position) =>
    labelCandidate(position, normalized.baselineDepth, normalized.seed),
  );
  const playerOneWins = games.filter((game) => game.winner === 1).length;
  const playerTwoWins = games.filter((game) => game.winner === 2).length;
  const totalMoves = games.reduce(
    (sum, game) => sum + game.moveHistory.length,
    0,
  );

  return simulationBatchSchema.parse({
    version: SIMULATION_DATA_VERSION,
    options: normalized,
    summary: {
      games: games.length,
      playerOneWins,
      playerTwoWins,
      draws: games.length - playerOneWins - playerTwoWins,
      averageMoves: Math.round((totalMoves / games.length) * 10) / 10,
      capturedPositions: capturedPositions.length,
      uniquePositions: uniquePositions.length,
      candidates: candidates.length,
    },
    games,
    candidates,
  });
}

function normalizeOptions(options: SimulationOptions): SimulationOptions {
  if (!Number.isInteger(options.games) || options.games < 1 || options.games > 10_000) {
    throw new Error("Simulation games must be an integer from 1 to 10,000.");
  }
  if (
    !Number.isInteger(options.candidateCount) ||
    options.candidateCount < 1 ||
    options.candidateCount > 500
  ) {
    throw new Error("Candidate count must be an integer from 1 to 500.");
  }
  if (
    !Number.isInteger(options.baselineDepth) ||
    options.baselineDepth < 1 ||
    options.baselineDepth > 7
  ) {
    throw new Error("Baseline depth must be an integer from 1 to 7.");
  }
  if (!Number.isInteger(options.seed)) {
    throw new Error("Simulation seed must be an integer.");
  }

  return options;
}

function choosePolicyMove(
  state: GameState,
  policy: SimulationPolicy,
  random: () => number,
): number {
  if (policy === "random") {
    const legalMoves = getLegalMoves(state);
    return legalMoves[Math.floor(random() * legalMoves.length)];
  }

  return analyzeMoves(state, { depth: policy === "heuristic" ? 1 : 3 }).moves[0]
    .column;
}

function uniqueCapturedPositions(
  positions: readonly CapturedPosition[],
): CapturedPosition[] {
  const unique = new Map<string, CapturedPosition>();

  for (const position of positions) {
    const state = replayGame(position.moveHistory);
    const key = canonicalBoardKey(state);
    if (!unique.has(key)) {
      unique.set(key, position);
    }
  }

  return [...unique.values()];
}

function canonicalBoardKey(state: GameState): string {
  const direct = state.board.flat().join("");
  const mirrored = state.board
    .flatMap((row) => [...row].reverse())
    .join("");

  return direct < mirrored ? direct : mirrored;
}

function selectDiversePositions(
  positions: readonly CapturedPosition[],
  count: number,
  seed: number,
): CapturedPosition[] {
  const random = seededRandom(seed);
  const buckets = new Map<SimulationStage, CapturedPosition[]>([
    ["opening", []],
    ["midgame", []],
    ["endgame", []],
  ]);

  for (const position of positions) {
    buckets.get(stageForPly(position.moveHistory.length))?.push(position);
  }
  for (const bucket of buckets.values()) {
    shuffle(bucket, random);
  }

  const selected: CapturedPosition[] = [];
  const stages: readonly SimulationStage[] = ["opening", "midgame", "endgame"];
  while (selected.length < count) {
    let added = false;
    for (const stage of stages) {
      const position = buckets.get(stage)?.pop();
      if (position) {
        selected.push(position);
        added = true;
        if (selected.length === count) break;
      }
    }
    if (!added) break;
  }

  return selected;
}

function labelCandidate(
  position: CapturedPosition,
  depth: number,
  seed: number,
): GeneratedEvalCandidate {
  const state = replayGame(position.moveHistory);
  const analysis = analyzeMoves(state, { depth });
  const bestScore = analysis.moves[0].score;
  const bestMoves = analysis.moves
    .filter((move) => move.score === bestScore)
    .map((move) => move.column);
  const selected = analysis.moves.find(
    (move) => move.column === position.simulatedMove,
  );
  if (!selected) {
    throw new Error(
      `Simulation selected illegal column ${position.simulatedMove}.`,
    );
  }

  const moveScores: Array<number | null> = Array(COLUMNS).fill(null);
  for (const move of analysis.moves) {
    moveScores[move.column] = move.score;
  }

  return {
    id: `sim-${seed}-${position.gameNumber}-${position.moveHistory.length}`,
    gameNumber: position.gameNumber,
    ply: position.moveHistory.length,
    stage: stageForPly(position.moveHistory.length),
    moveHistory: [...position.moveHistory],
    simulatedPolicy: position.simulatedPolicy,
    simulatedMove: position.simulatedMove,
    baseline: {
      kind: "bounded-alpha-beta",
      depth: analysis.depth,
      exact: false,
      bestMoves,
      moveScores,
      simulatedMoveScore: selected.score,
      regret: bestScore - selected.score,
    },
  };
}

function stageForPly(ply: number): SimulationStage {
  if (ply <= 11) return "opening";
  if (ply <= 25) return "midgame";
  return "endgame";
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selectedIndex = Math.floor(random() * (index + 1));
    [values[index], values[selectedIndex]] = [
      values[selectedIndex],
      values[index],
    ];
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}
