import { NextResponse } from "next/server";
import { AGENT_POLICY_VERSION } from "@/agent";
import {
  createEvalRun,
  DatabaseUnavailableError,
  EvalRunLimitError,
} from "@/db";
import {
  createEvalRunRequestSchema,
  EVAL_DATASET_VERSION,
  EVAL_SCENARIOS,
} from "@/evals";

export const runtime = "nodejs";

const knownScenarioIds = new Set(EVAL_SCENARIOS.map((scenario) => scenario.id));

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

  const parsed = createEvalRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Request validation failed.",
    );
  }

  const uniqueScenarioIds = [...new Set(parsed.data.scenarioIds)];
  if (uniqueScenarioIds.length !== parsed.data.scenarioIds.length) {
    return errorResponse(
      400,
      "DUPLICATE_SCENARIO",
      "Each scenario can appear only once in a run.",
    );
  }

  const unknownScenarioId = uniqueScenarioIds.find(
    (scenarioId) => !knownScenarioIds.has(scenarioId),
  );
  if (unknownScenarioId) {
    return errorResponse(
      400,
      "UNKNOWN_SCENARIO",
      `Evaluation scenario ${unknownScenarioId} does not exist.`,
    );
  }

  try {
    const run = await createEvalRun({
      datasetVersion: EVAL_DATASET_VERSION,
      policyVersion: AGENT_POLICY_VERSION,
      scenarioIds: uniqueScenarioIds,
      provider: parsed.data.provider,
    });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof EvalRunLimitError) {
      return errorResponse(429, "EVAL_BUDGET_EXCEEDED", error.message);
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
