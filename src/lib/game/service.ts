import { z } from "zod";
import { createJoinCode, createToken, hashSecret, verifySecret } from "@/lib/crypto";
import { cleanPrompt, combinePromptChain } from "@/lib/game/prompts";
import { advancingCount, computeRankings, nextRoundCutLine } from "@/lib/game/ranking";
import { AppError } from "@/lib/http";
import { generateChallengeImage, generateStudentImage, scoreImageSimilarity } from "@/lib/ai/openai";
import { broadcastGameUpdate } from "@/lib/realtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  GameSession,
  GameState,
  GeneratedImage,
  HostAction,
  Player,
  PromptSubmission,
  Ranking,
  Round,
  ScoringMode,
  Vote
} from "@/lib/types";

type InternalSession = GameSession & {
  host_pin_hash: string;
  host_token_hash: string;
};

export const createGameSchema = z.object({
  pin: z.string().trim().min(4).max(32)
});

export const verifyHostSchema = createGameSchema;

export const joinGameSchema = z.object({
  name: z.string().trim().min(1).max(80),
  playerToken: z.string().optional()
});

export const submitPromptSchema = z.object({
  playerToken: z.string(),
  prompt: z.string().trim().min(8).max(4000)
});

export const voteSchema = z.object({
  playerToken: z.string(),
  votedForPlayerId: z.string().uuid()
});

export const hostAuthSchema = z.object({
  hostToken: z.string()
});

const hostActions = [
  "open_submissions",
  "close_submissions",
  "open_voting",
  "close_voting",
  "end_game"
] as const satisfies readonly HostAction[];

export const hostActionSchema = hostAuthSchema.extend({
  action: z.enum(hostActions)
});

export const scoringSchema = hostAuthSchema.extend({
  scoringMode: z.enum([
    "voting_first",
    "voting_only",
    "ai_only",
    "blended"
  ] as const satisfies readonly ScoringMode[]),
  voteWeight: z.number().min(0).max(1)
});

export const advanceRoundSchema = hostAuthSchema.extend({
  additionalInstruction: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined))
});

function normalizeJoinCode(joinCode: string) {
  return joinCode.trim().toUpperCase();
}

function publicSession(session: InternalSession): GameSession {
  return {
    id: session.id,
    title: session.title,
    join_code: session.join_code,
    status: session.status,
    current_round: session.current_round,
    scoring_mode: session.scoring_mode,
    vote_weight: session.vote_weight,
    created_at: session.created_at,
    updated_at: session.updated_at
  };
}

function coerceSession(session: Record<string, unknown>): InternalSession {
  return {
    ...(session as InternalSession),
    vote_weight: Number(session.vote_weight)
  };
}

function coerceRankings(rankings: Record<string, unknown>[]): Ranking[] {
  return rankings.map((ranking) => ({
    ...(ranking as Ranking),
    vote_score: Number(ranking.vote_score),
    ai_similarity_score: Number(ranking.ai_similarity_score),
    total_score: Number(ranking.total_score)
  }));
}

function coerceImages(images: Record<string, unknown>[]): GeneratedImage[] {
  return images.map((image) => ({
    ...(image as GeneratedImage),
    ai_similarity_score:
      image.ai_similarity_score === null || image.ai_similarity_score === undefined
        ? null
        : Number(image.ai_similarity_score)
  }));
}

async function getInternalSession(joinCode: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("join_code", normalizeJoinCode(joinCode))
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new AppError("Game not found.", 404);
  }

  return coerceSession(data);
}

async function requireHost(joinCode: string, hostToken: string) {
  const session = await getInternalSession(joinCode);
  if (!verifySecret(hostToken, session.host_token_hash)) {
    throw new AppError("Host authentication failed.", 401);
  }
  return session;
}

async function getPlayerByToken(sessionId: string, playerToken?: string | null) {
  if (!playerToken) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("game_session_id", sessionId)
    .eq("player_token_hash", hashSecret(playerToken))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Player | null) ?? null;
}

async function requirePlayer(sessionId: string, playerToken: string) {
  const player = await getPlayerByToken(sessionId, playerToken);
  if (!player) {
    throw new AppError("Player authentication failed.", 401);
  }
  return player;
}

async function getCurrentRound(session: InternalSession) {
  if (!session.current_round) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("game_session_id", session.id)
    .eq("round_number", session.current_round)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Round | null) ?? null;
}

export async function createGame(input: z.infer<typeof createGameSchema>) {
  const supabase = getSupabaseAdmin();
  const hostToken = createToken();
  let joinCode = createJoinCode();

  for (let attempts = 0; attempts < 5; attempts += 1) {
    const { data: existing, error } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("join_code", joinCode)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!existing) {
      break;
    }
    joinCode = createJoinCode();
  }

  const { data, error } = await supabase
    .from("game_sessions")
    .insert({
      join_code: joinCode,
      host_pin_hash: hashSecret(input.pin),
      host_token_hash: hashSecret(hostToken)
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const session = coerceSession(data);
  await broadcastGameUpdate(joinCode, "game-created", { joinCode });

  return {
    session: publicSession(session),
    hostToken
  };
}

export async function verifyHost(joinCode: string, input: z.infer<typeof verifyHostSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);

  if (!verifySecret(input.pin, session.host_pin_hash)) {
    throw new AppError("Incorrect host PIN.", 401);
  }

  const hostToken = createToken();
  const { error } = await supabase
    .from("game_sessions")
    .update({ host_token_hash: hashSecret(hostToken) })
    .eq("id", session.id);

  if (error) {
    throw error;
  }

  return {
    session: publicSession(session),
    hostToken
  };
}

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

  const allSubmissions = (submissions ?? []) as PromptSubmission[];
  const safeSubmissions = isHost
    ? allSubmissions
    : allSubmissions.filter((submission) => submission.player_id === currentPlayer?.id);
  const roundList = (rounds ?? []) as Round[];

  return {
    session: publicSession(session),
    players: (players ?? []) as Player[],
    rounds: roundList,
    currentRound:
      roundList.find((round) => round.round_number === session.current_round) ?? null,
    submissions: safeSubmissions,
    generatedImages: coerceImages((generatedImages ?? []) as Record<string, unknown>[]),
    votes: (votes ?? []) as Vote[],
    rankings: coerceRankings((rankings ?? []) as Record<string, unknown>[]),
    currentPlayer,
    isHost
  };
}

export async function joinGame(joinCode: string, input: z.infer<typeof joinGameSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  if (session.status === "ended") {
    throw new AppError("This game has ended.", 409);
  }

  const playerToken = input.playerToken || createToken();
  const existing = await getPlayerByToken(session.id, playerToken);
  if (existing) {
    const { data, error } = await supabase
      .from("players")
      .update({ name: input.name })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    await broadcastGameUpdate(session.join_code, "player-updated", { playerId: existing.id });
    return { player: data as Player, playerToken };
  }

  const { data, error } = await supabase
    .from("players")
    .insert({
      game_session_id: session.id,
      name: input.name,
      player_token_hash: hashSecret(playerToken)
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "player-joined", { playerId: data.id });
  return { player: data as Player, playerToken };
}

export async function startGame(joinCode: string, hostToken: string) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, hostToken);

  const existingRound = await getCurrentRound({
    ...session,
    current_round: session.current_round || 1
  });

  if (existingRound) {
    return { round: existingRound, alreadyStarted: true };
  }

  const challenge = await generateChallengeImage(session.id);
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .insert({
      game_session_id: session.id,
      round_number: 1,
      title: "Round 1: Recreate the Dragon",
      challenge_image_url: challenge.imageUrl,
      challenge_image_storage_path: challenge.storagePath,
      base_prompt: challenge.prompt,
      status: "setup"
    })
    .select("*")
    .single();

  if (roundError) {
    throw roundError;
  }

  const { error: sessionError } = await supabase
    .from("game_sessions")
    .update({ status: "active", current_round: 1 })
    .eq("id", session.id);

  if (sessionError) {
    throw sessionError;
  }

  await broadcastGameUpdate(session.join_code, "game-started", { roundNumber: 1 });
  return { round: round as Round, alreadyStarted: false };
}

export async function updateScoring(
  joinCode: string,
  input: z.infer<typeof scoringSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const { error } = await supabase
    .from("game_sessions")
    .update({ scoring_mode: input.scoringMode, vote_weight: input.voteWeight })
    .eq("id", session.id);

  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "scoring-updated", {
    scoringMode: input.scoringMode,
    voteWeight: input.voteWeight
  });

  return { ok: true };
}

export async function applyHostAction(
  joinCode: string,
  input: z.infer<typeof hostActionSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);

  if (input.action === "end_game") {
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

  const updates: Partial<Round> = {};
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

  if (input.action === "close_voting") {
    await recomputeRankings(joinCode, { hostToken: input.hostToken });
  }

  await broadcastGameUpdate(session.join_code, input.action, { roundNumber: round.round_number });
  return { ok: true };
}

export async function submitPrompt(joinCode: string, input: z.infer<typeof submitPromptSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("The game has not started yet.", 409);
  }
  if (!round.submission_open) {
    throw new AppError("Prompt submissions are closed.", 409);
  }

  const player = await requirePlayer(session.id, input.playerToken);
  if (player.is_eliminated) {
    throw new AppError("You were not selected for this round.", 403);
  }

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
    throw new AppError("Your prompt is already locked for this round.", 409);
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
    round.round_number === 1
      ? cleanedPrompt
      : combinePromptChain((previousSubmissions ?? []) as PromptSubmission[], cleanedPrompt);

  const { data: submission, error } = await supabase
    .from("prompt_submissions")
    .insert({
      game_session_id: session.id,
      round_id: round.id,
      player_id: player.id,
      initial_prompt: round.round_number === 1 ? cleanedPrompt : null,
      follow_up_prompt: round.round_number === 1 ? null : cleanedPrompt,
      combined_prompt: combinedPrompt,
      is_locked: true
    })
    .select("*")
    .single();

  if (error) {
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

  return { submission: submission as PromptSubmission };
}

async function ensurePendingImages(session: InternalSession, round: Round) {
  const supabase = getSupabaseAdmin();
  const [{ data: submissions, error: submissionsError }, { data: images, error: imagesError }] =
    await Promise.all([
      supabase.from("prompt_submissions").select("*").eq("round_id", round.id),
      supabase.from("generated_images").select("*").eq("round_id", round.id)
    ]);

  if (submissionsError || imagesError) {
    throw submissionsError || imagesError;
  }

  const imagePlayerIds = new Set((images ?? []).map((image) => image.player_id));
  const missing = ((submissions ?? []) as PromptSubmission[]).filter(
    (submission) => !imagePlayerIds.has(submission.player_id)
  );

  if (missing.length) {
    const { error } = await supabase.from("generated_images").insert(
      missing.map((submission) => ({
        game_session_id: session.id,
        round_id: round.id,
        player_id: submission.player_id,
        prompt_submission_id: submission.id,
        generation_status: "pending"
      }))
    );
    if (error) {
      throw error;
    }
  }
}

export async function generateNextImage(joinCode: string, input: z.infer<typeof hostAuthSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before generating images.", 409);
  }

  await ensurePendingImages(session, round);

  const { data: image, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("round_id", round.id)
    .in("generation_status", ["pending", "failed"])
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!image) {
    await broadcastGameUpdate(session.join_code, "generation-complete", {
      roundNumber: round.round_number
    });
    return { processed: false };
  }

  await supabase
    .from("generated_images")
    .update({ generation_status: "generating", generation_error: null })
    .eq("id", image.id);

  const [{ data: submission, error: submissionError }, { data: player, error: playerError }] =
    await Promise.all([
      supabase
        .from("prompt_submissions")
        .select("*")
        .eq("id", image.prompt_submission_id)
        .single(),
      supabase.from("players").select("*").eq("id", image.player_id).single()
    ]);

  if (submissionError || playerError) {
    throw submissionError || playerError;
  }

  try {
    const generated = await generateStudentImage({
      gameId: session.id,
      roundNumber: round.round_number,
      playerName: player.name,
      playerId: player.id,
      prompt: submission.combined_prompt
    });

    const { data: updated, error: updateError } = await supabase
      .from("generated_images")
      .update({
        image_url: generated.imageUrl,
        image_storage_path: generated.storagePath,
        generation_status: "complete",
        generation_error: null
      })
      .eq("id", image.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await broadcastGameUpdate(session.join_code, "image-generated", {
      roundNumber: round.round_number,
      playerId: player.id
    });

    return { processed: true, image: updated as GeneratedImage };
  } catch (generationError) {
    const message =
      generationError instanceof Error ? generationError.message : "Image generation failed.";
    await supabase
      .from("generated_images")
      .update({
        generation_status: "failed",
        generation_error: message
      })
      .eq("id", image.id);

    await broadcastGameUpdate(session.join_code, "image-generation-failed", {
      roundNumber: round.round_number,
      playerId: player.id
    });

    return { processed: true, failed: true, error: message };
  }
}

export async function scoreNextImage(joinCode: string, input: z.infer<typeof hostAuthSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round?.challenge_image_url) {
    throw new AppError("The current round has no challenge image to score against.", 409);
  }

  const { data: image, error } = await supabase
    .from("generated_images")
    .select("*, prompt_submissions(combined_prompt)")
    .eq("round_id", round.id)
    .eq("generation_status", "complete")
    .is("ai_similarity_score", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!image) {
    await broadcastGameUpdate(session.join_code, "scoring-complete", {
      roundNumber: round.round_number
    });
    return { processed: false };
  }

  try {
    if (!image.image_url) {
      throw new Error("Generated image is missing a URL.");
    }
    const prompt =
      (image.prompt_submissions as { combined_prompt?: string } | null)?.combined_prompt ?? "";
    const scored = await scoreImageSimilarity({
      challengeImageUrl: round.challenge_image_url,
      generatedImageUrl: image.image_url,
      prompt
    });

    const { data: updated, error: updateError } = await supabase
      .from("generated_images")
      .update({
        ai_similarity_score: scored.score,
        ai_similarity_rationale: scored.rationale
      })
      .eq("id", image.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await broadcastGameUpdate(session.join_code, "image-scored", {
      roundNumber: round.round_number,
      playerId: image.player_id
    });

    return { processed: true, image: updated as GeneratedImage };
  } catch (scoreError) {
    const message = scoreError instanceof Error ? scoreError.message : "AI scoring failed.";
    await supabase
      .from("generated_images")
      .update({ ai_similarity_rationale: `Scoring failed: ${message}` })
      .eq("id", image.id);
    return { processed: true, failed: true, error: message };
  }
}

export async function vote(joinCode: string, input: z.infer<typeof voteSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  const round = await getCurrentRound(session);
  if (!round?.voting_open) {
    throw new AppError("Voting is not open.", 409);
  }

  const voter = await requirePlayer(session.id, input.playerToken);
  if (voter.id === input.votedForPlayerId) {
    throw new AppError("You cannot vote for your own image.", 409);
  }
  if (voter.is_eliminated) {
    throw new AppError("Only active players can vote in this round.", 403);
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("generated_images")
    .select("id")
    .eq("round_id", round.id)
    .eq("player_id", input.votedForPlayerId)
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
        voted_for_player_id: input.votedForPlayerId
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
    (round.round_number === 1
      ? "Improve your previous dragon prompt with stronger visual detail, clearer style, and a more cinematic scene."
      : "Make your final dragon image more polished, dramatic, and faithful to the original challenge.");

  const { rankings } = await recomputeRankings(joinCode, { hostToken: input.hostToken });
  const countToAdvance = advancingCount(round.round_number, rankings.length);
  const advancingIds = new Set(
    rankings.slice(0, countToAdvance).map((ranking) => ranking.player_id)
  );
  if (!advancingIds.size) {
    throw new AppError("No ranked players are available to advance.", 409);
  }

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

  const nextRoundNumber = round.round_number + 1;
  const { data: nextRound, error: roundError } = await supabase
    .from("rounds")
    .insert({
      game_session_id: session.id,
      round_number: nextRoundNumber,
      title:
        nextRoundNumber === 2
          ? "Round 2: Upgrade the Dragon"
          : "Round 3: Final Dragon Flight",
      challenge_image_url: round.challenge_image_url,
      challenge_image_storage_path: round.challenge_image_storage_path,
      base_prompt: round.base_prompt,
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
