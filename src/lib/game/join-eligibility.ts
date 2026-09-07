import type { GameStatus, Round } from "@/lib/types";

/**
 * Whether someone joining right now has missed their chance to compete.
 *
 * Students scan the QR code after the host has already pressed Start, so "the game is
 * active" is far too aggressive a test — using it made every late arrival a spectator who
 * could never type a prompt. Someone has only genuinely missed out once the game has moved
 * past round one, or round one has stopped taking prompts.
 */
export function joinsAsSpectator(input: {
  sessionStatus: GameStatus;
  currentRoundNumber: number;
  round: Pick<Round, "status" | "submission_open"> | null;
}) {
  if (input.sessionStatus !== "active") {
    return false;
  }
  if (input.currentRoundNumber > 1) {
    return true;
  }
  if (!input.round) {
    return false;
  }
  return !(input.round.status === "setup" || input.round.submission_open);
}
