import { describe, expect, it } from "vitest";
import { advancingCount, computeRankings, nextRoundCutLine } from "@/lib/game/ranking";
import type { GeneratedImage, Player, PromptSubmission, Vote } from "@/lib/types";

function player(id: string, name = id): Player {
  return {
    id,
    game_session_id: "game",
    name,
    is_eliminated: false,
    current_rank: null,
    joined_at: `2026-01-01T00:00:0${id}.000Z`
  };
}

function image(playerId: string, score: number): GeneratedImage {
  return {
    id: `image-${playerId}`,
    game_session_id: "game",
    round_id: "round",
    player_id: playerId,
    prompt_submission_id: `submission-${playerId}`,
    image_url: "https://example.com/image.png",
    image_storage_path: null,
    generation_status: "complete",
    generation_error: null,
    ai_similarity_score: score,
    ai_similarity_rationale: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

function submission(playerId: string, seconds: number): PromptSubmission {
  return {
    id: `submission-${playerId}`,
    game_session_id: "game",
    round_id: "round",
    player_id: playerId,
    initial_prompt: "dragon",
    follow_up_prompt: null,
    combined_prompt: "dragon",
    is_locked: true,
    submitted_at: `2026-01-01T00:00:${String(seconds).padStart(2, "0")}.000Z`
  };
}

function vote(voter: string, target: string): Vote {
  return {
    id: `${voter}-${target}`,
    game_session_id: "game",
    round_id: "round",
    voter_player_id: voter,
    voted_for_player_id: target,
    created_at: "2026-01-01T00:01:00.000Z"
  };
}

describe("ranking", () => {
  it("defaults to voting-first with AI as a tie-breaker", () => {
    const rankings = computeRankings({
      players: [player("1"), player("2"), player("3")],
      generatedImages: [image("1", 70), image("2", 95), image("3", 40)],
      submissions: [submission("1", 3), submission("2", 2), submission("3", 1)],
      votes: [vote("1", "2"), vote("2", "1")],
      scoringMode: "voting_first",
      voteWeight: 0.5
    });

    expect(rankings.map((ranking) => ranking.player_id)).toEqual(["2", "1", "3"]);
  });

  it("can rank by AI only", () => {
    const rankings = computeRankings({
      players: [player("1"), player("2")],
      generatedImages: [image("1", 99), image("2", 10)],
      submissions: [submission("1", 1), submission("2", 2)],
      votes: [vote("1", "2"), vote("3", "2")],
      scoringMode: "ai_only",
      voteWeight: 0.5
    });

    expect(rankings[0].player_id).toBe("1");
  });

  it("uses blended normalized vote and AI scores", () => {
    const rankings = computeRankings({
      players: [player("1"), player("2")],
      generatedImages: [image("1", 100), image("2", 10)],
      submissions: [submission("1", 1), submission("2", 2)],
      votes: [vote("1", "2"), vote("3", "2")],
      scoringMode: "blended",
      voteWeight: 0.5
    });

    expect(rankings[0].player_id).toBe("2");
    expect(rankings[0].total_score).toBe(55);
  });

  it("returns the round elimination cut lines", () => {
    expect(nextRoundCutLine(1)).toBe(10);
    expect(nextRoundCutLine(2)).toBe(4);
    expect(nextRoundCutLine(3)).toBe(0);
  });

  it("advances every ranked player when the class is smaller than the cut line", () => {
    expect(advancingCount(1, 3)).toBe(3);
    expect(advancingCount(1, 10)).toBe(10);
    expect(advancingCount(1, 12)).toBe(10);
    expect(advancingCount(2, 2)).toBe(2);
  });
});
