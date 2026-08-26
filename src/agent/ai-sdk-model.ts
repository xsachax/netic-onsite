import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import {
  generateText,
  hasToolCall,
  stepCountIs,
  tool,
} from "ai";
import { z } from "zod";
import { getLegalMoves } from "@/domain/connect4";
import { analyzeMoves, inspectMove } from "./search";
import type {
  AgentDecisionModel,
  AgentProvider,
  AgentToolCall,
  ModelDecision,
  ModelDecisionRequest,
} from "./types";

const actionSchema = z.object({
  column: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe("The zero-indexed column in which to drop the piece."),
  explanation: z
    .string()
    .min(1)
    .max(240)
    .describe("A concise, player-facing explanation of the move."),
});

const SYSTEM_PROMPT = `You are a Connect 4 decision-making agent.
You are player 2. The board is 6 rows by 7 columns and uses 0 for empty,
1 for the human, and 2 for you. Pieces fall to the lowest open row.

You must interact through tools. Inspect the legal moves and tactical analysis,
then finish by calling playMove exactly once. Never invent or modify board state.
Priorities: win immediately, block an immediate loss, avoid giving the opponent
an immediate win, and then maximize long-term position. Keep the explanation
brief and do not expose hidden chain-of-thought.`;

export function createConfiguredModel(
  provider: AgentProvider,
): AgentDecisionModel | null {
  const hasApiKey =
    provider === "openai"
      ? Boolean(process.env.OPENAI_API_KEY)
      : Boolean(process.env.ANTHROPIC_API_KEY);

  if (!hasApiKey) {
    return null;
  }

  const model =
    provider === "openai"
      ? (process.env.OPENAI_MODEL ?? "gpt-5.4-mini")
      : (process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5");

  return {
    provider,
    model,
    decide: (request) => decideWithTools(provider, model, request),
  };
}

async function decideWithTools(
  provider: AgentProvider,
  modelName: string,
  request: ModelDecisionRequest,
): Promise<ModelDecision> {
  const toolCalls: AgentToolCall[] = [];
  let proposedAction: z.infer<typeof actionSchema> | null = null;
  const legalMoves = getLegalMoves(request.state);

  const tools = {
    getLegalMoves: tool({
      description: "Return the columns that are legal in the current state.",
      inputSchema: z.object({}),
      execute: async (input) => {
        const output = { columns: legalMoves };
        toolCalls.push({ name: "getLegalMoves", input, output });
        return output;
      },
    }),
    analyzeMoves: tool({
      description:
        "Rank every legal move with deterministic alpha-beta search.",
      inputSchema: z.object({
        depth: z.number().int().min(1).max(request.searchDepth),
      }),
      execute: async (input) => {
        const result = analyzeMoves(request.state, { depth: input.depth });
        const output = {
          depth: result.depth,
          nodes: result.nodes,
          moves: result.moves,
        };
        toolCalls.push({ name: "analyzeMoves", input, output });
        return output;
      },
    }),
    inspectMove: tool({
      description:
        "Inspect one candidate move for immediate wins, blocks, and risky replies.",
      inputSchema: z.object({
        column: z.number().int().min(0).max(6),
      }),
      execute: async (input) => {
        const output = inspectMove(request.state, input.column);
        toolCalls.push({ name: "inspectMove", input, output });
        return output;
      },
    }),
    playMove: tool({
      description:
        "Propose the final Connect 4 action. The game engine validates it.",
      inputSchema: actionSchema,
      execute: async (input) => {
        proposedAction = input;
        const output = {
          accepted: legalMoves.includes(input.column),
          error: legalMoves.includes(input.column)
            ? null
            : `Column ${input.column} is not currently legal.`,
        };
        toolCalls.push({ name: "playMove", input, output });
        return output;
      },
    }),
  };

  const selectedModel =
    provider === "openai" ? openai(modelName) : anthropic(modelName);
  const observation = {
    board: request.state.board,
    currentPlayer: request.state.currentPlayer,
    legalMoves,
    moveHistory: request.state.moves.map(({ player, column }) => ({
      player,
      column,
    })),
    validationFeedback: request.validationFeedback ?? null,
  };

  const result = await generateText({
    model: selectedModel,
    instructions: SYSTEM_PROMPT,
    prompt: `Choose the next action from this observation:\n${JSON.stringify(
      observation,
    )}`,
    tools,
    toolChoice: "required",
    stopWhen: [hasToolCall("playMove"), stepCountIs(5)],
    maxRetries: 1,
    timeout: 12_000,
  });

  if (proposedAction === null) {
    throw new Error("The model did not call playMove.");
  }

  const action: z.infer<typeof actionSchema> = proposedAction;

  return {
    column: action.column,
    explanation: action.explanation,
    toolCalls,
    usage: {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null,
    },
  };
}
