import { analyzeMoves } from "@/agent/search";
import {
  applyMove,
  createGame,
  type GameState,
  getLegalMoves,
  type Player,
} from "@/domain/connect4";

type Policy = (state: GameState) => number;

interface TacticalFixture {
  readonly name: string;
  readonly history: readonly number[];
  readonly expectedColumns: readonly number[];
}

const fixtures: readonly TacticalFixture[] = [
  {
    name: "opens in the center",
    history: [],
    expectedColumns: [3],
  },
  {
    name: "takes a horizontal win",
    history: [0, 6, 1, 6, 2, 5],
    expectedColumns: [3],
  },
  {
    name: "blocks a horizontal loss",
    history: [6, 0, 6, 1, 5, 2],
    expectedColumns: [3],
  },
  {
    name: "takes a vertical win",
    history: [0, 1, 0, 1, 6, 1, 6],
    expectedColumns: [1],
  },
  {
    name: "does not select a full column",
    history: [0, 0, 0, 0, 0, 0],
    expectedColumns: [1, 2, 3, 4, 5, 6],
  },
];

const random = seededRandom(4_204);
const policies = {
  random: ((state) => {
    const moves = getLegalMoves(state);
    return moves[Math.floor(random() * moves.length)];
  }) satisfies Policy,
  heuristic: ((state) => analyzeMoves(state, { depth: 1 }).moves[0].column) satisfies Policy,
  search: ((state) => analyzeMoves(state, { depth: 3 }).moves[0].column) satisfies Policy,
};

const tacticalResults = fixtures.map((fixture) => {
  const state = replay(fixture.history);
  const selected = policies.search(state);

  return {
    name: fixture.name,
    selectedColumn: selected,
    expectedColumns: fixture.expectedColumns,
    passed: fixture.expectedColumns.includes(selected),
  };
});

const tournaments = [
  playSeries("search", policies.search, "random", policies.random, 20),
  playSeries("search", policies.search, "heuristic", policies.heuristic, 20),
  playSeries("heuristic", policies.heuristic, "random", policies.random, 20),
];
const passedFixtures = tacticalResults.filter(({ passed }) => passed).length;

console.log("Connect Four agent evaluation");
console.log("=============================");
console.log(
  `Tactical accuracy: ${passedFixtures}/${tacticalResults.length} (${Math.round(
    (passedFixtures / tacticalResults.length) * 100,
  )}%)`,
);

for (const result of tacticalResults) {
  console.log(
    `  ${result.passed ? "PASS" : "FAIL"} ${result.name}: column ${
      result.selectedColumn + 1
    }`,
  );
}

console.log("\nSeeded head-to-head matches:");
for (const series of tournaments) {
  console.log(
    `  ${series.left} vs ${series.right}: ${series.leftWins}-${series.rightWins}-${series.draws} ` +
      `(W-L-D, ${series.illegalMoves} illegal moves)`,
  );
}

if (passedFixtures !== tacticalResults.length) {
  process.exitCode = 1;
}

function playSeries(
  leftName: string,
  left: Policy,
  rightName: string,
  right: Policy,
  games: number,
) {
  let leftWins = 0;
  let rightWins = 0;
  let draws = 0;
  let illegalMoves = 0;

  for (let gameNumber = 0; gameNumber < games; gameNumber += 1) {
    const leftPlayer: Player = gameNumber % 2 === 0 ? 1 : 2;
    let state = createGame();

    while (state.status === "playing") {
      const policy = state.currentPlayer === leftPlayer ? left : right;
      const column = policy(state);

      if (!getLegalMoves(state).includes(column)) {
        illegalMoves += 1;
        break;
      }

      state = applyMove(state, column);
    }

    if (state.status === "draw") {
      draws += 1;
    } else if (state.winner === leftPlayer) {
      leftWins += 1;
    } else {
      rightWins += 1;
    }
  }

  return {
    left: leftName,
    right: rightName,
    leftWins,
    rightWins,
    draws,
    illegalMoves,
  };
}

function replay(columns: readonly number[]): GameState {
  return columns.reduce(
    (state, column) => applyMove(state, column),
    createGame(),
  );
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}
