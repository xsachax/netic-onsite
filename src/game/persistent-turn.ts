import {
  chooseAgentMove,
  createConfiguredModel,
  type AgentDifficulty,
  type AgentProvider,
} from "@/agent";
import { applyMove, GameRuleError } from "@/domain/connect4";
import {
  commitPersistentTurn,
  GameVersionConflictError,
  getPersistentCommandResult,
  getPersistentGame,
  type PersistentGame,
} from "@/db";

export async function executePersistentTurn(options: {
  readonly gameId: string;
  readonly column: number;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly difficulty: AgentDifficulty;
  readonly provider: AgentProvider;
}): Promise<{
  readonly game: PersistentGame;
  readonly duplicate: boolean;
}> {
  const existingResult = await getPersistentCommandResult(
    options.gameId,
    options.idempotencyKey,
  );
  if (existingResult) {
    return { game: existingResult, duplicate: true };
  }

  const game = await getPersistentGame(options.gameId);
  if (game.state.version !== options.expectedVersion) {
    throw new GameVersionConflictError(
      options.expectedVersion,
      game.state.version,
    );
  }
  if (game.state.status !== "playing") {
    throw new GameRuleError("GAME_OVER", "This game has already ended.");
  }
  if (game.state.currentPlayer !== 1) {
    throw new GameRuleError(
      "WRONG_TURN",
      "The game is waiting for the agent.",
    );
  }

  const afterHumanMove = applyMove(game.state, options.column, 1);
  const humanMove = afterHumanMove.moves.at(-1);
  if (!humanMove) {
    throw new Error("The human move was not recorded.");
  }

  if (afterHumanMove.status !== "playing") {
    return commitPersistentTurn({
      gameId: options.gameId,
      expectedVersion: options.expectedVersion,
      idempotencyKey: options.idempotencyKey,
      difficulty: options.difficulty,
      provider: options.provider,
      resultingState: afterHumanMove,
      humanMove,
      agentMove: null,
      agentDecision: null,
    });
  }

  const agentDecision = await chooseAgentMove({
    state: afterHumanMove,
    difficulty: options.difficulty,
    model: createConfiguredModel(options.provider),
  });
  const resultingState = applyMove(afterHumanMove, agentDecision.column, 2);
  const agentMove = resultingState.moves.at(-1);
  if (!agentMove) {
    throw new Error("The agent move was not recorded.");
  }

  return commitPersistentTurn({
    gameId: options.gameId,
    expectedVersion: options.expectedVersion,
    idempotencyKey: options.idempotencyKey,
    difficulty: options.difficulty,
    provider: options.provider,
    resultingState,
    humanMove,
    agentMove,
    agentDecision,
  });
}
