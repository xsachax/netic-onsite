import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { executeEvalScenario } from "./evaluator";
import {
  simulationBatchSchema,
  type GeneratedEvalCandidate,
} from "./simulation";
import type { EvalCategory, EvalScenario } from "./types";
import { z } from "zod";

void main();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputPath = resolve(
    readArgument(args, "--input") ?? "eval-data/generated-candidates.json",
  );
  const outputArgument = readArgument(args, "--output");
  const provider = z
    .enum(["openai", "anthropic"])
    .parse(readArgument(args, "--provider") ?? "openai");
  const limit = readInteger(args, "--limit", 10);
  const batch = simulationBatchSchema.parse(
    JSON.parse(await readFile(inputPath, "utf8")),
  );
  const candidates = batch.candidates.slice(0, limit);
  const results = [];

  console.log(
    `Evaluating ${candidates.length} generated positions with ${provider}`,
  );
  console.log(
    `Baseline: approximate depth ${batch.options.baselineDepth}, ` +
      "not perfect-solver ground truth",
  );

  for (const candidate of candidates) {
    const scenario = candidateScenario(candidate, batch.options.seed);
    try {
      const execution = await executeEvalScenario({
        scenario,
        provider,
      });
      results.push({
        scenarioId: scenario.id,
        passed: execution.passed,
        selectedMove: execution.decision.column,
        goldenMoves: scenario.goldenMoves,
        trace: execution.decision.trace,
        error: null,
      });
      console.log(
        `${execution.passed ? "PASS" : "FAIL"} ${scenario.id}: ` +
          `selected ${execution.decision.column + 1}, baseline ` +
          scenario.goldenMoves.map((move) => move + 1).join("/"),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        scenarioId: scenario.id,
        passed: false,
        selectedMove: null,
        goldenMoves: scenario.goldenMoves,
        trace: null,
        error: message,
      });
      console.log(`ERROR ${scenario.id}: ${message}`);
    }
  }

  const passed = results.filter((result) => result.passed).length;
  console.log(`Accuracy: ${passed}/${results.length}`);

  if (outputArgument) {
    const outputPath = resolve(outputArgument);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          source: inputPath,
          provider,
          baselineExact: false,
          passed,
          total: results.length,
          results,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`Results: ${outputPath}`);
  }
}

function candidateScenario(
  candidate: GeneratedEvalCandidate,
  seed: number,
): EvalScenario {
  return {
    id: candidate.id,
    name: `Generated game ${candidate.gameNumber}, ply ${candidate.ply}`,
    category: categoryForCandidate(candidate),
    description:
      `Automated ${candidate.stage} position using a fixed depth-` +
      `${candidate.baseline.depth} comparison baseline.`,
    moveHistory: candidate.moveHistory,
    goldenMoves: candidate.baseline.bestMoves,
    source: {
      name: "Seeded automated game",
      url: "https://github.com/xsachax/netic-onsite",
      method:
        `Generated with seed ${seed}; labels are bounded-search candidates, ` +
        "not exact minimax ground truth.",
    },
  };
}

function categoryForCandidate(
  candidate: GeneratedEvalCandidate,
): EvalCategory {
  return candidate.stage === "endgame" ? "endgame" : "strategy";
}

function readInteger(
  values: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = readArgument(values, name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`${name} must be an integer from 1 to 100.`);
  }
  return parsed;
}

function readArgument(
  values: readonly string[],
  name: string,
): string | undefined {
  const index = values.indexOf(name);
  if (index === -1) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}
