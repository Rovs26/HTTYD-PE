import { z } from "zod";
import type { HostAction, ScoringMode } from "@/lib/types";

/** Request shapes for every game endpoint, in one place. */

const pinSchema = z.string().trim().min(4).max(32);

const bearerTokenSchema = z.string().min(16).max(256);

export const createGameSchema = z.object({
  pin: pinSchema,
  // A practice game never calls OpenAI, so it costs nothing to rehearse with.
  practiceMode: z.boolean().optional()
});

export const verifyHostSchema = z.object({
  pin: pinSchema
});

export const joinGameSchema = z.object({
  name: z.string().trim().min(1).max(80),
  playerToken: bearerTokenSchema.optional()
});

export const submitPromptSchema = z.object({
  playerToken: bearerTokenSchema,
  prompt: z.string().trim().min(8).max(4000)
});

export const voteSchema = z.object({
  playerToken: bearerTokenSchema,
  // Either a player id, or the opaque per-round ballot id served during anonymous voting.
  votedForPlayerId: z.string().min(1).max(128)
});

export const hostAuthSchema = z.object({
  hostToken: bearerTokenSchema
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

export const retryImageSchema = hostAuthSchema.extend({
  imageId: z.string().uuid()
});

export const gameSettingsSchema = hostAuthSchema.extend({
  audienceVoting: z.boolean().optional(),
  anonymousVoting: z.boolean().optional(),
  revealPrompts: z.boolean().optional()
});

export const phaseTimerSchema = hostAuthSchema.extend({
  // null clears the countdown; the host always drives the actual transition.
  seconds: z.number().int().min(0).max(3600).nullable()
});

export const playerIdSchema = hostAuthSchema.extend({
  playerId: z.string().uuid()
});

export const renamePlayerSchema = playerIdSchema.extend({
  name: z.string().trim().min(1).max(80)
});

export const advanceRoundSchema = hostAuthSchema.extend({
  additionalInstruction: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined))
});
