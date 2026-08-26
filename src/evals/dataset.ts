import { prepareEvalScenario } from "./evaluator";
import type { EvalCategory, EvalScenario } from "./types";

export const EVAL_DATASET_VERSION = "pons-golden-v2";

interface SolvedPosition {
  readonly id: string;
  readonly name: string;
  readonly category: EvalCategory;
  readonly description: string;
  readonly sequence: string;
  readonly scores: readonly number[];
  readonly origin: string;
}

const solvedPositions: readonly SolvedPosition[] = [
  {
    id: "opening-conversion",
    name: "Opening conversion",
    category: "tactics",
    description: "Find the sole move with the solver's maximum winning score.",
    sequence: "14254",
    scores: [-3, 0, -2, 4, 2, 18, -1],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "central-winning-plan",
    name: "Central winning plan",
    category: "strategy",
    description: "Choose the only continuation that preserves the fastest win.",
    sequence: "2615522",
    scores: [-5, -4, 2, 17, -4, -3, -6],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "deep-opening-choice",
    name: "Deep opening choice",
    category: "strategy",
    description: "Resolve a balanced opening into its strongest continuation.",
    sequence: "5512243243536",
    scores: [-3, 4, 12, 13, 8, -3, -2],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "closed-center",
    name: "Closed center",
    category: "tactics",
    description: "The center is full; identify the best adjacent attack.",
    sequence: "22144426444",
    scores: [0, 2, 0, 100, 15, 2, 0],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "mandatory-midgame-block",
    name: "Mandatory midgame block",
    category: "block",
    description: "Stop an immediate threat before continuing the attack.",
    sequence: "5554224333234511764415115",
    scores: [-8, -8, -8, -8, 100, 4, -8],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "midgame-conversion",
    name: "Midgame conversion",
    category: "strategy",
    description: "Select the unique move that maximizes a forced win.",
    sequence: "52753311433677442422121",
    scores: [2, 3, 7, 7, 8, 7, 2],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "equivalent-winning-lines",
    name: "Equivalent winning lines",
    category: "tactics",
    description: "Two continuations are exactly tied under perfect play.",
    sequence: "122435527534575161761",
    scores: [-1, 0, 10, 10, -2, -2, -2],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "late-forced-block",
    name: "Late forced block",
    category: "endgame",
    description: "Only one of the two legal columns prevents an immediate loss.",
    sequence: "2252576253462244111563365343671351441",
    scores: [100, 100, 100, 100, 100, -1, -2],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "shared-central-lines",
    name: "Shared central lines",
    category: "tactics",
    description: "Recognize two equally optimal central continuations.",
    sequence: "7313245",
    scores: [0, 4, 13, 13, 5, 0, 0],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "left-side-conversion",
    name: "Left-side conversion",
    category: "tactics",
    description: "Find the narrow winning continuation on the left side.",
    sequence: "1475174",
    scores: [0, 0, 17, 5, 2, 2, 0],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "central-tempo",
    name: "Central tempo",
    category: "strategy",
    description: "Choose the center move that wins one tempo faster.",
    sequence: "45713322723",
    scores: [4, 14, 4, 15, 3, -2, 0],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "center-over-near-win",
    name: "Center over near-win",
    category: "strategy",
    description: "Prefer the exact central line over a tempting adjacent move.",
    sequence: "625435133",
    scores: [2, 2, 2, 16, 14, 4, 0],
    origin: "Pascal Pons Test_L1_R1 benchmark",
  },
  {
    id: "single-midgame-defense",
    name: "Single midgame defense",
    category: "block",
    description: "Block the immediate threat with only five columns available.",
    sequence: "5533212164224336233241461",
    scores: [-8, 100, 100, 3, -8, -8, -8],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "left-center-defense",
    name: "Left-center defense",
    category: "block",
    description: "Find the sole defensive move that preserves a forced win.",
    sequence: "45277231624411643516213",
    scores: [-9, -9, 8, -9, -9, -9, -9],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "dual-midgame-wins",
    name: "Dual midgame wins",
    category: "tactics",
    description: "Accept either of two solver-equivalent winning moves.",
    sequence: "72276133256716235275764",
    scores: [-2, -2, 7, 7, -2, 6, -2],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "closed-column-defense",
    name: "Closed-column defense",
    category: "block",
    description: "Answer an immediate central threat beside a full column.",
    sequence: "657341635416555625471",
    scores: [-10, -10, -10, 9, 100, -10, -10],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "split-winning-plan",
    name: "Split winning plan",
    category: "tactics",
    description: "Two separated legal columns preserve the same exact win.",
    sequence: "713311533551231314755",
    scores: [100, 10, 100, 10, 0, -2, 6],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "constrained-defense",
    name: "Constrained defense",
    category: "block",
    description: "Block a threat while two central columns are unavailable.",
    sequence: "4666145433446767141256217",
    scores: [-8, -8, 8, 100, -8, 100, -8],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "forced-center-reversal",
    name: "Forced center reversal",
    category: "block",
    description: "Turn an immediate threat into a winning central response.",
    sequence: "33532452223727716571436",
    scores: [-9, -9, -9, 9, -9, -9, -9],
    origin: "Pascal Pons Test_L2_R1 benchmark",
  },
  {
    id: "three-column-endgame",
    name: "Three-column endgame",
    category: "endgame",
    description: "Choose the longest defense with only three legal columns.",
    sequence: "65214673556155731566316327373221417",
    scores: [100, -2, 100, -1, 100, 100, -2],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "late-winning-column",
    name: "Late winning column",
    category: "endgame",
    description: "Convert a late position through the only winning column.",
    sequence: "67152117737262713366376314254",
    scores: [-5, -5, -5, -1, 6, -5, 100],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "endgame-tempo-choice",
    name: "Endgame tempo choice",
    category: "endgame",
    description: "Distinguish the fastest win from a slower winning move.",
    sequence: "2762751722231276466633475674533",
    scores: [-5, 100, -4, 5, 4, 100, 100],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "endgame-survival",
    name: "Endgame survival",
    category: "endgame",
    description: "Select any move tied for the longest defensive outcome.",
    sequence: "12156756715535615116237724723",
    scores: [100, -2, -2, -6, 100, -2, -2],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "late-mandatory-block",
    name: "Late mandatory block",
    category: "block",
    description: "Block the immediate threat to delay an otherwise forced loss.",
    sequence: "26512741647245111351472255277",
    scores: [100, 100, -5, -6, -6, -6, -6],
    origin: "Pascal Pons Test_L3_R1 benchmark",
  },
  {
    id: "horizontal-win-in-one",
    name: "Horizontal win in one",
    category: "win",
    description: "Complete a horizontal four immediately.",
    sequence: "7172636",
    scores: [-12, -12, -12, 18, -3, -3, -14],
    origin: "Hand-authored tactical fixture",
  },
  {
    id: "vertical-win-in-one",
    name: "Vertical win in one",
    category: "win",
    description: "Complete a vertical four immediately.",
    sequence: "1212727",
    scores: [3, 18, 3, 4, 4, 3, 3],
    origin: "Hand-authored tactical fixture",
  },
  {
    id: "horizontal-block-in-one",
    name: "Horizontal block in one",
    category: "block",
    description: "Stop an immediate horizontal loss.",
    sequence: "17273",
    scores: [-18, -18, -18, 1, -18, -18, -18],
    origin: "Hand-authored tactical fixture",
  },
  {
    id: "vertical-block-in-one",
    name: "Vertical block in one",
    category: "block",
    description: "Stop an immediate vertical loss.",
    sequence: "17171",
    scores: [-2, -18, -18, -18, -18, -18, -18],
    origin: "Hand-authored tactical fixture",
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
          `Position from ${position.origin}; exact per-column ` +
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
