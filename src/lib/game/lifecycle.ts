import { z } from "zod";
import { generateChallengeImage } from "@/lib/ai/openai";
import { partitionImagesForArchive, topRankedPlayerIds } from "@/lib/game/archive";
import { joinsAsSpectator } from "@/lib/game/join-eligibility";
import { roundTitle } from "@/lib/game/progression";
import type { computeRankings } from "@/lib/game/ranking";
import { recomputeRankings } from "@/lib/game/rounds";
import {
  createGameSchema,
  gameSettingsSchema,
  hostAuthSchema,
  joinGameSchema,
  phaseTimerSchema,
  playerIdSchema,
  renamePlayerSchema,
  scoringSchema,
  verifyHostSchema
} from "@/lib/game/schemas";
import { createToken, hashSecret, verifySecret } from "@/lib/crypto";
import { toGamePlayer } from "@/lib/game/public-state";
import { AppError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { broadcastGameUpdate } from "@/lib/realtime";
import { removeStoredImages } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Player, Round } from "@/lib/types";
import {
  assertNotRateLimited,
  assertPlayerSlotAvailable,
  coerceImages,
  createGameSession,
  deleteGameSessions,
  getCurrentRound,
  getInternalSession,
  getPlayerByToken,
  publicSession,
  requireHost,
  cleanupStaleGames,
  normalizeJoinCode,
  type InternalSession
} from "@/lib/game/session";

/** Creating, unlocking, joining, configuring and tearing down a game. */

export async function createGame(input: z.infer<typeof createGameSchema>) {
  assertNotRateLimited("create-game", 10, 10 * 60 * 1000, "Too many games created recently.");

  const { session, hostToken } = await createGameSession({
    hostPinHash: hashSecret(input.pin),
    practiceMode: input.practiceMode
  });
  await cleanupStaleGames(session.id).catch((error: unknown) => {
    log.error("Could not clean up stale games after creating a new one.", { error });
  });
  await broadcastGameUpdate(session.join_code, "game-created", { joinCode: session.join_code });

  return {
    session: publicSession(session),
    hostToken
  };
}

export async function verifyHost(joinCode: string, input: z.infer<typeof verifyHostSchema>) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeJoinCode(joinCode);

  // A 4-digit PIN is guessable in minutes without this, and a correct guess takes over the
  // dashboard mid-lesson.
  const attempt = rateLimit(`host-pin:${normalized}`, 8, 5 * 60 * 1000);
  if (!attempt.allowed) {
    throw new AppError(
      `Too many incorrect PIN attempts. Try again in ${attempt.retryAfterSeconds} seconds.`,
      429
    );
  }

  const session = await getInternalSession(joinCode);

  if (!verifySecret(input.pin, session.host_pin_hash)) {
    throw new AppError("Incorrect host PIN.", 401, "bad_pin");
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

export async function joinGame(joinCode: string, input: z.infer<typeof joinGameSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await getInternalSession(joinCode);
  if (session.status === "ended") {
    throw new AppError("This game has ended.", 409, "game_ended");
  }

  assertNotRateLimited(
    `join:${session.id}`,
    150,
    60 * 1000,
    "Too many join attempts for this game right now."
  );

  // A supplied token may only reattach an existing player. It can never mint a new one:
  // accepting a caller-chosen token let one phone create unlimited identities and vote
  // from each, or re-enter the game under a new player after being eliminated.
  const existing = await getPlayerByToken(session.id, input.playerToken);
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
    return { player: toGamePlayer(data as Player), playerToken: input.playerToken! };
  }

  await assertPlayerSlotAvailable(session.id);

  // Students trickle in after the host has already pressed Start, so "the game is active"
  // is far too aggressive a test for spectator status — it made everyone who scanned the QR
  // a spectator. Someone is only a spectator once they have genuinely missed their chance to
  // compete: a later round, or round one after its submissions closed.
  const round = await getCurrentRound(session);
  const spectator = joinsAsSpectator({
    sessionStatus: session.status,
    currentRoundNumber: session.current_round,
    round
  });
  const playerToken = createToken();

  const { data, error } = await supabase
    .from("players")
    .insert({
      game_session_id: session.id,
      name: input.name,
      player_token_hash: hashSecret(playerToken),
      is_eliminated: spectator
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "player-joined", { playerId: data.id });
  return {
    player: toGamePlayer(data as Player),
    playerToken,
    joinedAsSpectator: spectator
  };
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

  const challenge = await generateChallengeImage(session.id, session.practice_mode);
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .insert({
      game_session_id: session.id,
      round_number: 1,
      title: roundTitle(1),
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

/**
 * Runtime teaching settings. Each one changes how the game plays, so all three are host
 * controlled rather than assumed.
 */
/**
 * The whole lesson as data: every prompt every student wrote, with their scores and placings.
 * Renew, Abandon and Archive all delete this, so the host needs a way to keep it first.
 */

export async function updateGameSettings(
  joinCode: string,
  input: z.infer<typeof gameSettingsSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);

  const updates: Record<string, boolean> = {};
  if (input.audienceVoting !== undefined) updates.audience_voting = input.audienceVoting;
  if (input.anonymousVoting !== undefined) updates.anonymous_voting = input.anonymousVoting;
  if (input.revealPrompts !== undefined) updates.reveal_prompts = input.revealPrompts;

  if (!Object.keys(updates).length) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("game_sessions")
    .update(updates)
    .eq("id", session.id);
  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "settings-updated", updates);
  return { ok: true };
}

/**
 * Sets an advisory countdown for the current phase. Nothing closes automatically — the host
 * stays in control — but the room can see how long is left instead of being paced by eye.
 */

/**
 * Sets an advisory countdown for the current phase. Nothing closes automatically — the host
 * stays in control — but the room can see how long is left instead of being paced by eye.
 */
export async function setPhaseTimer(
  joinCode: string,
  input: z.infer<typeof phaseTimerSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before setting a timer.", 409);
  }

  const phaseEndsAt =
    input.seconds === null || input.seconds === 0
      ? null
      : new Date(Date.now() + input.seconds * 1000).toISOString();

  const { error } = await supabase
    .from("rounds")
    .update({ phase_ends_at: phaseEndsAt })
    .eq("id", round.id);
  if (error) {
    throw error;
  }

  await broadcastGameUpdate(session.join_code, "timer-updated", { phaseEndsAt });
  return { ok: true, phaseEndsAt };
}

/**
 * Removes a player and everything attached to them. Needed for a duplicate join, or a
 * display name that should not stay on a projector in front of a class.
 */

/**
 * Removes a player and everything attached to them. Needed for a duplicate join, or a
 * display name that should not stay on a projector in front of a class.
 */
export async function removePlayer(joinCode: string, input: z.infer<typeof playerIdSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);

  // Reclaim the player's stored images before the cascade deletes the rows pointing at them.
  const { data: images, error: imagesError } = await supabase
    .from("generated_images")
    .select("image_storage_path")
    .eq("game_session_id", session.id)
    .eq("player_id", input.playerId);
  if (imagesError) {
    throw imagesError;
  }

  const paths = (images ?? [])
    .map((image) => image.image_storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  if (paths.length) {
    try {
      await removeStoredImages(paths);
    } catch (storageError) {
      log.error("Could not remove stored images for a removed player.", { error: storageError });
    }
  }

  const { data, error } = await supabase
    .from("players")
    .delete()
    .eq("id", input.playerId)
    .eq("game_session_id", session.id)
    .select("id")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new AppError("That player is not in this game.", 404);
  }

  // Deleting a player cascades away every ballot they cast and every ballot cast for them,
  // but the rankings rows those ballots produced survive. Without this the leaderboard keeps
  // showing a standing that its own votes no longer support.
  const round = await getCurrentRound(session);
  if (round) {
    try {
      await recomputeRankings(joinCode, { hostToken: input.hostToken });
    } catch (rankingError) {
      log.warn("Could not recompute rankings after removing a player", {
        playerId: input.playerId,
        error: rankingError
      });
    }
  }

  await broadcastGameUpdate(session.join_code, "player-removed", { playerId: input.playerId });
  return { ok: true };
}

/** Renames a player in place, so an unsuitable name can be fixed without ejecting them. */

/** Renames a player in place, so an unsuitable name can be fixed without ejecting them. */
export async function renamePlayer(
  joinCode: string,
  input: z.infer<typeof renamePlayerSchema>
) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);

  const { data, error } = await supabase
    .from("players")
    .update({ name: input.name })
    .eq("id", input.playerId)
    .eq("game_session_id", session.id)
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new AppError("That player is not in this game.", 404);
  }

  await broadcastGameUpdate(session.join_code, "player-updated", { playerId: input.playerId });
  return { player: toGamePlayer(data as Player, { includeRank: true }) };
}

async function cleanupGameImagesForArchive(input: {
  session: InternalSession;
  finalRound: Round;
  rankings: ReturnType<typeof computeRankings>;
}) {
  const supabase = getSupabaseAdmin();
  const { data: images, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("game_session_id", input.session.id);
  if (error) {
    throw error;
  }

  const archivePlan = partitionImagesForArchive({
    images: coerceImages((images ?? []) as Record<string, unknown>[]),
    finalRoundId: input.finalRound.id,
    finalistPlayerIds: topRankedPlayerIds(input.rankings)
  });
  const removedStorage = await removeStoredImages(archivePlan.cleanupStoragePaths);

  if (archivePlan.cleanupImageIds.length) {
    const { error: updateError } = await supabase
      .from("generated_images")
      .update({
        image_url: null,
        image_storage_path: null,
        generation_error: "Image file removed after game archive; ranking data preserved."
      })
      .in("id", archivePlan.cleanupImageIds);
    if (updateError) {
      throw updateError;
    }
  }

  return {
    keptImageCount: archivePlan.keptImageIds.length,
    cleanedImageCount: archivePlan.cleanupImageIds.length,
    removedStorageObjectCount: removedStorage.removed
  };
}

export async function archiveAndCreateNewGame(
  joinCode: string,
  input: z.infer<typeof hostAuthSchema>
) {
  const session = await requireHost(joinCode, input.hostToken);
  if (session.status !== "ended") {
    throw new AppError("End the current game before archiving it and creating a new one.", 409);
  }

  const finalRound = await getCurrentRound(session);
  let archive = {
    keptImageCount: 0,
    cleanedImageCount: 0,
    removedStorageObjectCount: 0
  };

  if (finalRound) {
    const { rankings } = await recomputeRankings(joinCode, input);
    archive = await cleanupGameImagesForArchive({
      session,
      finalRound,
      rankings
    });
  }

  const created = await createGameSession({
    hostPinHash: session.host_pin_hash,
    scoringMode: session.scoring_mode,
    voteWeight: session.vote_weight,
    audienceVoting: session.audience_voting,
    anonymousVoting: session.anonymous_voting,
    revealPrompts: session.reveal_prompts,
    practiceMode: session.practice_mode
  });

  await broadcastGameUpdate(session.join_code, "game-archived", archive);
  await broadcastGameUpdate(created.session.join_code, "game-created", {
    joinCode: created.session.join_code
  });

  return {
    session: publicSession(created.session),
    hostToken: created.hostToken,
    archive
  };
}

async function cleanupGameStorageForRenewal(sessionId: string) {
  const result = await deleteGameSessions([sessionId]);
  return {
    removedStorageObjectCount: result.removedStorageObjectCount
  };
}

export async function renewGame(joinCode: string, input: z.infer<typeof hostAuthSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const created = await createGameSession({
    hostPinHash: session.host_pin_hash,
    scoringMode: session.scoring_mode,
    voteWeight: session.vote_weight,
    audienceVoting: session.audience_voting,
    anonymousVoting: session.anonymous_voting,
    revealPrompts: session.reveal_prompts,
    practiceMode: session.practice_mode
  });

  try {
    const cleanup = await cleanupGameStorageForRenewal(session.id);

    await broadcastGameUpdate(session.join_code, "game-renewed", cleanup);
    await broadcastGameUpdate(created.session.join_code, "game-created", {
      joinCode: created.session.join_code
    });

    return {
      session: publicSession(created.session),
      hostToken: created.hostToken,
      cleanup
    };
  } catch (renewError) {
    await supabase.from("game_sessions").delete().eq("id", created.session.id);
    throw renewError;
  }
}

export async function abandonGame(joinCode: string, input: z.infer<typeof hostAuthSchema>) {
  const session = await requireHost(joinCode, input.hostToken);
  const cleanup = await deleteGameSessions([session.id]);

  await broadcastGameUpdate(session.join_code, "game-abandoned", cleanup);

  return {
    ok: true,
    cleanup
  };
}
