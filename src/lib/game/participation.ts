import { z } from "zod";
import { cleanPrompt, combinePromptChain } from "@/lib/game/prompts";
import { isOpeningRound } from "@/lib/game/progression";
import { submitPromptSchema, voteSchema } from "@/lib/game/schemas";
import { ballotIdFor } from "@/lib/game/public-state";
import { AppError } from "@/lib/http";
import { broadcastGameUpdate } from "@/lib/realtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PromptSubmission, Vote } from "@/lib/types";
import {
  assertNotRateLimited,
  getCurrentRound,
  getInternalSession,
  isUniqueViolation,
  requirePlayer,
} from "@/lib/game/session";

/** What a student can do: lock a prompt, and cast a vote. */

/**
 * Turns an opaque ballot id back into the player it represents. A plain player id passes
 * through untouched, so this works whether or not the round was anonymous.
 */
async function resolveBallotId(sessionId: string, roundId: string, candidate: string) {
  if (!candidate.startsWith("b-")) {
    return candidate;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("id")
    .eq("game_session_id", sessionId);
  if (error) {
    throw error;
  }

  const match = ((data ?? []) as { id: string }[]).find(
    (player) => ballotIdFor(roundId, player.id) === candidate
  );
  if (!match) {
    throw new AppError("That ballot is not valid for this round.", 404, "unknown_ballot");
  }
  return match.id;
}

export async function submitPrompt(joinCode: string, input: z.infer<typeof submitPromptSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("The game has not started yet.", 409);
  }
  if (!round.submission_open) {
    throw new AppError("Prompt submissions are closed.", 409, "submissions_closed");
  }

  const player = await requirePlayer(session.id, input.playerToken);
  if (player.is_eliminated) {
    throw new AppError("You were not selected for this round.", 403);
  }

  assertNotRateLimited(`submit:${player.id}`, 8, 60 * 1000, "Too many submissions.");

  const { data: existing, error: existingError } = await supabase
    .from("prompt_submissions")
    .select("id")
    .eq("round_id", round.id)
    .eq("player_id", player.id)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    // A student whose connection dropped mid-submit taps again and would otherwise be shown
    // a hard error for a prompt that actually landed. Return what they already have.
    const { data: locked, error: lockedError } = await supabase
      .from("prompt_submissions")
      .select("*")
      .eq("id", existing.id)
      .single();
    if (lockedError) {
      throw lockedError;
    }
    return { submission: locked as PromptSubmission, alreadyLocked: true };
  }

  const { data: previousSubmissions, error: previousError } = await supabase
    .from("prompt_submissions")
    .select("*")
    .eq("game_session_id", session.id)
    .eq("player_id", player.id)
    .order("submitted_at");
  if (previousError) {
    throw previousError;
  }

  const cleanedPrompt = cleanPrompt(input.prompt);
  const combinedPrompt =
    isOpeningRound(round.round_number)
      ? cleanedPrompt
      : combinePromptChain((previousSubmissions ?? []) as PromptSubmission[], cleanedPrompt);

  const { data: submission, error } = await supabase
    .from("prompt_submissions")
    .insert({
      game_session_id: session.id,
      round_id: round.id,
      player_id: player.id,
      initial_prompt: isOpeningRound(round.round_number) ? cleanedPrompt : null,
      follow_up_prompt: isOpeningRound(round.round_number) ? null : cleanedPrompt,
      combined_prompt: combinedPrompt,
      is_locked: true
    })
    .select("*")
    .single();

  if (error) {
    // The existence check above and this insert are not one transaction, so a genuine
    // double-tap can slip past the check and land here. unique(round_id, player_id) catches
    // it; treat that as "already locked" rather than surfacing a 500 to the student.
    if (isUniqueViolation(error)) {
      const { data: locked, error: lockedError } = await supabase
        .from("prompt_submissions")
        .select("*")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .single();
      if (lockedError) {
        throw lockedError;
      }
      return { submission: locked as PromptSubmission, alreadyLocked: true };
    }
    throw error;
  }

  const { error: imageError } = await supabase.from("generated_images").insert({
    game_session_id: session.id,
    round_id: round.id,
    player_id: player.id,
    prompt_submission_id: submission.id,
    generation_status: "pending"
  });
  if (imageError) {
    throw imageError;
  }

  await broadcastGameUpdate(session.join_code, "prompt-submitted", {
    roundNumber: round.round_number,
    playerId: player.id
  });

  return { submission: submission as PromptSubmission, alreadyLocked: false };
}

export async function vote(joinCode: string, input: z.infer<typeof voteSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  const round = await getCurrentRound(session);
  if (!round?.voting_open) {
    throw new AppError("Voting is not open.", 409, "voting_closed");
  }

  const voter = await requirePlayer(session.id, input.playerToken);

  // Under anonymous voting the client only ever saw opaque ballot ids, so resolve one back
  // to the player it stands for before doing anything else.
  const votedForPlayerId = await resolveBallotId(
    session.id,
    round.id,
    input.votedForPlayerId
  );

  if (voter.id === votedForPlayerId) {
    throw new AppError("You cannot vote for your own image.", 409);
  }

  assertNotRateLimited(`vote:${voter.id}`, 20, 60 * 1000, "Too many votes.");

  // Eliminated students hold a dead phone for most of the lesson unless the host opens the
  // vote to the audience. Their ballots are recorded as audience votes so the two groups can
  // be reported apart even though both count.
  const isAudienceVote = voter.is_eliminated;
  if (isAudienceVote) {
    if (!session.audience_voting) {
      throw new AppError("Only active players can vote in this round.", 403);
    }

    // Require that this player competed at some point. Without it, anyone can join a live
    // game (which mints a spectator), vote, and repeat — turning the audience vote into
    // unlimited ballot stuffing.
    const { count, error: playedError } = await supabase
      .from("prompt_submissions")
      .select("id", { count: "exact", head: true })
      .eq("game_session_id", session.id)
      .eq("player_id", voter.id);
    if (playedError) {
      throw playedError;
    }
    if (!count) {
      throw new AppError(
        "Only students who competed in an earlier round can cast an audience vote.",
        403
      );
    }
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("generated_images")
    .select("id")
    .eq("round_id", round.id)
    .eq("player_id", votedForPlayerId)
    .eq("generation_status", "complete")
    .maybeSingle();

  if (candidateError) {
    throw candidateError;
  }
  if (!candidate) {
    throw new AppError("That image is not available for voting.", 404);
  }

  const { data, error } = await supabase
    .from("votes")
    .upsert(
      {
        game_session_id: session.id,
        round_id: round.id,
        voter_player_id: voter.id,
        voted_for_player_id: votedForPlayerId,
        is_audience_vote: isAudienceVote
      },
      { onConflict: "round_id,voter_player_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "vote-cast", {
    roundNumber: round.round_number,
    voterPlayerId: voter.id
  });

  return { vote: data as Vote };
}
