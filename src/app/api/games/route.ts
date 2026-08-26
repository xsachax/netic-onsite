import { NextResponse } from "next/server";
import { createPersistentGame, DatabaseUnavailableError } from "@/db";
import { createGameRequestSchema } from "@/game/contracts";

export const runtime = "nodejs";

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

  const parsed = createGameRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Request validation failed.",
    );
  }

  try {
    const game = await createPersistentGame(parsed.data);
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
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
