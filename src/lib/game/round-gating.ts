import type { GameGeneratedImage, GamePromptSubmission, ScoringMode } from "@/lib/types";

/**
 * Pure round-readiness predicates, shared by the host dashboard's button states.
 *
 * Kept separate from the React hook so they can be tested without rendering anything — the
 * original twenty-five inline booleans could not be.
 */

export function isResolved(image: Pick<GameGeneratedImage, "generation_status" | "image_url">) {
  return (
    image.generation_status === "skipped" ||
    (image.generation_status === "complete" && Boolean(image.image_url))
  );
}

export function needsHostAttention(
  image: Pick<GameGeneratedImage, "generation_status">
) {
  // A row wedged in "generating" counts: once its automatic attempts are spent nothing
  // requeues it, so only a manual retry or skip can unblock the round.
  return image.generation_status !== "complete" && image.generation_status !== "skipped";
}

export function allImagesReady(input: {
  submissions: Pick<GamePromptSubmission, "id">[];
  images: Pick<GameGeneratedImage, "generation_status" | "image_url">[];
}) {
  return (
    input.submissions.length > 0 &&
    input.images.length === input.submissions.length &&
    input.images.every(isResolved)
  );
}

export function allAiScoresReady(input: {
  images: Pick<GameGeneratedImage, "generation_status" | "ai_similarity_score">[];
  scoringMode: ScoringMode;
}) {
  if (input.scoringMode === "voting_only") {
    return true;
  }
  const completed = input.images.filter((image) => image.generation_status === "complete");
  return completed.every((image) => image.ai_similarity_score !== null);
}

export function requiresVoting(scoringMode: ScoringMode) {
  return scoringMode !== "ai_only";
}

export function requiresAiScoring(scoringMode: ScoringMode) {
  return scoringMode !== "voting_only";
}
