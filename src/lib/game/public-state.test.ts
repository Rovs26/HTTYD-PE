import { describe, expect, it } from "vitest";
import { anonymousNameMap, ballotIdFor, buildGameStateView } from "@/lib/game/public-state";
import type {
  GameSession,
  GeneratedImage,
  Player,
  PromptSubmission,
  Ranking,
  Round,
  RoundStatus,
  Vote
} from "@/lib/types";

const session: GameSession = {
  id: "game-1",
  title: "Dragons",
  join_code: "ABC234",
  status: "active",
  current_round: 1,
  scoring_mode: "voting_first",
  vote_weight: 0.5,
  audience_voting: false,
  anonymous_voting: false,
  reveal_prompts: true,
  practice_mode: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

function player(id: string): Player {
  return {
    id,
    game_session_id: session.id,
    name: `Player ${id}`,
    // A token hash must never reach a client. Present here to prove it is stripped.
    player_token_hash: `hash-${id}`,
    is_eliminated: false,
    current_rank: 3,
    joined_at: "2026-01-01T00:00:00.000Z"
  } as Player & { player_token_hash: string } as Player;
}

function round(status: RoundStatus, votingOpen: boolean): Round {
  return {
    id: "round-1",
    game_session_id: session.id,
    round_number: 1,
    title: "Round 1",
    challenge_image_url: "https://example.test/challenge.jpg",
    challenge_image_storage_path: "challenge.jpg",
    base_prompt: "secret host base prompt",
    additional_instruction: null,
    submission_open: false,
    voting_open: votingOpen,
    status,
    phase_ends_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

function submission(playerId: string): PromptSubmission {
  return {
    id: `sub-${playerId}`,
    game_session_id: session.id,
    round_id: "round-1",
    player_id: playerId,
    initial_prompt: `${playerId} prompt`,
    follow_up_prompt: null,
    combined_prompt: `${playerId} prompt`,
    is_locked: true,
    submitted_at: "2026-01-01T00:00:00.000Z"
  };
}

function generatedImage(playerId: string): GeneratedImage {
  return {
    id: `img-${playerId}`,
    game_session_id: session.id,
    round_id: "round-1",
    player_id: playerId,
    prompt_submission_id: `sub-${playerId}`,
    image_url: `https://example.test/${playerId}.jpg`,
    image_storage_path: `${playerId}.jpg`,
    generation_status: "complete",
    generation_error: null,
    generation_started_at: null,
    generation_attempts: 1,
    scoring_attempts: 0,
    ai_similarity_score: 77,
    ai_similarity_rationale: `why ${playerId} scored`,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

function vote(voter: string, votedFor: string): Vote {
  return {
    id: `vote-${voter}`,
    game_session_id: session.id,
    round_id: "round-1",
    voter_player_id: voter,
    voted_for_player_id: votedFor,
    is_audience_vote: false,
    created_at: "2026-01-01T00:00:00.000Z"
  };
}

function ranking(playerId: string, rank: number): Ranking {
  return {
    id: `rank-${playerId}`,
    game_session_id: session.id,
    round_id: "round-1",
    player_id: playerId,
    vote_score: 2,
    ai_similarity_score: 77,
    total_score: 2077,
    rank,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

const players = [player("a"), player("b"), player("c")];
const submissions = [submission("a"), submission("b")];
const generatedImages = [generatedImage("a"), generatedImage("b")];
const votes = [vote("a", "b"), vote("b", "a"), vote("c", "a")];
const rankings = [ranking("a", 1), ranking("b", 2)];

function studentView(roundState: Round, overrides: Partial<GameSession> = {}) {
  return buildGameStateView({
    session: { ...session, ...overrides },
    players,
    rounds: [roundState],
    submissions,
    generatedImages,
    votes,
    rankings,
    currentPlayer: players[0],
    isHost: false
  });
}

describe("buildGameStateView — student projection", () => {
  it("never leaks player token hashes", () => {
    const view = studentView(round("voting", true));
    expect(JSON.stringify(view)).not.toContain("hash-");
    for (const item of view.players) {
      expect(item).not.toHaveProperty("player_token_hash");
    }
  });

  it("never leaks the host's base prompt for the round", () => {
    const view = studentView(round("voting", true));
    expect(JSON.stringify(view)).not.toContain("secret host base prompt");
  });

  it("shows a student only their own submission", () => {
    const view = studentView(round("voting", true));
    expect(view.submissions.map((item) => item.player_id)).toEqual(["a"]);
  });

  it("shows a student only their own vote, never who everyone else voted for", () => {
    const view = studentView(round("voting", true));
    expect(view.votes).toHaveLength(1);
    expect(view.votes[0].voter_player_id).toBe("a");
  });

  it("withholds rivals' AI scores and rationales while voting is open", () => {
    const view = studentView(round("voting", true));
    const rival = view.generatedImages.find((item) => item.player_id === "b");
    expect(rival).toBeDefined();
    expect(rival?.ai_similarity_score).toBeNull();
    expect(rival?.ai_similarity_rationale).toBeNull();
  });

  it("hides rivals' images entirely before voting opens", () => {
    const view = studentView(round("generating", false));
    expect(view.generatedImages.map((item) => item.player_id)).toEqual(["a"]);
  });

  it("withholds rankings until the round is scored, then gives the whole leaderboard", () => {
    expect(studentView(round("voting", true)).rankings).toHaveLength(0);
    // Once scored, every student sees the full standing — without it there is no
    // leaderboard and a student never learns where they placed.
    const scored = studentView(round("scored", false));
    expect(scored.rankings).toHaveLength(2);
    expect(scored.rankings.map((item) => item.player_id).sort()).toEqual(["a", "b"]);
  });

  it("reveals the student's own rank only once results are visible", () => {
    expect(studentView(round("voting", true)).currentPlayer?.current_rank).toBeNull();
    expect(studentView(round("scored", false)).currentPlayer?.current_rank).toBe(3);
  });
});

describe("buildGameStateView — host projection", () => {
  const hostView = buildGameStateView({
    session,
    players,
    rounds: [round("scored", false)],
    submissions,
    generatedImages,
    votes,
    rankings,
    currentPlayer: null,
    isHost: true
  });

  it("gives the host every submission, vote and ranking", () => {
    expect(hostView.submissions).toHaveLength(2);
    expect(hostView.votes).toHaveLength(3);
    expect(hostView.rankings).toHaveLength(2);
    expect(hostView.isHost).toBe(true);
  });

  it("gives the host AI scores for every image", () => {
    for (const item of hostView.generatedImages) {
      expect(item.ai_similarity_score).toBe(77);
    }
  });

  it("still strips token hashes from the host payload", () => {
    expect(JSON.stringify(hostView)).not.toContain("hash-");
  });
});


describe("buildGameStateView — anonymous voting", () => {
  it("masks rivals' names while the vote is being cast", () => {
    const view = studentView(round("voting", true), { anonymous_voting: true });
    // The rival is no longer findable by their real id — that is the point — so look them
    // up by the ballot id they are served under.
    const rival = view.players.find((item) => item.id === ballotIdFor("round-1", "b"));
    expect(rival?.name).toMatch(/^Trainer \d+$/);
  });

  it("never masks the student's own name", () => {
    const view = studentView(round("voting", true), { anonymous_voting: true });
    expect(view.players.find((item) => item.id === "a")?.name).toBe("Player a");
  });

  it("restores real names once the round is scored", () => {
    const view = studentView(round("scored", false), { anonymous_voting: true });
    expect(view.players.find((item) => item.id === "b")?.name).toBe("Player b");
  });

  it("hides who a student voted for behind the same ballot id", () => {
    const view = studentView(round("voting", true), { anonymous_voting: true });
    expect(view.votes[0].voted_for_player_id).toBe(ballotIdFor("round-1", "b"));
  });

  it("gives the same rival the same label across rebuilds", () => {
    const first = studentView(round("voting", true), { anonymous_voting: true });
    const second = studentView(round("voting", true), { anonymous_voting: true });
    const nameIn = (view: typeof first) =>
      view.players.find((item) => item.id === ballotIdFor("round-1", "b"))?.name;
    expect(nameIn(first)).toBeTruthy();
    expect(nameIn(first)).toBe(nameIn(second));
  });

  it("leaves names alone when the toggle is off", () => {
    const view = studentView(round("voting", true), { anonymous_voting: false });
    expect(view.players.find((item) => item.id === "b")?.name).toBe("Player b");
  });
});

describe("buildGameStateView — prompt reveal", () => {
  it("never reveals a rival's prompt while voting is open", () => {
    const view = studentView(round("voting", true), { reveal_prompts: true });
    expect(view.submissions.map((item) => item.player_id)).toEqual(["a"]);
  });

  it("reveals every prompt in the round once it is scored", () => {
    const view = studentView(round("scored", false), { reveal_prompts: true });
    expect(view.submissions.map((item) => item.player_id).sort()).toEqual(["a", "b"]);
  });

  it("keeps prompts private when the host disables the reveal", () => {
    const view = studentView(round("scored", false), { reveal_prompts: false });
    expect(view.submissions.map((item) => item.player_id)).toEqual(["a"]);
  });
});

describe("buildGameStateView — spectator gallery", () => {
  it("shows every completed dragon once voting opens", () => {
    const view = studentView(round("voting", true));
    expect(view.generatedImages.map((item) => item.player_id).sort()).toEqual(["a", "b"]);
  });

  it("keeps the gallery visible after the round is scored", () => {
    const view = studentView(round("scored", false));
    expect(view.generatedImages).toHaveLength(2);
  });

  it("publishes everyone's AI score once the round is scored", () => {
    const view = studentView(round("scored", false));
    const rival = view.generatedImages.find((item) => item.player_id === "b");
    expect(rival?.ai_similarity_score).toBe(77);
    expect(rival?.ai_similarity_rationale).toBe("why b scored");
  });
});

describe("anonymousNameMap", () => {
  const roster = [player("a"), player("b"), player("c")];

  it("gives every rival a label and skips the viewer", () => {
    const labels = anonymousNameMap(roster, "round-1", "a");
    expect(labels.has("a")).toBe(false);
    expect(labels.get("b")).toMatch(/^Trainer \d+$/);
    expect(labels.get("c")).toMatch(/^Trainer \d+$/);
  });

  it("is stable for the same round", () => {
    const first = anonymousNameMap(roster, "round-1", "a");
    const second = anonymousNameMap(roster, "round-1", "a");
    expect(first.get("b")).toBe(second.get("b"));
  });

  it("reshuffles between rounds so an earlier reveal cannot deanonymize a later vote", () => {
    // If labels were identical every round, learning that "Trainer 2" was Astrid in round 1
    // would identify her for the rest of the game.
    const perRound = ["round-1", "round-2", "round-3"].map(
      (roundId) => anonymousNameMap(roster, roundId, "a").get("b")
    );
    expect(new Set(perRound).size).toBeGreaterThan(1);
  });

  it("never assigns two rivals the same label", () => {
    const labels = anonymousNameMap(roster, "round-2", "a");
    expect(new Set(labels.values()).size).toBe(labels.size);
  });
});

describe("buildGameStateView — a student keeps their own history", () => {
  const laterRound: Round = { ...round("submissions", false), id: "round-2", round_number: 2 };

  const view = buildGameStateView({
    session: { ...session, current_round: 2 },
    players,
    rounds: [laterRound],
    submissions,
    generatedImages,
    votes,
    rankings,
    currentPlayer: players[0],
    isHost: false
  });

  it("keeps the student's own dragon from an earlier round", () => {
    // Dropping it the instant the round advanced told a student they were out with no
    // evidence of what they had made.
    expect(view.generatedImages.map((item) => item.player_id)).toEqual(["a"]);
  });

  it("keeps the student's own earlier placing so elimination can be explained", () => {
    expect(view.rankings.map((item) => item.player_id)).toEqual(["a"]);
  });

  it("still hides every rival's earlier dragon", () => {
    expect(view.generatedImages.some((item) => item.player_id === "b")).toBe(false);
  });
});


describe("anonymous voting hides the identity, not just the name", () => {
  const masked = studentView(round("voting", true), { anonymous_voting: true });

  it("never ships a rival's real player id", () => {
    // Masking only the name was not enough: the real id travelled in the same payload and
    // had already been served next to the real name in the lobby.
    expect(JSON.stringify(masked)).not.toContain("\"b\"");
    const rivalImage = masked.generatedImages.find((item) => item.player_id !== "a");
    expect(rivalImage?.player_id).toMatch(/^b-/);
  });

  it("leaves the student's own id alone so they still recognise themselves", () => {
    expect(masked.players.some((item) => item.id === "a")).toBe(true);
  });

  it("uses the same ballot id in the roster and on the image", () => {
    const rivalImage = masked.generatedImages.find((item) => item.player_id !== "a");
    expect(masked.players.some((item) => item.id === rivalImage?.player_id)).toBe(true);
  });

  it("issues a different ballot id for the same player each round", () => {
    expect(ballotIdFor("round-1", "b")).not.toBe(ballotIdFor("round-2", "b"));
  });

  it("is deterministic for a given round and player", () => {
    expect(ballotIdFor("round-1", "b")).toBe(ballotIdFor("round-1", "b"));
  });

  it("restores real ids once the round is scored", () => {
    const revealed = studentView(round("scored", false), { anonymous_voting: true });
    expect(revealed.players.map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("omits players who have no entry in this round", () => {
    // Player c never submitted, so there is no ballot for them to appear as.
    expect(masked.players.map((item) => item.id)).not.toContain("c");
  });
});
