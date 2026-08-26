export {
  DatabaseUnavailableError,
  getDatabase,
  isDatabaseConfigured,
} from "./client";
export {
  commitPersistentTurn,
  createPersistentGame,
  GameDataIntegrityError,
  type GameAnalytics,
  GameVersionConflictError,
  getGameAnalytics,
  getPersistentCommandResult,
  getPersistentGame,
  type PersistentGame,
  PersistentGameNotFoundError,
} from "./repository";
