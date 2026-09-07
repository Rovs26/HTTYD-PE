import { z } from "zod";
import {
  generateStudentImage,
  isContentPolicyError,
  scoreImageSimilarity
} from "@/lib/ai/openai";
import { buildScoringContext } from "@/lib/game/prompts";
import { hostAuthSchema, retryImageSchema } from "@/lib/game/schemas";
import { AppError } from "@/lib/http";
import { broadcastGameUpdate } from "@/lib/realtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { GeneratedImage, PromptSubmission, Round } from "@/lib/types";
import {
  getCurrentRound,
  requireHost,
  type InternalSession
} from "@/lib/game/session";

/**
 * The image generation and AI scoring queue. Workers claim rows atomically, so several of
 * these can run concurrently against the same round.
 */

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
    // Every parallel generation worker calls this on the way in, so two of them routinely
    // race here with the same "missing" set. A bare insert would hit
    // unique(round_id, player_id) and abort the whole class's batch; upserting and ignoring
    // duplicates makes the call idempotent, which is what it was always meant to be.
    const { error } = await supabase.from("generated_images").upsert(
      missing.map((submission) => ({
        game_session_id: session.id,
        round_id: round.id,
        player_id: submission.player_id,
        prompt_submission_id: submission.id,
        generation_status: "pending"
      })),
      { onConflict: "round_id,player_id", ignoreDuplicates: true }
    );
    if (error) {
      throw error;
    }
  }
}

/**
 * Reads the round's submissions and images and throws if the round is not ready to move on.
 * This is the server-side twin of the host dashboard's disabled buttons — without it the
 * whole round sequence is enforced only in the browser.
 */

/**
 * A row is claimed by flipping it to "generating" before a slow OpenAI call. If that call
 * never returns — serverless timeout, closed host tab, dropped network — the row would stay
 * "generating" forever and block the round. Anything older than this is fair game again.
 */
const GENERATION_CLAIM_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_SCORING_ATTEMPTS = 3;

/**
 * Claims exactly one image for this worker, atomically. Two host tabs (or two workers in the
 * dashboard's pool) can call this concurrently and are guaranteed to get different rows.
 * Also reclaims a row whose previous worker died mid-flight.
 */
async function claimNextImage(roundId: string) {
  const { data, error } = await getSupabaseAdmin().rpc("claim_next_image", {
    p_round_id: roundId,
    p_max_attempts: MAX_GENERATION_ATTEMPTS,
    p_stale_before: new Date(Date.now() - GENERATION_CLAIM_TIMEOUT_MS).toISOString()
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as GeneratedImage[];
  return rows[0] ?? null;
}

/**
 * Hard ceiling on images per game. Generation is the only thing here that costs money, and
 * without a cap a single session's spend is unbounded.
 */

/**
 * Hard ceiling on images per game. Generation is the only thing here that costs money, and
 * without a cap a single session's spend is unbounded.
 */
function imageBudgetPerGame() {
  const value = Number(process.env.MAX_IMAGES_PER_GAME);
  return Number.isFinite(value) && value > 0 ? value : 200;
}

async function assertImageBudgetRemaining(sessionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc("count_generated_images", {
    p_game_session_id: sessionId
  });

  if (error) {
    throw error;
  }

  const spent = Number(data ?? 0);
  const budget = imageBudgetPerGame();
  if (spent >= budget) {
    throw new AppError(
      `This game has reached its limit of ${budget} generated images. Start a new game, or raise MAX_IMAGES_PER_GAME.`,
      429
    );
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
  await assertImageBudgetRemaining(session.id);

  // Atomic claim: concurrent workers each receive a different row, or null once drained.
  const image = await claimNextImage(round.id);

  if (!image) {
    // Nothing left to attempt. Distinguish "everything generated" from "some rows are
    // permanently stuck", so the host is told which one they are looking at.
    const { data: blocked, error: blockedError } = await supabase
      .from("generated_images")
      .select("id, player_id, generation_error")
      .eq("round_id", round.id)
      .in("generation_status", ["pending", "failed"]);
    if (blockedError) {
      throw blockedError;
    }

    await broadcastGameUpdate(session.join_code, "generation-complete", {
      roundNumber: round.round_number
    });
    return {
      processed: false,
      exhausted: (blocked ?? []).map((row) => ({
        imageId: row.id as string,
        playerId: row.player_id as string,
        error: (row.generation_error as string | null) ?? "Generation failed."
      }))
    };
  }

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
      prompt: submission.combined_prompt,
      basePrompt: round.base_prompt,
      additionalInstruction: round.additional_instruction,
      practiceMode: session.practice_mode
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
    const policyRefusal = isContentPolicyError(generationError);
    const message = policyRefusal
      ? "The image model refused this prompt. Ask the student to rewrite it, then retry."
      : generationError instanceof Error
        ? generationError.message
        : "Image generation failed.";

    await supabase
      .from("generated_images")
      .update({
        generation_status: "failed",
        generation_error: message,
        // claim_next_image already counted this attempt, so only the refusal case adjusts it:
        // retrying a prompt the model refused costs money and always fails, so burn the budget.
        ...(policyRefusal ? { generation_attempts: MAX_GENERATION_ATTEMPTS } : {})
      })
      .eq("id", image.id);

    await broadcastGameUpdate(session.join_code, "image-generation-failed", {
      roundNumber: round.round_number,
      playerId: player.id
    });

    return {
      processed: true,
      failed: true,
      error: message,
      playerId: player.id,
      playerName: player.name,
      imageId: image.id as string
    };
  }
}

/**
 * Requeues one image the host wants to try again, including a row that has exhausted its
 * automatic attempts. Without this a single refused prompt makes the round unfinishable.
 */

/**
 * Requeues one image the host wants to try again, including a row that has exhausted its
 * automatic attempts. Without this a single refused prompt makes the round unfinishable.
 */
export async function retryImage(joinCode: string, input: z.infer<typeof retryImageSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before retrying an image.", 409);
  }

  const { data, error } = await supabase
    .from("generated_images")
    .update({
      generation_status: "pending",
      generation_error: null,
      generation_started_at: null,
      generation_attempts: 0
    })
    .eq("id", input.imageId)
    .eq("round_id", round.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new AppError("That image is not part of the current round.", 404);
  }

  await broadcastGameUpdate(session.join_code, "image-requeued", {
    roundNumber: round.round_number
  });
  return { ok: true };
}

/**
 * Drops one submission from the round so the class can move on without it. The row is kept
 * for the record but excluded from readiness checks, voting, and ranking.
 */

/**
 * Drops one submission from the round so the class can move on without it. The row is kept
 * for the record but excluded from readiness checks, voting, and ranking.
 */
export async function skipImage(joinCode: string, input: z.infer<typeof retryImageSchema>) {
  const supabase = getSupabaseAdmin();
  const session = await requireHost(joinCode, input.hostToken);
  const round = await getCurrentRound(session);
  if (!round) {
    throw new AppError("Start the game before skipping an image.", 409);
  }

  const { data, error } = await supabase
    .from("generated_images")
    .update({
      generation_status: "skipped",
      generation_error: "Skipped by the host so the round could continue."
    })
    .eq("id", input.imageId)
    .eq("round_id", round.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new AppError("That image is not part of the current round.", 404);
  }

  await broadcastGameUpdate(session.join_code, "image-skipped", {
    roundNumber: round.round_number
  });
  return { ok: true };
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
    .lt("scoring_attempts", MAX_SCORING_ATTEMPTS)
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

  // Claim the attempt up front. If this request dies mid-call the attempt is still spent,
  // so a request that always times out cannot loop forever.
  await supabase
    .from("generated_images")
    .update({ scoring_attempts: Number(image.scoring_attempts ?? 0) + 1 })
    .eq("id", image.id);

  try {
    if (!image.image_url) {
      throw new Error("Generated image is missing a URL.");
    }
    const prompt = buildScoringContext({
      additionalInstruction: round.additional_instruction,
      studentPrompt:
        (image.prompt_submissions as { combined_prompt?: string } | null)?.combined_prompt ?? ""
    });
    const scored = await scoreImageSimilarity({
      challengeImageUrl: round.challenge_image_url,
      generatedImageUrl: image.image_url,
      prompt,
      practiceMode: session.practice_mode
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
    const attempts = Number(image.scoring_attempts ?? 0) + 1;
    const exhausted = attempts >= MAX_SCORING_ATTEMPTS;

    // Once the attempts are spent the score must become terminal. Leaving it null forever
    // re-queues the same image on every pass and the round can never be closed.
    await supabase
      .from("generated_images")
      .update({
        scoring_attempts: attempts,
        ai_similarity_score: exhausted ? 0 : null,
        ai_similarity_rationale: exhausted
          ? `Could not be scored automatically after ${attempts} attempts (${message}). Scored 0 so the round can continue.`
          : `Scoring failed: ${message}`
      })
      .eq("id", image.id);

    return { processed: true, failed: true, error: message, exhausted };
  }
}
