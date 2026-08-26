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
import { inspectMove } from "./search";
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

The observation contains an authoritative deterministic move ranking and exactly
one admissible column selected by search. You must play that column and explain
it. Do not override the ranking or choose a search depth.

You must interact through tools, then finish by calling playMove exactly once.
Never invent or modify board state. Keep the explanation brief and do not expose
hidden chain-of-thought.`;

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
        "Return the authoritative precomputed deterministic move ranking.",
      inputSchema: z.object({}),
      execute: async (input) => {
        const output = {
          depth: request.searchDepth,
          moves: request.rankedMoves,
          admissibleColumns: request.admissibleColumns,
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
        "Play the single authoritative admissible column and explain the move.",
      inputSchema: actionSchema,
      execute: async (input) => {
        proposedAction = input;
        const isLegal = legalMoves.includes(input.column);
        const isAdmissible = request.admissibleColumns.includes(input.column);
        const output = {
          accepted: isLegal && isAdmissible,
          error: !isLegal
            ? `Column ${input.column} is not currently legal.`
            : !isAdmissible
              ? `Column ${input.column} is legal but search selected column ${request.admissibleColumns[0]}.`
              : null,
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
    authoritativeSearch: {
      depth: request.searchDepth,
      rankedMoves: request.rankedMoves,
    },
    admissibleColumns: request.admissibleColumns,
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
    temperature: 0,
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
