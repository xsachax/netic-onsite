import { z } from "zod";

const playerSchema = z.union([z.literal(1), z.literal(2)]);
const cellSchema = z.union([z.literal(0), playerSchema]);
const positionSchema = z.object({
  row: z.number().int().min(0).max(5),
  column: z.number().int().min(0).max(6),
});
const moveSchema = positionSchema.extend({
  number: z.number().int().positive(),
  player: playerSchema,
});

export const gameStateSchema = z.object({
  board: z.array(z.array(cellSchema).length(7)).length(6),
  currentPlayer: playerSchema,
  status: z.enum(["playing", "won", "draw"]),
  winner: playerSchema.nullable(),
  winningLine: z.array(positionSchema).nullable(),
  moves: z.array(moveSchema),
  version: z.number().int().nonnegative(),
});

const moveAnalysisSchema = z.object({
  column: z.number().int().min(0).max(6),
  score: z.number(),
  category: z.enum(["immediate-win", "forced-block", "safe", "risky"]),
  principalVariation: z.array(z.number().int().min(0).max(6)),
  opponentWinningReplies: z.array(z.number().int().min(0).max(6)),
});

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
});

const toolCallSchema = z.object({
  name: z.string(),
  input: z.unknown(),
  output: z.unknown(),
});

export const agentDecisionSchema = z.object({
  column: z.number().int().min(0).max(6),
  explanation: z.string(),
  trace: z.object({
    id: z.string(),
    timestamp: z.string(),
    strategy: z.enum(["llm-tools", "tactical-guard", "search-fallback"]),
    provider: z.enum(["openai", "anthropic"]).nullable(),
    model: z.string().nullable(),
    gameVersion: z.number().int().nonnegative(),
    legalMoves: z.array(z.number().int().min(0).max(6)),
    search: z.object({
      depth: z.number().int().positive(),
      nodes: z.number().int().nonnegative(),
      durationMs: z.number().nonnegative(),
      topMoves: z.array(moveAnalysisSchema),
    }),
    toolCalls: z.array(toolCallSchema),
    attempts: z.number().int().nonnegative(),
    usage: usageSchema,
    latencyMs: z.number().nonnegative(),
    fallbackReason: z.string().nullable(),
  }),
});

export const turnRequestSchema = z.object({
  moves: z.array(z.number().int().min(0).max(6)).max(42),
  column: z.number().int().min(0).max(6),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  provider: z.enum(["openai", "anthropic"]).default("openai"),
});

export const turnResponseSchema = z.object({
  state: gameStateSchema,
  agentDecision: agentDecisionSchema.nullable(),
});

const providerSchema = z.object({
  available: z.boolean(),
  model: z.string(),
});

export const configResponseSchema = z.object({
  providers: z.object({
    openai: providerSchema,
    anthropic: providerSchema,
  }),
  defaultProvider: z.enum(["openai", "anthropic"]),
});

export type GameStateContract = z.infer<typeof gameStateSchema>;
export type AgentDecisionContract = z.infer<typeof agentDecisionSchema>;
export type TurnRequest = z.infer<typeof turnRequestSchema>;
export type TurnResponse = z.infer<typeof turnResponseSchema>;
export type ConfigResponse = z.infer<typeof configResponseSchema>;
