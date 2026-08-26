import { z } from "zod";
import { agentDecisionSchema } from "@/game/contracts";

export const evalCategorySchema = z.enum([
  "win",
  "block",
  "tactics",
  "strategy",
  "endgame",
]);

export const evalSourceSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  method: z.string(),
});

export const evalScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: evalCategorySchema,
  description: z.string(),
  moveHistory: z.array(z.number().int().min(0).max(6)).max(41),
  goldenMoves: z.array(z.number().int().min(0).max(6)).min(1),
  solverScores: z.array(z.number().int()).length(7).optional(),
  source: evalSourceSchema,
});

export const evalResultSchema = z.object({
  scenarioId: z.string(),
  ordinal: z.number().int().nonnegative(),
  scenarioName: z.string(),
  category: z.string(),
  moveHistory: z.array(z.number().int().min(0).max(6)),
  goldenMoves: z.array(z.number().int().min(0).max(6)),
  selectedMove: z.number().int().min(0).max(6).nullable(),
  passed: z.boolean(),
  strategy: z.string().nullable(),
  explanation: z.string().nullable(),
  trace: agentDecisionSchema.shape.trace.nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().nullable(),
  searchDepth: z.number().int().min(1).max(8).nullable(),
  searchNodes: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export const evalRunSchema = z.object({
  id: z.string().uuid(),
  datasetVersion: z.string(),
  policyVersion: z.string(),
  benchmarkType: z.enum(["agent", "search"]),
  searchDepth: z.number().int().min(1).max(8).nullable(),
  scenarioIds: z.array(z.string()),
  provider: z.enum(["openai", "anthropic"]).nullable(),
  status: z.enum(["running", "completed"]),
  totalCases: z.number().int().positive(),
  completedCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  results: z.array(evalResultSchema),
});

export const evalOverviewSchema = z.object({
  datasetVersion: z.string(),
  scenarios: z.array(evalScenarioSchema),
  recentRuns: z.array(evalRunSchema),
});

export const createEvalRunRequestSchema = z.object({
  scenarioIds: z.array(z.string()).min(1).max(30),
  searchDepth: z.number().int().min(1).max(8),
});

export const executeEvalCaseRequestSchema = z.object({
  scenarioId: z.string(),
});

export const evalRunResponseSchema = z.object({
  run: evalRunSchema,
});

export type EvalOverviewContract = z.infer<typeof evalOverviewSchema>;
export type EvalRunContract = z.infer<typeof evalRunSchema>;
export type EvalScenarioContract = z.infer<typeof evalScenarioSchema>;
