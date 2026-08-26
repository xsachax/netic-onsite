import { NextResponse } from "next/server";
import { chooseAgentMove, createConfiguredModel } from "@/agent";
import { applyMove, GameRuleError } from "@/domain/connect4";
import { turnRequestSchema } from "@/game/contracts";
import {
  InvalidGameHistoryError,
  replayGame,
} from "@/game/history";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse(400, "INVALID_JSON", "Request body is not JSON.");
    }
    throw error;
  }

  const parsed = turnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Request validation failed.",
    );
  }

  try {
    const initialState = replayGame(parsed.data.moves);

    if (initialState.status !== "playing") {
      return errorResponse(409, "GAME_OVER", "This game has already ended.");
    }
    if (initialState.currentPlayer !== 1) {
      return errorResponse(
        409,
        "WRONG_TURN",
        "The supplied history ends during the agent's turn.",
      );
    }

    const afterHumanMove = applyMove(initialState, parsed.data.column, 1);
    if (afterHumanMove.status !== "playing") {
      return NextResponse.json({
        state: afterHumanMove,
        agentDecision: null,
      });
    }

    const model = createConfiguredModel(parsed.data.provider);
    const agentDecision = await chooseAgentMove({
      state: afterHumanMove,
      difficulty: parsed.data.difficulty,
      model,
    });

    if (agentDecision.trace.gameVersion !== afterHumanMove.version) {
      return errorResponse(
        409,
        "STALE_AGENT_ACTION",
        "The game changed while the agent was deciding.",
      );
    }

    const state = applyMove(afterHumanMove, agentDecision.column, 2);
    return NextResponse.json({ state, agentDecision });
  } catch (error) {
    if (error instanceof InvalidGameHistoryError) {
      return errorResponse(400, "INVALID_HISTORY", error.message);
    }
    if (error instanceof GameRuleError) {
      return errorResponse(409, error.code, error.message);
    }
    throw error;
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
