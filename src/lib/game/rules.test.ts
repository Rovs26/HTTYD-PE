import { describe, expect, it } from "vitest";
import {
  allowedStatusesForAction,
  canApplyHostAction,
  roundReadinessIssue,
  scoringModeNeedsAiScores,
  scoringModeNeedsVoting
} from "@/lib/game/rules";
import type { GeneratedImage, PromptSubmission } from "@/lib/types";

type ReadinessImage = Pick<
  GeneratedImage,
  | "prompt_submission_id"
  | "player_id"
  | "generation_status"
  | "image_url"
  | "ai_similarity_score"
>;

function submission(id: string, playerId: string): Pick<PromptSubmission, "id" | "player_id"> {
  return { id, player_id: playerId };
}

function image(overrides: Partial<ReadinessImage> = {}): ReadinessImage {
  return {
    prompt_submission_id: "s1",
    player_id: "p1",
    generation_status: "complete",
    image_url: "https://example.test/a.jpg",
    ai_similarity_score: 80,
    ...overrides
  };
}

describe("canApplyHostAction", () => {
  it("permits each action only from its own round status", () => {
    expect(canApplyHostAction("setup", "open_submissions")).toBe(true);
    expect(canApplyHostAction("submissions", "open_submissions")).toBe(false);
    expect(canApplyHostAction("submissions", "close_submissions")).toBe(true);
    expect(canApplyHostAction("generating", "open_voting")).toBe(true);
    expect(canApplyHostAction("voting", "close_voting")).toBe(true);
  });

  it("lets an ai_only game close the round straight out of generating", () => {
    // ai_only never opens voting, so requiring the "voting" status would deadlock it.
    expect(canApplyHostAction("generating", "close_voting", "ai_only")).toBe(true);
    expect(canApplyHostAction("voting", "close_voting", "ai_only")).toBe(false);
    expect(allowedStatusesForAction("open_voting", "ai_only")).toEqual([]);
  });

  it("keeps the voting path intact for every voting mode", () => {
    for (const mode of ["voting_first", "voting_only", "blended"] as const) {
      expect(canApplyHostAction("generating", "open_voting", mode)).toBe(true);
      expect(canApplyHostAction("voting", "close_voting", mode)).toBe(true);
      expect(canApplyHostAction("generating", "close_voting", mode)).toBe(false);
    }
  });

  it("allows ending the game from any status", () => {
    for (const status of ["setup", "submissions", "generating", "voting", "scored"] as const) {
      expect(canApplyHostAction(status, "end_game")).toBe(true);
    }
  });
});

describe("scoring mode helpers", () => {
  it("knows which modes need AI scores", () => {
    expect(scoringModeNeedsAiScores("voting_only")).toBe(false);
    expect(scoringModeNeedsAiScores("ai_only")).toBe(true);
    expect(scoringModeNeedsAiScores("blended")).toBe(true);
    expect(scoringModeNeedsAiScores("voting_first")).toBe(true);
  });

  it("knows which modes need voting", () => {
    expect(scoringModeNeedsVoting("ai_only")).toBe(false);
    expect(scoringModeNeedsVoting("voting_only")).toBe(true);
  });
});

describe("roundReadinessIssue", () => {
  it("blocks a round with no submissions", () => {
    expect(
      roundReadinessIssue({ submissions: [], images: [], requireAiScores: false })
    ).toMatch(/At least one prompt/);
  });

  it("blocks while an image is still pending", () => {
    expect(
      roundReadinessIssue({
        submissions: [submission("s1", "p1")],
        images: [image({ generation_status: "pending", image_url: null })],
        requireAiScores: false
      })
    ).toMatch(/Retry or skip/);
  });

  it("treats a host-skipped image as resolved so the round can continue", () => {
    expect(
      roundReadinessIssue({
        submissions: [submission("s1", "p1"), submission("s2", "p2")],
        images: [
          image(),
          image({
            prompt_submission_id: "s2",
            player_id: "p2",
            generation_status: "skipped",
            image_url: null,
            ai_similarity_score: null
          })
        ],
        requireAiScores: true
      })
    ).toBeNull();
  });

  it("blocks on a missing AI score only when the mode needs one", () => {
    const input = {
      submissions: [submission("s1", "p1")],
      images: [image({ ai_similarity_score: null })]
    };
    expect(roundReadinessIssue({ ...input, requireAiScores: true })).toMatch(/AI score/);
    expect(roundReadinessIssue({ ...input, requireAiScores: false })).toBeNull();
  });

  it("rejects an image that belongs to a different player than the submission", () => {
    expect(
      roundReadinessIssue({
        submissions: [submission("s1", "p1")],
        images: [image({ player_id: "someone-else" })],
        requireAiScores: false
      })
    ).toMatch(/generated image/);
  });
});
