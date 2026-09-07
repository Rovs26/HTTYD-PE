import { describe, expect, it } from "vitest";
import { advancingCount, computeRankings, nextRoundCutLine, tiedAtCutLine } from "@/lib/game/ranking";
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
    generation_started_at: null,
    generation_attempts: 1,
    scoring_attempts: 0,
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
    is_audience_vote: false,
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

  it("scales the cut to the class so a small class still loses somebody", () => {
    // The cut used to be a flat 10, so a class of 12 lost only two students in round 1 and
    // a class of 10 lost nobody at all. It now scales, with a floor so it cannot cut to
    // nothing, and never exceeds the number of players.
    expect(advancingCount(1, 30)).toBe(10);
    expect(advancingCount(1, 12)).toBe(6);
    expect(advancingCount(1, 10)).toBe(5);
    expect(advancingCount(1, 3)).toBe(3);
    expect(advancingCount(2, 2)).toBe(2);
  });
});

describe("tiedAtCutLine", () => {
  function ranked(scores: number[]) {
    return scores.map((total, index) => ({
      player_id: `p${index}`,
      vote_score: total,
      ai_similarity_score: 0,
      total_score: total,
      rank: index + 1
    }));
  }

  it("reports nobody when the boundary is a clean break", () => {
    // 20 players in round 1 cuts to 10, so the boundary sits between p9 and p10.
    const rows = ranked([40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11]);
    expect(tiedAtCutLine(rows, 1)).toEqual([]);
  });

  it("reports everyone sharing the boundary score", () => {
    // p9 and p10 straddle the cut on the same score, so submission time alone decides which
    // of them stays in the game.
    const rows = ranked([40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 31, 19, 18, 17, 16, 15, 14, 13, 12, 11]);
    const tied = tiedAtCutLine(rows, 1);
    expect(tied.map((row) => row.player_id)).toEqual(["p9", "p10"]);
  });

  it("reports nothing when nobody is eliminated", () => {
    expect(tiedAtCutLine(ranked([10, 10, 10]), 1)).toEqual([]);
  });

  it("reports nothing in the final round, which has no cut line", () => {
    expect(tiedAtCutLine(ranked([10, 10, 10, 10, 10]), 3)).toEqual([]);
  });
});
