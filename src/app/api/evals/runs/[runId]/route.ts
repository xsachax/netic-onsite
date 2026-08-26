import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DatabaseUnavailableError,
  EvalRunNotFoundError,
  getEvalRun,
} from "@/db";

export const runtime = "nodejs";

const runIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await context.params;
  if (!runIdSchema.safeParse(runId).success) {
    return errorResponse(400, "INVALID_RUN_ID", "Run ID must be a UUID.");
  }

  try {
    return NextResponse.json({ run: await getEvalRun(runId) });
  } catch (error) {
    if (error instanceof EvalRunNotFoundError) {
      return errorResponse(404, "EVAL_RUN_NOT_FOUND", error.message);
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
