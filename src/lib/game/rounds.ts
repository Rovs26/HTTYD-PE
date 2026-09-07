import { z } from "zod";
import { generateRoundChallengeImage } from "@/lib/ai/openai";
import {
  advancingCount,
  defaultInstructionFor,
  nextRoundCutLine,
  roundTitle
} from "@/lib/game/progression";
import { computeRankings } from "@/lib/game/ranking";
import {
  canApplyHostAction,
  roundReadinessIssue,
  scoringModeNeedsAiScores
} from "@/lib/game/rules";
import { advanceRoundSchema, hostActionSchema, hostAuthSchema } from "@/lib/game/schemas";
import { AppError } from "@/lib/http";
import { broadcastGameUpdate } from "@/lib/realtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Player, PromptSubmission, Round, ScoringMode, Vote } from "@/lib/types";
import {
  coerceImages,
  getCurrentRound,
  requireHost,
} from "@/lib/game/session";

/** Round sequencing: the state machine, readiness checks, ranking and elimination. */

export async function applyHostAction(
  joinCode: string,
  input: z.infer<typeof hostActionSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);

  if (input.action === "end_game") {
    if (round) {
      // Close the round before ending the game. Leaving it open was actively harmful:
      // students' payloads treat an ended game as "results are in", so an open round would
      // publish every rival's prompt while submissions were still being accepted, and the
      // final standing would render empty because the round never reached a scored status.
      const { error: roundError } = await supabase
        .from("rounds")
        .update({
          submission_open: false,
          voting_open: false,
          status: "complete",
          phase_ends_at: null
        })
        .eq("id", round.id);
      if (roundError) {
        throw roundError;
      }

      await recomputeRankings(joinCode, { hostToken: input.hostToken });
    }

    const { error } = await supabase
      .from("game_sessions")
      .update({ status: "ended" })
      .eq("id", session.id);
    if (error) {
      throw error;
    }
    await broadcastGameUpdate(session.join_code, "game-ended");
    return { ok: true };
  }

  if (!round) {
    throw new AppError("Start the game before changing round state.", 409);
  }

  if (!canApplyHostAction(round.status, input.action, session.scoring_mode)) {
    throw new AppError(
      `Cannot ${input.action.replace(/_/g, " ")} while this round is "${round.status}".`,
      409
    );
  }

  // Both transitions need every image resolved, but neither needs AI scores: the host runs
  // scoring after voting closes. Scores are required at advanceRound, where they decide who
  // is eliminated.
  if (input.action === "open_voting" || input.action === "close_voting") {
    await assertRoundIsReady(round, { requireAiScores: false });
  }

  // Every transition starts a new phase, so the previous phase's countdown must go with it.
  // Otherwise the room keeps staring at a stale "Time's up" through the next phase.
  const updates: Partial<Round> = { phase_ends_at: null };
  if (input.action === "open_submissions") {
    updates.submission_open = true;
    updates.voting_open = false;
    updates.status = "submissions";
  } else if (input.action === "close_submissions") {
    updates.submission_open = false;
    updates.status = "generating";
  } else if (input.action === "open_voting") {
    updates.voting_open = true;
    updates.submission_open = false;
    updates.status = "voting";
  } else if (input.action === "close_voting") {
    updates.voting_open = false;
    updates.status = "scored";
  }

  const { error } = await supabase.from("rounds").update(updates).eq("id", round.id);
  if (error) {
    throw error;
  }

  // Publishing rankings before AI scoring has run would show the class a standing computed
  // from zeros, then silently rewrite it. Wait for the scores this mode actually uses.
  let rankingsPending = false;
  if (input.action === "close_voting") {
    if (await roundHasPendingAiScores(round, session.scoring_mode)) {
      rankingsPending = true;
    } else {
      await recomputeRankings(joinCode, { hostToken: input.hostToken });
    }
  }

  await broadcastGameUpdate(session.join_code, input.action, { roundNumber: round.round_number });
  return { ok: true, rankingsPending };
}

/**
 * True when this scoring mode uses AI scores and at least one image in the round is still
 * missing one.
 */

/**
 * True when this scoring mode uses AI scores and at least one image in the round is still
 * missing one.
 */
async function roundHasPendingAiScores(round: Round, scoringMode: ScoringMode) {
  if (!scoringModeNeedsAiScores(scoringMode)) {
    return false;
  }

  const { count, error } = await getSupabaseAdmin()
    .from("generated_images")
    .select("id", { count: "exact", head: true })
    .eq("round_id", round.id)
    .eq("generation_status", "complete")
    .is("ai_similarity_score", null);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

/**
 * Reads the round's submissions and images and throws if the round is not ready to move on.
 * This is the server-side twin of the host dashboard's disabled buttons — without it the
 * whole round sequence is enforced only in the browser.
 */
async function assertRoundIsReady(round: Round, options: { requireAiScores: boolean }) {
  const supabase = getSupabaseAdmin();
  const [{ data: submissions, error: submissionsError }, { data: images, error: imagesError }] =
    await Promise.all([
      supabase.from("prompt_submissions").select("id, player_id").eq("round_id", round.id),
      supabase
        .from("generated_images")
        .select(
          "prompt_submission_id, player_id, generation_status, image_url, ai_similarity_score"
        )
        .eq("round_id", round.id)
    ]);

  const error = submissionsError || imagesError;
  if (error) {
    throw error;
  }

  const issue = roundReadinessIssue({
    submissions: (submissions ?? []) as Pick<PromptSubmission, "id" | "player_id">[],
    images: coerceImages((images ?? []) as Record<string, unknown>[]),
    requireAiScores: options.requireAiScores
  });

  if (issue) {
    throw new AppError(issue, 409);
  }
}

/**
 * A row is claimed by flipping it to "generating" before a slow OpenAI call. If that call
 * never returns — serverless timeout, closed host tab, dropped network — the row would stay
 * "generating" forever and block the round. Anything older than this is fair game again.
 */

export async function recomputeRankings(
  joinCode: string,
  input: z.infer<typeof hostAuthSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before ranking players.", 409);
  }

  const [
    { data: players, error: playersError },
    { data: images, error: imagesError },
    { data: submissions, error: submissionsError },
    { data: votes, error: votesError }
  ] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("game_session_id", session.id)
      .eq("is_eliminated", false),
    supabase.from("generated_images").select("*").eq("round_id", round.id),
    supabase.from("prompt_submissions").select("*").eq("round_id", round.id),
    supabase.from("votes").select("*").eq("round_id", round.id)
  ]);

  const error = playersError || imagesError || submissionsError || votesError;
  if (error) {
    throw error;
  }

  const submittedPlayerIds = new Set(
    ((submissions ?? []) as PromptSubmission[]).map((submission) => submission.player_id)
  );
  const rankedPlayers = ((players ?? []) as Player[]).filter((player) =>
    submittedPlayerIds.has(player.id)
  );

  const rankings = computeRankings({
    players: rankedPlayers,
    generatedImages: coerceImages((images ?? []) as Record<string, unknown>[]),
    submissions: (submissions ?? []) as PromptSubmission[],
    votes: (votes ?? []) as Vote[],
    scoringMode: session.scoring_mode,
    voteWeight: session.vote_weight
  });

  if (rankings.length) {
    const { error: upsertError } = await supabase.from("rankings").upsert(
      rankings.map((ranking) => ({
        game_session_id: session.id,
        round_id: round.id,
        player_id: ranking.player_id,
        vote_score: ranking.vote_score,
        ai_similarity_score: ranking.ai_similarity_score,
        total_score: ranking.total_score,
        rank: ranking.rank
      })),
      { onConflict: "round_id,player_id" }
    );
    if (upsertError) {
      throw upsertError;
    }

    await Promise.all(
      rankings.map((ranking) =>
        supabase
          .from("players")
          .update({ current_rank: ranking.rank })
          .eq("id", ranking.player_id)
      )
    );
  }

  await broadcastGameUpdate(session.join_code, "rankings-updated", {
    roundNumber: round.round_number
  });

  return { rankings };
}

export async function advanceRound(joinCode: string, input: z.infer<typeof advanceRoundSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before advancing rounds.", 409);
  }

  const cutLine = nextRoundCutLine(round.round_number);
  if (!cutLine) {
    await applyHostAction(joinCode, { hostToken: input.hostToken, action: "end_game" });
    return { ended: true };
  }

  const additionalInstruction =
    input.additionalInstruction ??
    defaultInstructionFor(round.round_number) ??
    "Raise the difficulty while preserving the dragon's identity.";

  // Elimination is decided by the scores, so every score this mode uses must exist first.
  await assertRoundIsReady(round, {
    requireAiScores: scoringModeNeedsAiScores(session.scoring_mode)
  });

  const { rankings } = await recomputeRankings(joinCode, { hostToken: input.hostToken });
  const countToAdvance = advancingCount(round.round_number, rankings.length);
  const advancingIds = new Set(
    rankings.slice(0, countToAdvance).map((ranking) => ranking.player_id)
  );
  if (!advancingIds.size) {
    throw new AppError("No ranked players are available to advance.", 409);
  }

  const nextRoundNumber = round.round_number + 1;

  // Generate the next challenge BEFORE touching players. Image generation is by far the most
  // likely step to fail, and eliminating two thirds of the class first would leave the game
  // half-advanced with no way back.
  const nextChallenge = await generateRoundChallengeImage({
    gameId: session.id,
    roundNumber: nextRoundNumber,
    basePrompt: round.base_prompt,
    additionalInstruction,
    practiceMode: session.practice_mode
  });

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("game_session_id", session.id);
  if (playersError) {
    throw playersError;
  }

  await Promise.all(
    ((players ?? []) as Player[]).map((player) =>
      supabase
        .from("players")
        .update({ is_eliminated: !advancingIds.has(player.id) })
        .eq("id", player.id)
    )
  );

  const { data: nextRound, error: roundError } = await supabase
    .from("rounds")
    .insert({
      game_session_id: session.id,
      round_number: nextRoundNumber,
      title: roundTitle(nextRoundNumber),
      challenge_image_url: nextChallenge.imageUrl,
      challenge_image_storage_path: nextChallenge.storagePath,
      base_prompt: nextChallenge.prompt,
      additional_instruction: additionalInstruction,
      status: "setup"
    })
    .select("*")
    .single();

  if (roundError) {
    throw roundError;
  }

  const { error: sessionError } = await supabase
    .from("game_sessions")
    .update({ current_round: nextRoundNumber })
    .eq("id", session.id);
  if (sessionError) {
    throw sessionError;
  }

  await broadcastGameUpdate(session.join_code, "round-advanced", {
    roundNumber: nextRoundNumber
  });

  return { round: nextRound as Round, advancingPlayerIds: [...advancingIds] };
}
