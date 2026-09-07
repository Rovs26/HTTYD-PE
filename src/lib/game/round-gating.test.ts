import { describe, expect, it } from "vitest";
import {
  allAiScoresReady,
  allImagesReady,
  isResolved,
  needsHostAttention,
  requiresAiScoring,
  requiresVoting
} from "@/lib/game/round-gating";
import type { GameGeneratedImage } from "@/lib/types";

function image(overrides: Partial<GameGeneratedImage> = {}): GameGeneratedImage {
  return {
    id: "img",
    round_id: "round",
    player_id: "player",
    image_url: "https://example.test/a.jpg",
    generation_status: "complete",
    generation_error: null,
    ai_similarity_score: 70,
    ai_similarity_rationale: null,
    ...overrides
  };
}

describe("isResolved", () => {
  it("accepts a completed image with a URL", () => {
    expect(isResolved(image())).toBe(true);
  });

  it("accepts a host-skipped image", () => {
    expect(isResolved(image({ generation_status: "skipped", image_url: null }))).toBe(true);
  });

  it("rejects a complete row with no URL", () => {
    expect(isResolved(image({ image_url: null }))).toBe(false);
  });

  it("rejects anything still in flight or failed", () => {
    for (const status of ["pending", "generating", "failed"] as const) {
      expect(isResolved(image({ generation_status: status }))).toBe(false);
    }
  });
});

describe("needsHostAttention", () => {
  it("flags a row wedged in generating", () => {
    // Once its automatic attempts are spent nothing requeues it, so the host must be able
    // to see it and act.
    expect(needsHostAttention(image({ generation_status: "generating" }))).toBe(true);
  });

  it("flags pending and failed rows", () => {
    expect(needsHostAttention(image({ generation_status: "pending" }))).toBe(true);
    expect(needsHostAttention(image({ generation_status: "failed" }))).toBe(true);
  });

  it("leaves finished and skipped rows alone", () => {
    expect(needsHostAttention(image())).toBe(false);
    expect(needsHostAttention(image({ generation_status: "skipped" }))).toBe(false);
  });
});

describe("allImagesReady", () => {
  it("is false with no submissions", () => {
    expect(allImagesReady({ submissions: [], images: [] })).toBe(false);
  });

  it("is false while an image is missing", () => {
    expect(
      allImagesReady({ submissions: [{ id: "a" }, { id: "b" }], images: [image()] })
    ).toBe(false);
  });

  it("counts a skipped image as resolved", () => {
    expect(
      allImagesReady({
        submissions: [{ id: "a" }, { id: "b" }],
        images: [image(), image({ generation_status: "skipped", image_url: null })]
      })
    ).toBe(true);
  });
});

describe("allAiScoresReady", () => {
  it("is always true for voting_only, which never scores", () => {
    expect(
      allAiScoresReady({
        images: [image({ ai_similarity_score: null })],
        scoringMode: "voting_only"
      })
    ).toBe(true);
  });

  it("ignores images that never completed", () => {
    expect(
      allAiScoresReady({
        images: [image(), image({ generation_status: "skipped", ai_similarity_score: null })],
        scoringMode: "blended"
      })
    ).toBe(true);
  });

  it("is false while a completed image is unscored", () => {
    expect(
      allAiScoresReady({
        images: [image(), image({ ai_similarity_score: null })],
        scoringMode: "voting_first"
      })
    ).toBe(false);
  });
});

describe("scoring mode requirements", () => {
  it("knows ai_only skips voting", () => {
    expect(requiresVoting("ai_only")).toBe(false);
    expect(requiresVoting("blended")).toBe(true);
  });

  it("knows voting_only skips AI scoring", () => {
    expect(requiresAiScoring("voting_only")).toBe(false);
    expect(requiresAiScoring("ai_only")).toBe(true);
  });
});
