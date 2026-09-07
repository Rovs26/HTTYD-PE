/**
 * Public surface of the game engine.
 *
 * The implementation lives in focused modules; this file exists so route handlers have one
 * import and so the split can continue without churning them:
 *
 *   schemas.ts       request shapes
 *   session.ts       identity, auth, session lifecycle plumbing
 *   queries.ts       the state clients poll, and the results export
 *   lifecycle.ts     create / unlock / join / configure / tear down
 *   rounds.ts        the round state machine, ranking and elimination
 *   generation.ts    the image and AI-scoring queue
 *   participation.ts what a student does: submit a prompt, cast a vote
 */

export * from "@/lib/game/schemas";
export { getGameState, exportGameResults } from "@/lib/game/queries";
export {
  abandonGame,
  archiveAndCreateNewGame,
  createGame,
  joinGame,
  removePlayer,
  renamePlayer,
  renewGame,
  setPhaseTimer,
  startGame,
  updateGameSettings,
  updateScoring,
  verifyHost
} from "@/lib/game/lifecycle";
export { advanceRound, applyHostAction, recomputeRankings } from "@/lib/game/rounds";
export {
  generateNextImage,
  retryImage,
  scoreNextImage,
  skipImage
} from "@/lib/game/generation";
export { submitPrompt, vote } from "@/lib/game/participation";
