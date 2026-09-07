"use client";

import { useMemo } from "react";
import {
  allAiScoresReady as computeAllAiScoresReady,
  allImagesReady as computeAllImagesReady,
  needsHostAttention,
  requiresAiScoring as computeRequiresAiScoring,
  requiresVoting as computeRequiresVoting
} from "@/lib/game/round-gating";
import type { GameState } from "@/lib/types";

/**
 * Which host actions are legal right now.
 *
 * These were twenty-five derived booleans inlined in the dashboard render. The server
 * enforces the same rules in rules.ts — this exists so the buttons agree with it, not so the
 * browser can decide.
 */
export function useRoundGating(state: GameState | null) {
  return useMemo(() => {
    const currentRound = state?.currentRound ?? null;
    const roundId = currentRound?.id;

    const submissions =
      state?.submissions.filter((submission) => submission.round_id === roundId) ?? [];
    const images =
      state?.generatedImages.filter((image) => image.round_id === roundId) ?? [];
    const votes = state?.votes.filter((vote) => vote.round_id === roundId) ?? [];
    const rankings = state?.rankings.filter((ranking) => ranking.round_id === roundId) ?? [];

    const completedImages = images.filter((image) => image.generation_status === "complete");
    const scoredImages = completedImages.filter((image) => image.ai_similarity_score !== null);
    // Anything neither finished nor deliberately dropped still needs the host, including a
    // row wedged in "generating" whose automatic attempts are spent.
    const blockedImages = images.filter(needsHostAttention);

    const scoringMode = state?.session.scoring_mode ?? "voting_first";
    const requiresVoting = computeRequiresVoting(scoringMode);
    const requiresAiScoring = computeRequiresAiScoring(scoringMode);

    // A skipped image is a resolved image.
    const allImagesReady = computeAllImagesReady({ submissions, images });
    const allAiScoresReady = computeAllAiScoresReady({ images, scoringMode });
    const rankingsReady = submissions.length > 0 && rankings.length === submissions.length;
    const generationStarted = images.some(
      (image) =>
        image.generation_status === "generating" || image.generation_status === "complete"
    );

    return {
      currentRound,
      submissions,
      images,
      votes,
      rankings,
      completedImages,
      scoredImages,
      blockedImages,
      activePlayers: state?.players.filter((player) => !player.is_eliminated) ?? [],
      scoringMode,
      requiresVoting,
      requiresAiScoring,
      allImagesReady,
      allAiScoresReady,
      rankingsReady,

      canOpenSubmissions: Boolean(
        currentRound &&
          !currentRound.submission_open &&
          !currentRound.voting_open &&
          !generationStarted &&
          currentRound.status !== "scored"
      ),
      canCloseSubmissions: Boolean(currentRound?.submission_open),
      canGenerate: Boolean(
        currentRound &&
          !currentRound.submission_open &&
          !currentRound.voting_open &&
          submissions.length > 0 &&
          !allImagesReady
      ),
      canOpenVoting: Boolean(
        requiresVoting &&
          currentRound &&
          !currentRound.submission_open &&
          !currentRound.voting_open &&
          currentRound.status !== "scored" &&
          allImagesReady
      ),
      canCloseVoting: Boolean(
        currentRound &&
          (requiresVoting
            ? currentRound.voting_open
            : allImagesReady && allAiScoresReady && currentRound.status !== "scored")
      ),
      canScoreImages: Boolean(
        requiresAiScoring &&
          currentRound &&
          allImagesReady &&
          !currentRound.submission_open &&
          !currentRound.voting_open &&
          (!requiresVoting || currentRound.status === "scored") &&
          !allAiScoresReady
      ),
      canRecomputeRankings: Boolean(
        currentRound?.status === "scored" && allImagesReady && allAiScoresReady
      ),
      canAdvance: Boolean(
        currentRound?.status === "scored" &&
          !currentRound.submission_open &&
          !currentRound.voting_open &&
          allImagesReady &&
          allAiScoresReady &&
          rankingsReady
      )
    };
  }, [state]);
}
