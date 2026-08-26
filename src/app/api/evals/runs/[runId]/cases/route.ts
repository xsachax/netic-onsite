import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_POLICY_VERSION } from "@/agent";
import {
  DatabaseUnavailableError,
  EvalRunNotFoundError,
  EvalScenarioNotInRunError,
  getEvalRun,
  recordEvalExecution,
  recordEvalFailure,
} from "@/db";
import {
  EVAL_DATASET_VERSION,
  executeEvalCaseRequestSchema,
  executeEvalScenario,
  findEvalScenario,
} from "@/evals";

export const runtime = "nodejs";
export const maxDuration = 30;

const runIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await context.params;
  if (!runIdSchema.safeParse(runId).success) {
    return errorResponse(400, "INVALID_RUN_ID", "Run ID must be a UUID.");
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

  const parsed = executeEvalCaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Request validation failed.",
    );
  }

  try {
    const run = await getEvalRun(runId);
    if (run.datasetVersion !== EVAL_DATASET_VERSION) {
      return errorResponse(
        409,
        "DATASET_VERSION_MISMATCH",
        `Run ${runId} belongs to dataset ${run.datasetVersion}.`,
      );
    }
    if (run.policyVersion !== AGENT_POLICY_VERSION) {
      return errorResponse(
        409,
        "POLICY_VERSION_MISMATCH",
        `Run ${runId} belongs to policy ${run.policyVersion}.`,
      );
    }

    const scenario = findEvalScenario(parsed.data.scenarioId);
    if (!scenario) {
      return errorResponse(
        404,
        "EVAL_SCENARIO_NOT_FOUND",
        `Evaluation scenario ${parsed.data.scenarioId} was not found.`,
      );
    }

    const ordinal = run.scenarioIds.indexOf(scenario.id);
    if (ordinal === -1) {
      throw new EvalScenarioNotInRunError(run.id, scenario.id);
    }

    if (run.results.some((result) => result.scenarioId === scenario.id)) {
      return NextResponse.json({ run });
    }

    let execution: Awaited<ReturnType<typeof executeEvalScenario>>;
    try {
      execution = await executeEvalScenario({
        scenario,
        provider: run.provider,
      });
    } catch (executionError) {
      return NextResponse.json({
        run: await recordEvalFailure({
          run,
          ordinal,
          scenario,
          error: describeExecutionError(executionError),
        }),
      });
    }

    return NextResponse.json({
      run: await recordEvalExecution({ run, ordinal, execution }),
    });
  } catch (error) {
    if (error instanceof EvalRunNotFoundError) {
      return errorResponse(404, "EVAL_RUN_NOT_FOUND", error.message);
    }
    if (error instanceof EvalScenarioNotInRunError) {
      return errorResponse(409, "SCENARIO_NOT_IN_RUN", error.message);
    }
    if (error instanceof DatabaseUnavailableError) {
      return errorResponse(503, "DATABASE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}

function describeExecutionError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "The agent failed without a structured error.";
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
