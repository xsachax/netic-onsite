import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DatabaseUnavailableError,
  GameVersionConflictError,
  PersistentGameNotFoundError,
} from "@/db";
import { GameRuleError } from "@/domain/connect4";
import { persistentTurnRequestSchema } from "@/game/contracts";
import { executePersistentTurn } from "@/game/persistent-turn";

export const runtime = "nodejs";
export const maxDuration = 30;

const gameIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
): Promise<NextResponse> {
  const { gameId } = await context.params;
  if (!gameIdSchema.safeParse(gameId).success) {
    return errorResponse(400, "INVALID_GAME_ID", "Game ID must be a UUID.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse(400, "INVALID_JSON", "Request body is not JSON.");
    }
    throw error;
  }

  const parsed = persistentTurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Request validation failed.",
    );
  }

  try {
    const result = await executePersistentTurn({
      gameId,
      ...parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PersistentGameNotFoundError) {
      return errorResponse(404, "GAME_NOT_FOUND", error.message);
    }
    if (error instanceof GameVersionConflictError) {
      return NextResponse.json(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: error.message,
            actualVersion: error.actualVersion,
          },
        },
        { status: 409 },
      );
    }
    if (error instanceof GameRuleError) {
      return errorResponse(409, error.code, error.message);
    }
    if (error instanceof DatabaseUnavailableError) {
      return errorResponse(503, "DATABASE_UNAVAILABLE", error.message);
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
