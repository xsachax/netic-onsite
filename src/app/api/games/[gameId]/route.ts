import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DatabaseUnavailableError,
  getPersistentGame,
  PersistentGameNotFoundError,
} from "@/db";

export const runtime = "nodejs";

const gameIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
): Promise<NextResponse> {
  const { gameId } = await context.params;
  if (!gameIdSchema.safeParse(gameId).success) {
    return errorResponse(400, "INVALID_GAME_ID", "Game ID must be a UUID.");
  }

  try {
    const game = await getPersistentGame(gameId);
    return NextResponse.json({ game });
  } catch (error) {
    if (error instanceof PersistentGameNotFoundError) {
      return errorResponse(404, "GAME_NOT_FOUND", error.message);
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
