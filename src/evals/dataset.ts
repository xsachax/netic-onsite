import { prepareEvalScenario } from "./evaluator";
import type { EvalCategory, EvalScenario } from "./types";

export const EVAL_DATASET_VERSION = "pons-golden-v1";

interface SolvedPosition {
  readonly id: string;
  readonly name: string;
  readonly category: EvalCategory;
  readonly description: string;
  readonly sequence: string;
  readonly scores: readonly number[];
  readonly benchmark: "Test_L1_R1" | "Test_L2_R1" | "Test_L3_R1";
}

const solvedPositions: readonly SolvedPosition[] = [
  {
    id: "opening-conversion",
    name: "Opening conversion",
    category: "tactics",
    description: "Find the sole move with the solver's maximum winning score.",
    sequence: "14254",
    scores: [-3, 0, -2, 4, 2, 18, -1],
    benchmark: "Test_L1_R1",
  },
  {
    id: "central-winning-plan",
    name: "Central winning plan",
    category: "strategy",
    description: "Choose the only continuation that preserves the fastest win.",
    sequence: "2615522",
    scores: [-5, -4, 2, 17, -4, -3, -6],
    benchmark: "Test_L1_R1",
  },
  {
    id: "deep-opening-choice",
    name: "Deep opening choice",
    category: "strategy",
    description: "Resolve a balanced opening into its strongest continuation.",
    sequence: "5512243243536",
    scores: [-3, 4, 12, 13, 8, -3, -2],
    benchmark: "Test_L1_R1",
  },
  {
    id: "closed-center",
    name: "Closed center",
    category: "tactics",
    description: "The center is full; identify the best adjacent attack.",
    sequence: "22144426444",
    scores: [0, 2, 0, 100, 15, 2, 0],
    benchmark: "Test_L1_R1",
  },
  {
    id: "mandatory-midgame-block",
    name: "Mandatory midgame block",
    category: "block",
    description: "Stop an immediate threat before continuing the attack.",
    sequence: "5554224333234511764415115",
    scores: [-8, -8, -8, -8, 100, 4, -8],
    benchmark: "Test_L2_R1",
  },
  {
    id: "midgame-conversion",
    name: "Midgame conversion",
    category: "strategy",
    description: "Select the unique move that maximizes a forced win.",
    sequence: "52753311433677442422121",
    scores: [2, 3, 7, 7, 8, 7, 2],
    benchmark: "Test_L2_R1",
  },
  {
    id: "equivalent-winning-lines",
    name: "Equivalent winning lines",
    category: "tactics",
    description: "Two continuations are exactly tied under perfect play.",
    sequence: "122435527534575161761",
    scores: [-1, 0, 10, 10, -2, -2, -2],
    benchmark: "Test_L2_R1",
  },
  {
    id: "late-forced-block",
    name: "Late forced block",
    category: "endgame",
    description: "Only one of the two legal columns prevents an immediate loss.",
    sequence: "2252576253462244111563365343671351441",
    scores: [100, 100, 100, 100, 100, -1, -2],
    benchmark: "Test_L3_R1",
  },
];

export const EVAL_SCENARIOS: readonly EvalScenario[] = solvedPositions.map(
  (position) => {
    const scenario: EvalScenario = {
      id: position.id,
      name: position.name,
      category: position.category,
      description: position.description,
      moveHistory: parseSequence(position.sequence),
      goldenMoves: goldenMoves(position.scores),
      solverScores: position.scores,
      source: {
        name: "Pascal Pons GameSolver",
        url: `https://connect4.gamesolver.org/solve?pos=${position.sequence}`,
        method:
          `Position sampled from ${position.benchmark}; exact per-column ` +
          "minimax scores captured offline from the public solver API.",
      },
    };

    prepareEvalScenario(scenario);
    return scenario;
  },
);

export function findEvalScenario(id: string): EvalScenario | undefined {
  return EVAL_SCENARIOS.find((scenario) => scenario.id === id);
}

function parseSequence(sequence: string): number[] {
  return [...sequence].map((column) => Number(column) - 1);
}

function goldenMoves(scores: readonly number[]): number[] {
  const maximum = Math.max(...scores.filter((score) => score !== 100));

  return scores.flatMap((score, column) =>
    score === maximum ? [column] : [],
  );
}
