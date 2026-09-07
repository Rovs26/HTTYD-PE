/**
 * The single source of truth for how a game progresses.
 *
 * Round count, cut lines, titles, default host instructions and the student-facing prompt
 * copy all used to be inlined across ranking.ts, prompts.ts, service.ts, host-dashboard.tsx
 * and student-game.tsx. Changing the shape of the game meant finding every one of them, and
 * the client and server had already drifted into disagreeing about the cut line.
 */

export type RoundConfig = {
  number: number;
  title: string;
  /**
   * Cut line for the round. `keep` is the intended survivor count for a full class; `floor`
   * stops a small class being cut to nothing; `ratio` scales the cut when the class is
   * smaller than the design size. The effective cut is
   * `min(keep, max(floor, ceil(players * ratio)))`, which reproduces the original 10 / 4 for
   * a ~30 student class while still making a meaningful cut in a class of 12.
   */
  cut: { keep: number; floor: number; ratio: number } | null;
  /** Used when the host does not type their own instruction for the next round. */
  defaultInstruction: string | null;
  /** Goal line handed to the image model when building this round's challenge. */
  challengeGoal: string | null;
  /** Student-facing copy for the prompt box. */
  promptLabel: string;
  promptPlaceholder: string;
  /** Host-facing copy for the "next challenge" box while this round is current. */
  nextInstructionPlaceholder: string;
};

export const ROUNDS: RoundConfig[] = [
  {
    number: 1,
    title: "Round 1: Create Your Dragon",
    cut: { keep: 10, floor: 4, ratio: 0.5 },
    defaultInstruction:
      "Train your dragon into a richer scene: add a clear background, interaction, trainer moment, or flight movement while preserving the dragon's identity.",
    challengeGoal: null,
    promptLabel: "Write your dragon prompt",
    promptPlaceholder:
      "Describe the dragon, setting, light, mood, camera angle, texture, and style...",
    nextInstructionPlaceholder:
      "Add a scene challenge: the dragon meets a trainer, flies over cliffs, enters a village, or interacts with the background..."
  },
  {
    number: 2,
    title: "Round 2: Train the Scene",
    cut: { keep: 4, floor: 2, ratio: 0.5 },
    defaultInstruction:
      "Give your dragon a final training trial: add dynamic action, a difficult environment, story stakes, precise composition, and dramatic lighting while preserving the dragon's identity.",
    challengeGoal:
      "Round 2 training goal: keep the same dragon identity, then add a clear interaction, trainer moment, flight movement, or richer background setting.",
    promptLabel: "Add a follow-up instruction",
    promptPlaceholder: "Improve your earlier prompt with one strong new instruction...",
    nextInstructionPlaceholder:
      "Add the final trial: storm flight, rescue scene, dangerous terrain, story stakes, dramatic lighting, and precise composition..."
  },
  {
    number: 3,
    title: "Round 3: Final Dragon Trial",
    // No cut: reaching the end of this round ends the game.
    cut: null,
    defaultInstruction: null,
    challengeGoal:
      "Round 3 final trial goal: keep the same dragon identity, then add a harder multi-part challenge with action, environment pressure, story stakes, precise composition, and dramatic lighting.",
    promptLabel: "Add a follow-up instruction",
    promptPlaceholder: "Improve your earlier prompt with one strong new instruction...",
    nextInstructionPlaceholder:
      "This is the final round — advancing from here ends the game and reveals the winners."
  }
];

export const TOTAL_ROUNDS = ROUNDS.length;

export function roundConfig(roundNumber: number): RoundConfig | null {
  return ROUNDS.find((round) => round.number === roundNumber) ?? null;
}

export function roundTitle(roundNumber: number) {
  return roundConfig(roundNumber)?.title ?? `Round ${roundNumber}`;
}

export function isFinalRound(roundNumber: number) {
  return roundNumber >= TOTAL_ROUNDS;
}

/** True for the round where a student writes their dragon from scratch. */
export function isOpeningRound(roundNumber: number) {
  return roundNumber === 1;
}

export function defaultInstructionFor(roundNumber: number) {
  return roundConfig(roundNumber)?.defaultInstruction ?? null;
}

/**
 * How many players survive this round. Returns 0 for the final round, which is what ends
 * the game.
 */
export function advancingCount(roundNumber: number, rankedPlayerCount: number) {
  const cut = roundConfig(roundNumber)?.cut;
  if (!cut || rankedPlayerCount <= 0) {
    return 0;
  }

  const scaled = Math.ceil(rankedPlayerCount * cut.ratio);
  const target = Math.min(cut.keep, Math.max(cut.floor, scaled));
  return Math.min(target, rankedPlayerCount);
}

/** The nominal cut line for a round, ignoring class size. 0 means the game ends here. */
export function nextRoundCutLine(roundNumber: number) {
  return roundConfig(roundNumber)?.cut?.keep ?? 0;
}
