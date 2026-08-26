import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  simulateGames,
  simulationPolicySchema,
  type SimulationOptions,
} from "./simulation";

void main();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputPath = resolve(
    readArgument(args, "--output") ?? "eval-data/generated-candidates.json",
  );
  const options: SimulationOptions = {
    games: readInteger(args, "--games", 100),
    seed: readInteger(args, "--seed", 4_204),
    playerOnePolicy: simulationPolicySchema.parse(
      readArgument(args, "--player-one") ?? "random",
    ),
    playerTwoPolicy: simulationPolicySchema.parse(
      readArgument(args, "--player-two") ?? "search",
    ),
    candidateCount: readInteger(args, "--candidates", 40),
    baselineDepth: readInteger(args, "--baseline-depth", 7),
  };

  const batch = simulateGames(options);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");

  console.log("Automated Connect Four data generation");
  console.log("======================================");
  console.log(
    `${batch.summary.games} games: ${batch.summary.playerOneWins} P1 wins, ` +
      `${batch.summary.playerTwoWins} P2 wins, ${batch.summary.draws} draws`,
  );
  console.log(
    `${batch.summary.capturedPositions} captured positions, ` +
      `${batch.summary.uniquePositions} unique, ` +
      `${batch.summary.candidates} exported`,
  );
  console.log(
    `Policies: ${options.playerOnePolicy} vs ${options.playerTwoPolicy}; ` +
      `seed ${options.seed}; approximate baseline depth ${options.baselineDepth}`,
  );
  console.log(`Output: ${outputPath}`);
}

function readInteger(
  values: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = readArgument(values, name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
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
