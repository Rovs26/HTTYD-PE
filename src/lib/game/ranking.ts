import { advancingCount } from "@/lib/game/progression";
import type {
  GeneratedImage,
  Player,
  PromptSubmission,
  Ranking,
  ScoringMode,
  Vote
} from "@/lib/types";

export type RankingInput = {
  players: Player[];
  generatedImages: GeneratedImage[];
  submissions: PromptSubmission[];
  votes: Vote[];
  scoringMode: ScoringMode;
  voteWeight: number;
};

export type ComputedRanking = Pick<
  Ranking,
  "player_id" | "vote_score" | "ai_similarity_score" | "total_score" | "rank"
>;

function submittedAtFor(playerId: string, submissions: PromptSubmission[]) {
  return (
    submissions.find((submission) => submission.player_id === playerId)?.submitted_at ??
    "9999-12-31T23:59:59.999Z"
  );
}

export function computeRankings({
  players,
  generatedImages,
  submissions,
  votes,
  scoringMode,
  voteWeight
}: RankingInput): ComputedRanking[] {
  const maxVotes = Math.max(
    1,
    ...players.map((player) =>
      votes.filter((vote) => vote.voted_for_player_id === player.id).length
    )
  );

  const imageByPlayer = new Map(generatedImages.map((image) => [image.player_id, image]));

  const rows = players.map((player) => {
    const voteScore = votes.filter((vote) => vote.voted_for_player_id === player.id).length;
    const aiScore = Number(imageByPlayer.get(player.id)?.ai_similarity_score ?? 0);
    const normalizedVote = (voteScore / maxVotes) * 100;
    let totalScore = voteScore;

    if (scoringMode === "ai_only") {
      totalScore = aiScore;
    } else if (scoringMode === "blended") {
      totalScore = normalizedVote * voteWeight + aiScore * (1 - voteWeight);
    } else if (scoringMode === "voting_first") {
      totalScore = voteScore * 1000 + aiScore;
    }

    return {
      player_id: player.id,
      vote_score: voteScore,
      ai_similarity_score: aiScore,
      total_score: Number(totalScore.toFixed(4)),
      rank: 0,
      submitted_at: submittedAtFor(player.id, submissions)
    };
  });

  rows.sort((left, right) => {
    if (scoringMode === "ai_only") {
      return (
        right.ai_similarity_score - left.ai_similarity_score ||
        right.vote_score - left.vote_score ||
        left.submitted_at.localeCompare(right.submitted_at)
      );
    }

    if (scoringMode === "blended") {
      return (
        right.total_score - left.total_score ||
        right.vote_score - left.vote_score ||
        right.ai_similarity_score - left.ai_similarity_score ||
        left.submitted_at.localeCompare(right.submitted_at)
      );
    }

    return (
      right.vote_score - left.vote_score ||
      (scoringMode === "voting_first"
        ? right.ai_similarity_score - left.ai_similarity_score
        : 0) ||
      left.submitted_at.localeCompare(right.submitted_at)
    );
  });

  return rows.map((row, index) => ({
    player_id: row.player_id,
    vote_score: row.vote_score,
    ai_similarity_score: row.ai_similarity_score,
    total_score: row.total_score,
    rank: index + 1
  }));
}

// Round shape lives in progression.ts; re-exported so existing callers keep one import.
export { advancingCount, nextRoundCutLine } from "@/lib/game/progression";


/**
 * Players sitting on the exact boundary of the cut with the same total score. Today the tie
 * is broken silently by submission timestamp, which decides who leaves the game without the
 * host ever seeing it happen.
 */
export function tiedAtCutLine(rankings: ComputedRanking[], roundNumber: number) {
  const cutLine = advancingCount(roundNumber, rankings.length);
  if (!cutLine || cutLine >= rankings.length) {
    return [];
  }

  const ordered = [...rankings].sort((left, right) => left.rank - right.rank);
  const lastAdvancing = ordered[cutLine - 1];
  const firstEliminated = ordered[cutLine];
  if (!lastAdvancing || !firstEliminated) {
    return [];
  }
  // Only a tie the scoring tiebreakers cannot separate is actually decided by submission
  // time. A pair that differs on votes or AI score is resolved by the comparator, and
  // warning about it would be noise.
  const trulyTied = (left: ComputedRanking, right: ComputedRanking) =>
    left.total_score === right.total_score &&
    left.vote_score === right.vote_score &&
    left.ai_similarity_score === right.ai_similarity_score;

  if (!trulyTied(lastAdvancing, firstEliminated)) {
    return [];
  }

  return ordered.filter((row) => trulyTied(row, lastAdvancing));
}
