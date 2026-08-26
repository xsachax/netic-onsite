import {
  chooseAgentMove,
  createConfiguredModel,
  analyzeMoves,
  type AgentProvider,
} from "@/agent";
import { COLUMNS, getLegalMoves } from "@/domain/connect4";
import { replayGame } from "@/game/history";
import type {
  EvalCaseExecution,
  EvalScenario,
  EvalScenarioState,
  SearchEvalCaseExecution,
} from "./types";

export function prepareEvalScenario(
  scenario: EvalScenario,
): EvalScenarioState {
  const state = replayGame(scenario.moveHistory);

  if (state.status !== "playing") {
    throw new InvalidEvalScenarioError(
      scenario.id,
      "the supplied position is terminal",
    );
  }
  if (state.currentPlayer !== 2) {
    throw new InvalidEvalScenarioError(
      scenario.id,
      "the supplied position does not have the agent to move",
    );
  }

  const legalMoves = new Set(getLegalMoves(state));
  if (
    scenario.goldenMoves.length === 0 ||
    scenario.goldenMoves.some((column) => !legalMoves.has(column))
  ) {
    throw new InvalidEvalScenarioError(
      scenario.id,
      "the golden move set contains no moves or an illegal move",
    );
  }
  if (new Set(scenario.goldenMoves).size !== scenario.goldenMoves.length) {
    throw new InvalidEvalScenarioError(
      scenario.id,
      "the golden move set contains duplicates",
    );
  }
  if (scenario.solverScores) {
    validateSolverScores(scenario, legalMoves);
  }

  return { scenario, state };
}

export function evaluateSelectedMove(
  scenario: EvalScenario,
  selectedMove: number,
): boolean {
  prepareEvalScenario(scenario);
  return scenario.goldenMoves.includes(selectedMove);
}

export async function executeEvalScenario(options: {
  readonly scenario: EvalScenario;
  readonly provider: AgentProvider;
}): Promise<EvalCaseExecution> {
  const { scenario, state } = prepareEvalScenario(options.scenario);
  const decision = await chooseAgentMove({
    state,
    model: createConfiguredModel(options.provider),
  });

  return {
    scenario,
    decision,
    passed: scenario.goldenMoves.includes(decision.column),
    provider: options.provider,
  };
}

export function executeSearchEvalScenario(options: {
  readonly scenario: EvalScenario;
  readonly searchDepth: number;
}): SearchEvalCaseExecution {
  const { scenario, state } = prepareEvalScenario(options.scenario);
  const search = analyzeMoves(state, { depth: options.searchDepth });
  const selectedMove = search.moves[0].column;

  return {
    scenario,
    selectedMove,
    passed: scenario.goldenMoves.includes(selectedMove),
    searchDepth: search.depth,
    searchNodes: search.nodes,
    searchDurationMs: search.durationMs,
  };
}

export class InvalidEvalScenarioError extends Error {
  constructor(
    public readonly scenarioId: string,
    reason: string,
  ) {
    super(`Evaluation scenario ${scenarioId} is invalid: ${reason}.`);
    this.name = "InvalidEvalScenarioError";
  }
}

function validateSolverScores(
  scenario: EvalScenario,
  legalMoves: ReadonlySet<number>,
): void {
  const scores = scenario.solverScores;
  if (!scores || scores.length !== COLUMNS) {
    throw new InvalidEvalScenarioError(
      scenario.id,
      `solver scores must contain exactly ${COLUMNS} columns`,
    );
  }

  for (const [column, score] of scores.entries()) {
    const validLegalScore =
      legalMoves.has(column) &&
      Number.isInteger(score) &&
      score >= -22 &&
      score <= 22;
    const validIllegalScore = !legalMoves.has(column) && score === 100;

    if (!validLegalScore && !validIllegalScore) {
      throw new InvalidEvalScenarioError(
        scenario.id,
        `solver score for column ${column} does not match its legal state`,
      );
    }
  }

  const bestScore = Math.max(
    ...[...legalMoves].map((column) => scores[column]),
  );
  const expectedGoldenMoves = [...legalMoves].filter(
    (column) => scores[column] === bestScore,
  );
  const suppliedGoldenMoves = [...scenario.goldenMoves].sort(
    (left, right) => left - right,
  );

  if (
    expectedGoldenMoves.length !== suppliedGoldenMoves.length ||
    expectedGoldenMoves.some(
      (column, index) => column !== suppliedGoldenMoves[index],
    )
  ) {
    throw new InvalidEvalScenarioError(
      scenario.id,
      "the golden move set does not match the solver scores",
    );
  }
}
