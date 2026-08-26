import type {
  AgentDecision,
  AgentProvider,
} from "@/agent";
import type { GameState } from "@/domain/connect4";

export type EvalCategory =
  | "win"
  | "block"
  | "tactics"
  | "strategy"
  | "endgame";

export interface EvalSource {
  readonly name: string;
  readonly url: string;
  readonly method: string;
}

export interface EvalScenario {
  readonly id: string;
  readonly name: string;
  readonly category: EvalCategory;
  readonly description: string;
  readonly moveHistory: readonly number[];
  readonly goldenMoves: readonly number[];
  readonly solverScores?: readonly number[];
  readonly source: EvalSource;
}

export interface EvalScenarioState {
  readonly scenario: EvalScenario;
  readonly state: GameState;
}

export interface EvalCaseExecution {
  readonly scenario: EvalScenario;
  readonly decision: AgentDecision;
  readonly passed: boolean;
  readonly provider: AgentProvider;
}

export interface SearchEvalCaseExecution {
  readonly scenario: EvalScenario;
  readonly selectedMove: number;
  readonly passed: boolean;
  readonly searchDepth: number;
  readonly searchNodes: number;
  readonly searchDurationMs: number;
}
