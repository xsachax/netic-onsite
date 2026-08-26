import {
  chooseAgentMove,
  createConfiguredModel,
  type AgentDifficulty,
  type AgentProvider,
} from "@/agent";
import { getLegalMoves } from "@/domain/connect4";
import { replayGame } from "@/game/history";
import type {
  EvalCaseExecution,
  EvalScenario,
  EvalScenarioState,
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
  readonly difficulty: AgentDifficulty;
  readonly provider: AgentProvider;
}): Promise<EvalCaseExecution> {
  const { scenario, state } = prepareEvalScenario(options.scenario);
  const decision = await chooseAgentMove({
    state,
    difficulty: options.difficulty,
    model: createConfiguredModel(options.provider),
  });

  return {
    scenario,
    decision,
    passed: scenario.goldenMoves.includes(decision.column),
    difficulty: options.difficulty,
    provider: options.provider,
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
