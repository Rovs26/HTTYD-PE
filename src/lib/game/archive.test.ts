import { describe, expect, it } from "vitest";
import {
  partitionImagesForArchive,
  storagePathsForGameRenewal,
  topRankedPlayerIds
} from "@/lib/game/archive";
import type { ComputedRanking } from "@/lib/game/ranking";
import type { GeneratedImage } from "@/lib/types";

function ranking(playerId: string, rank: number): ComputedRanking {
  return {
    player_id: playerId,
    vote_score: 0,
    ai_similarity_score: 0,
    total_score: 0,
    rank
  };
}

function image(partial: Partial<GeneratedImage> & Pick<GeneratedImage, "id" | "round_id" | "player_id">): GeneratedImage {
  return {
    game_session_id: "game",
    prompt_submission_id: `submission-${partial.player_id}`,
    image_url: `https://example.com/${partial.id}.png`,
    image_storage_path: `${partial.id}.png`,
    generation_status: "complete",
    generation_error: null,
    generation_started_at: null,
    generation_attempts: 1,
    scoring_attempts: 0,
    ai_similarity_score: null,
    ai_similarity_rationale: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial
  };
}

describe("game archive helpers", () => {
  it("selects the top four ranked players", () => {
    const players = topRankedPlayerIds([
      ranking("third", 3),
      ranking("first", 1),
      ranking("fifth", 5),
      ranking("second", 2),
      ranking("fourth", 4)
    ]);

    expect(players).toEqual(["first", "second", "third", "fourth"]);
  });

  it("keeps only final-round finalist images and selects the rest for cleanup", () => {
    const result = partitionImagesForArchive({
      finalRoundId: "round-3",
      finalistPlayerIds: ["a", "b", "c", "d"],
      images: [
        image({ id: "round1-a", round_id: "round-1", player_id: "a" }),
        image({ id: "round3-a", round_id: "round-3", player_id: "a" }),
        image({ id: "round3-b", round_id: "round-3", player_id: "b" }),
        image({ id: "round3-e", round_id: "round-3", player_id: "e" }),
        image({
          id: "already-cleaned",
          round_id: "round-2",
          player_id: "b",
          image_url: null,
          image_storage_path: null
        })
      ]
    });

    expect(result.keptImageIds).toEqual(["round3-a", "round3-b"]);
    expect(result.cleanupImageIds).toEqual(["round1-a", "round3-e"]);
    expect(result.cleanupStoragePaths).toEqual(["round1-a.png", "round3-e.png"]);
  });

  it("collects every unique stored image path when renewing a broken game", () => {
    const paths = storagePathsForGameRenewal({
      rounds: [
        { challenge_image_storage_path: "game/challenge.png" },
        { challenge_image_storage_path: "game/challenge.png" },
        { challenge_image_storage_path: null }
      ],
      images: [
        { image_storage_path: "game/round-1/a.png" },
        { image_storage_path: "game/round-1/b.png" },
        { image_storage_path: null }
      ]
    });

    expect(paths).toEqual([
      "game/challenge.png",
      "game/round-1/a.png",
      "game/round-1/b.png"
    ]);
  });
});
