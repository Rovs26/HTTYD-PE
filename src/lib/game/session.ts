import { createJoinCode, createToken, hashSecret, verifySecret } from "@/lib/crypto";
import { storagePathsForGameRenewal } from "@/lib/game/archive";
import { AppError } from "@/lib/http";
import { log } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { removeStoredImages } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  GameSession,
  GeneratedImage,
  Player,
  Ranking,
  Round,
  ScoringMode
} from "@/lib/types";

/**
 * Session identity, authentication and lifecycle plumbing shared by every other game module:
 * loading a session, proving who the caller is, and creating or destroying games.
 */
export type InternalSession = GameSession & {
  host_pin_hash: string;
  host_token_hash: string;
};

export function normalizeJoinCode(joinCode: string) {
  return joinCode.trim().toUpperCase();
}

export function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
  );
}


export function assertNotRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  message: string
) {
  const result = rateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new AppError(
      `${message} Try again in ${result.retryAfterSeconds} seconds.`,
      429,
      "rate_limited"
    );
  }
}

export function publicSession(session: InternalSession): GameSession {
  return {
    id: session.id,
    title: session.title,
    join_code: session.join_code,
    status: session.status,
    current_round: session.current_round,
    scoring_mode: session.scoring_mode,
    vote_weight: session.vote_weight,
    audience_voting: session.audience_voting,
    anonymous_voting: session.anonymous_voting,
    reveal_prompts: session.reveal_prompts,
    practice_mode: session.practice_mode,
    created_at: session.created_at,
    updated_at: session.updated_at
  };
}

export function coerceSession(session: Record<string, unknown>): InternalSession {
  return {
    ...(session as InternalSession),
    vote_weight: Number(session.vote_weight)
  };
}

export function coerceRankings(rankings: Record<string, unknown>[]): Ranking[] {
  return rankings.map((ranking) => ({
    ...(ranking as Ranking),
    vote_score: Number(ranking.vote_score),
    ai_similarity_score: Number(ranking.ai_similarity_score),
    total_score: Number(ranking.total_score)
  }));
}

export function coerceImages(images: Record<string, unknown>[]): GeneratedImage[] {
  return images.map((image) => ({
    ...(image as GeneratedImage),
    ai_similarity_score:
      image.ai_similarity_score === null || image.ai_similarity_score === undefined
        ? null
        : Number(image.ai_similarity_score)
  }));
}

export async function getInternalSession(joinCode: string) {
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
    throw new AppError("Game not found.", 404, "game_not_found");
  }

  return coerceSession(data);
}

export async function requireHost(joinCode: string, hostToken: string) {
  const session = await getInternalSession(joinCode);
  if (!verifySecret(hostToken, session.host_token_hash)) {
    throw new AppError("Host authentication failed.", 401, "host_auth_failed");
  }
  return session;
}

export async function getPlayerByToken(sessionId: string, playerToken?: string | null) {
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

export async function requirePlayer(sessionId: string, playerToken: string) {
  const player = await getPlayerByToken(sessionId, playerToken);
  if (!player) {
    throw new AppError("Player authentication failed.", 401, "player_auth_failed");
  }
  return player;
}

export async function getCurrentRound(session: InternalSession) {
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

export async function createGameSession(input: {
  hostPinHash: string;
  scoringMode?: ScoringMode;
  voteWeight?: number;
  audienceVoting?: boolean;
  anonymousVoting?: boolean;
  revealPrompts?: boolean;
  practiceMode?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const hostToken = createToken();

  for (let attempts = 0; attempts < 8; attempts += 1) {
    const joinCode = createJoinCode();
    const { data: existing, error: existingError } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("join_code", joinCode)
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (existing) {
      continue;
    }

    const { data, error } = await supabase
      .from("game_sessions")
      .insert({
        join_code: joinCode,
        host_pin_hash: input.hostPinHash,
        host_token_hash: hashSecret(hostToken),
        scoring_mode: input.scoringMode ?? "voting_first",
        vote_weight: input.voteWeight ?? 0.5,
        audience_voting: input.audienceVoting ?? false,
        anonymous_voting: input.anonymousVoting ?? false,
        reveal_prompts: input.revealPrompts ?? true,
        practice_mode: input.practiceMode ?? false
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      session: coerceSession(data),
      hostToken
    };
  }

  throw new AppError("Could not create a unique join code. Try again.", 500);
}

export async function deleteGameSessions(sessionIds: string[]) {
  const ids = [...new Set(sessionIds)];
  if (!ids.length) {
    return {
      deletedGameCount: 0,
      removedStorageObjectCount: 0
    };
  }

  const supabase = getSupabaseAdmin();
  const [
    { data: rounds, error: roundsError },
    { data: images, error: imagesError }
  ] = await Promise.all([
    supabase
      .from("rounds")
      .select("challenge_image_storage_path")
      .in("game_session_id", ids),
    supabase
      .from("generated_images")
      .select("image_storage_path")
      .in("game_session_id", ids)
  ]);

  const queryError = roundsError || imagesError;
  if (queryError) {
    throw queryError;
  }

  const paths = storagePathsForGameRenewal({
    rounds: (rounds ?? []) as Pick<Round, "challenge_image_storage_path">[],
    images: (images ?? []) as Pick<GeneratedImage, "image_storage_path">[]
  });
  let removedStorageObjectCount = 0;
  try {
    const removedStorage = await removeStoredImages(paths);
    removedStorageObjectCount = removedStorage.removed;
  } catch (storageError) {
    log.error("Could not remove every stored image while deleting games.", { error: storageError });
  }

  const { error: deleteError } = await supabase.from("game_sessions").delete().in("id", ids);
  if (deleteError) {
    throw deleteError;
  }

  return {
    deletedGameCount: ids.length,
    removedStorageObjectCount
  };
}

const STALE_GAME_HOURS = 12;

/**
 * Reclaims storage from games nobody is using any more. A game is only removed when it has
 * already ended, or when it has not been touched for STALE_GAME_HOURS. A live game belonging
 * to another host is never deleted just because someone else created a new one.
 */

/**
 * Reclaims storage from games nobody is using any more. A game is only removed when it has
 * already ended, or when it has not been touched for STALE_GAME_HOURS. A live game belonging
 * to another host is never deleted just because someone else created a new one.
 */
export async function cleanupStaleGames(currentSessionId: string) {
  const supabase = getSupabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_GAME_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("game_sessions")
    .select("id, status, updated_at")
    .neq("id", currentSessionId);
  if (error) {
    throw error;
  }

  const removable = ((data ?? []) as Pick<GameSession, "id" | "status" | "updated_at">[])
    .filter((session) => session.status === "ended" || session.updated_at < staleBefore)
    .map((session) => session.id);

  return deleteGameSessions(removable);
}

export function maxPlayersPerGame() {
  const value = Number(process.env.MAX_PLAYERS_PER_GAME);
  return Number.isFinite(value) && value > 0 ? value : 60;
}

export async function assertPlayerSlotAvailable(sessionId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("game_session_id", sessionId);

  if (error) {
    throw error;
  }

  const limit = maxPlayersPerGame();
  if ((count ?? 0) >= limit) {
    throw new AppError(
      `This game is full (${limit} players). Ask your host to start another game.`,
      409
    );
  }
}
