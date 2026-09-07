import { z } from "zod";
import { verifySecret } from "@/lib/crypto";
import { buildGameStateView } from "@/lib/game/public-state";
import { hostAuthSchema } from "@/lib/game/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  GameState,
  Player,
  PromptSubmission,
  Round,
  Vote
} from "@/lib/types";
import {
  coerceImages,
  coerceRankings,
  getInternalSession,
  getPlayerByToken,
  publicSession,
  requireHost,
} from "@/lib/game/session";

/** Read paths: the state every client polls, and the end-of-lesson export. */

export async function getGameState(
  joinCode: string,
  auth: { hostToken?: string | null; playerToken?: string | null } = {}
): Promise<GameState> {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  const isHost = verifySecret(auth.hostToken, session.host_token_hash);
  const currentPlayer = await getPlayerByToken(session.id, auth.playerToken);

  const [
    { data: players, error: playersError },
    { data: rounds, error: roundsError },
    { data: submissions, error: submissionsError },
    { data: generatedImages, error: imagesError },
    { data: votes, error: votesError },
    { data: rankings, error: rankingsError }
  ] = await Promise.all([
    supabase.from("players").select("*").eq("game_session_id", session.id).order("joined_at"),
    supabase.from("rounds").select("*").eq("game_session_id", session.id).order("round_number"),
    supabase
      .from("prompt_submissions")
      .select("*")
      .eq("game_session_id", session.id)
      .order("submitted_at"),
    supabase
      .from("generated_images")
      .select("*")
      .eq("game_session_id", session.id)
      .order("created_at"),
    supabase.from("votes").select("*").eq("game_session_id", session.id).order("created_at"),
    supabase
      .from("rankings")
      .select("*")
      .eq("game_session_id", session.id)
      .order("rank")
  ]);

  const error =
    playersError ||
    roundsError ||
    submissionsError ||
    imagesError ||
    votesError ||
    rankingsError;
  if (error) {
    throw error;
  }

  return buildGameStateView({
    session: publicSession(session),
    players: (players ?? []) as Player[],
    rounds: (rounds ?? []) as Round[],
    submissions: (submissions ?? []) as PromptSubmission[],
    generatedImages: coerceImages((generatedImages ?? []) as Record<string, unknown>[]),
    votes: (votes ?? []) as Vote[],
    rankings: coerceRankings((rankings ?? []) as Record<string, unknown>[]),
    currentPlayer,
    isHost
  });
}

/**
 * Runtime teaching settings. Each one changes how the game plays, so all three are host
 * controlled rather than assumed.
 */
/**
 * The whole lesson as data: every prompt every student wrote, with their scores and placings.
 * Renew, Abandon and Archive all delete this, so the host needs a way to keep it first.
 */
export async function exportGameResults(
  joinCode: string,
  input: z.infer<typeof hostAuthSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);

  const [
    { data: players, error: playersError },
    { data: rounds, error: roundsError },
    { data: submissions, error: submissionsError },
    { data: images, error: imagesError },
    { data: votes, error: votesError },
    { data: rankings, error: rankingsError }
  ] = await Promise.all([
    supabase.from("players").select("*").eq("game_session_id", session.id).order("joined_at"),
    supabase.from("rounds").select("*").eq("game_session_id", session.id).order("round_number"),
    supabase
      .from("prompt_submissions")
      .select("*")
      .eq("game_session_id", session.id)
      .order("submitted_at"),
    supabase.from("generated_images").select("*").eq("game_session_id", session.id),
    supabase.from("votes").select("*").eq("game_session_id", session.id),
    supabase.from("rankings").select("*").eq("game_session_id", session.id).order("rank")
  ]);

  const error =
    playersError || roundsError || submissionsError || imagesError || votesError || rankingsError;
  if (error) {
    throw error;
  }

  const playerList = (players ?? []) as Player[];
  const nameOf = (playerId: string) =>
    playerList.find((player) => player.id === playerId)?.name ?? "Unknown";

  const roundList = (rounds ?? []) as Round[];
  const submissionList = (submissions ?? []) as PromptSubmission[];
  const imageList = coerceImages((images ?? []) as Record<string, unknown>[]);
  const voteList = (votes ?? []) as Vote[];
  const rankingList = coerceRankings((rankings ?? []) as Record<string, unknown>[]);

  return {
    game: {
      joinCode: session.join_code,
      title: session.title,
      status: session.status,
      scoringMode: session.scoring_mode,
      voteWeight: session.vote_weight,
      audienceVoting: session.audience_voting,
      anonymousVoting: session.anonymous_voting,
      createdAt: session.created_at
    },
    players: playerList.map((player) => ({
      id: player.id,
      name: player.name,
      eliminated: player.is_eliminated,
      finalRank: player.current_rank
    })),
    rounds: roundList.map((round) => ({
      roundNumber: round.round_number,
      title: round.title,
      challengeImageUrl: round.challenge_image_url,
      hostInstruction: round.additional_instruction,
      entries: submissionList
        .filter((submission) => submission.round_id === round.id)
        .map((submission) => {
          const image = imageList.find(
            (item) => item.prompt_submission_id === submission.id
          );
          const ranking = rankingList.find(
            (item) => item.round_id === round.id && item.player_id === submission.player_id
          );
          return {
            player: nameOf(submission.player_id),
            // The prompt the student actually typed this round, and the full chain the
            // image was generated from.
            prompt: submission.follow_up_prompt ?? submission.initial_prompt,
            combinedPrompt: submission.combined_prompt,
            submittedAt: submission.submitted_at,
            imageUrl: image?.image_url ?? null,
            generationStatus: image?.generation_status ?? null,
            aiScore: image?.ai_similarity_score ?? null,
            aiRationale: image?.ai_similarity_rationale ?? null,
            votes: voteList.filter(
              (vote) =>
                vote.round_id === round.id &&
                vote.voted_for_player_id === submission.player_id
            ).length,
            rank: ranking?.rank ?? null,
            totalScore: ranking?.total_score ?? null
          };
        })
        .sort((left, right) => (left.rank ?? 999) - (right.rank ?? 999))
    }))
  };
}
