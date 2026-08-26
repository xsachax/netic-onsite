import type { GameState } from "@/domain/connect4";
import type { SearchResult } from "./search";

export type AgentProvider = "openai" | "anthropic";
export type AgentStrategy =
  | "llm-tools"
  | "tactical-guard"
  | "search-fallback";

export interface AgentToolCall {
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
}

export interface AgentUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface ModelDecision {
  readonly column: number;
  readonly explanation: string;
  readonly toolCalls: readonly AgentToolCall[];
  readonly usage: AgentUsage;
}

export interface ModelDecisionRequest {
  readonly state: GameState;
  readonly searchDepth: number;
  readonly validationFeedback?: string;
}

export interface AgentDecisionModel {
  readonly provider: AgentProvider;
  readonly model: string;
  decide(request: ModelDecisionRequest): Promise<ModelDecision>;
}

export interface AgentTrace {
  readonly id: string;
  readonly timestamp: string;
  readonly strategy: AgentStrategy;
  readonly provider: AgentProvider | null;
  readonly model: string | null;
  readonly gameVersion: number;
  readonly legalMoves: readonly number[];
  readonly search: Pick<SearchResult, "depth" | "nodes" | "durationMs"> & {
    readonly topMoves: SearchResult["moves"];
  };
  readonly toolCalls: readonly AgentToolCall[];
  readonly attempts: number;
  readonly usage: AgentUsage;
  readonly latencyMs: number;
  readonly fallbackReason: string | null;
}

export interface AgentDecision {
  readonly column: number;
  readonly explanation: string;
  readonly trace: AgentTrace;
}

export type AgentDifficulty = "easy" | "medium" | "hard";
