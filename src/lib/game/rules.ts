import type {
  GeneratedImage,
  HostAction,
  PromptSubmission,
  RoundStatus,
  ScoringMode
} from "@/lib/types";

export function scoringModeNeedsAiScores(scoringMode: ScoringMode) {
  return scoringMode !== "voting_only";
}

export function scoringModeNeedsVoting(scoringMode: ScoringMode) {
  return scoringMode !== "ai_only";
}

/**
 * The round statuses each host action may legally be applied from.
 *
 * `close_voting` is the one action whose legal origin depends on the scoring mode: an
 * `ai_only` game never opens voting, so it finalizes straight out of `generating`.
 */
export function allowedStatusesForAction(
  action: HostAction,
  scoringMode: ScoringMode
): RoundStatus[] {
  switch (action) {
    case "open_submissions":
      return ["setup"];
    case "close_submissions":
      return ["submissions"];
    case "open_voting":
      return scoringModeNeedsVoting(scoringMode) ? ["generating"] : [];
    case "close_voting":
      return scoringModeNeedsVoting(scoringMode) ? ["voting"] : ["generating"];
    case "end_game":
      // The host always needs an escape hatch, from any point in the round.
      return ["setup", "submissions", "generating", "voting", "scored", "complete"];
  }
}

export function canApplyHostAction(
  status: RoundStatus,
  action: HostAction,
  scoringMode: ScoringMode = "voting_first"
) {
  return allowedStatusesForAction(action, scoringMode).includes(status);
}

export function roundReadinessIssue(input: {
  submissions: Pick<PromptSubmission, "id" | "player_id">[];
  images: Pick<
    GeneratedImage,
    | "prompt_submission_id"
    | "player_id"
    | "generation_status"
    | "image_url"
    | "ai_similarity_score"
  >[];
  requireAiScores: boolean;
}) {
  if (!input.submissions.length) {
    return "At least one prompt must be submitted before continuing.";
  }

  const imageBySubmission = new Map(
    input.images.map((image) => [image.prompt_submission_id, image])
  );

  for (const submission of input.submissions) {
    const image = imageBySubmission.get(submission.id);
    if (!image || image.player_id !== submission.player_id) {
      return "Every submitted prompt must have a generated image before continuing.";
    }

    // A skipped submission is deliberately excluded from the round by the host.
    if (image.generation_status === "skipped") {
      continue;
    }

    if (image.generation_status !== "complete" || !image.image_url) {
      return "Every submitted prompt must have a completed image before continuing. Retry or skip the ones that failed.";
    }

    if (input.requireAiScores && image.ai_similarity_score === null) {
      return "Every completed image must have an AI score before continuing with this scoring mode.";
    }
  }

  return null;
}
