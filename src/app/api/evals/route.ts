import { NextResponse } from "next/server";
import { DatabaseUnavailableError, listEvalRuns } from "@/db";
import { EVAL_DATASET_VERSION, EVAL_SCENARIOS } from "@/evals";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const recentRuns = await listEvalRuns();
    return NextResponse.json({
      datasetVersion: EVAL_DATASET_VERSION,
      scenarios: EVAL_SCENARIOS,
      recentRuns,
    });
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
