import type {
  GameGeneratedImage,
  GamePlayer,
  GamePromptSubmission,
  GameRanking,
  GameRound,
  GameSession,
  GameState,
  GameVote,
  GeneratedImage,
  Player,
  PromptSubmission,
  Ranking,
  Round,
  Vote
} from "@/lib/types";

export function toGamePlayer(
  player: Player,
  options: { includeRank?: boolean; nameOverride?: string } = {}
): GamePlayer {
  return {
    id: player.id,
    name: options.nameOverride ?? player.name,
    is_eliminated: player.is_eliminated,
    current_rank: options.includeRank ? player.current_rank : null
  };
}

export function toGameRound(round: Round): GameRound {
  return {
    id: round.id,
    round_number: round.round_number,
    title: round.title,
    challenge_image_url: round.challenge_image_url,
    additional_instruction: round.additional_instruction,
    submission_open: round.submission_open,
    voting_open: round.voting_open,
    status: round.status,
    phase_ends_at: round.phase_ends_at
  };
}

export function toGameSubmission(submission: PromptSubmission): GamePromptSubmission {
  return {
    id: submission.id,
    round_id: submission.round_id,
    player_id: submission.player_id,
    initial_prompt: submission.initial_prompt,
    follow_up_prompt: submission.follow_up_prompt,
    is_locked: submission.is_locked,
    submitted_at: submission.submitted_at
  };
}

export function toGameImage(
  image: GeneratedImage,
  options: { includeEvaluation?: boolean; includeDiagnostics?: boolean } = {}
): GameGeneratedImage {
  return {
    id: image.id,
    round_id: image.round_id,
    player_id: image.player_id,
    image_url: image.image_url,
    generation_status: image.generation_status,
    generation_error: image.generation_error,
    ai_similarity_score: options.includeEvaluation ? image.ai_similarity_score : null,
    ai_similarity_rationale: options.includeEvaluation
      ? image.ai_similarity_rationale
      : null,
    // Only the host is told how many attempts an image has burned, or when the current one
    // was claimed — it is operational detail, not part of the game.
    generation_attempts: options.includeDiagnostics ? image.generation_attempts : null,
    generation_started_at: options.includeDiagnostics ? image.generation_started_at : null
  };
}

export function toGameVote(vote: Vote): GameVote {
  return {
    id: vote.id,
    round_id: vote.round_id,
    voter_player_id: vote.voter_player_id,
    voted_for_player_id: vote.voted_for_player_id,
    is_audience_vote: vote.is_audience_vote
  };
}

export function toGameRanking(ranking: Ranking): GameRanking {
  return {
    id: ranking.id,
    round_id: ranking.round_id,
    player_id: ranking.player_id,
    vote_score: ranking.vote_score,
    ai_similarity_score: ranking.ai_similarity_score,
    total_score: ranking.total_score,
    rank: ranking.rank
  };
}

function seededHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * An opaque, per-round stand-in for a player id.
 *
 * Masking only the name was not enough: the real player id travelled in the same payload,
 * and students had already been served that id alongside the real name in the lobby, so the
 * mapping was trivially recoverable. Ballots are cast against this instead, and the server
 * resolves it back. Seeded with the round id so it changes every round.
 */
export function ballotIdFor(roundId: string, playerId: string) {
  return `b-${seededHash(`${roundId}:${playerId}`).toString(36)}-${seededHash(
    `${playerId}:${roundId}`
  ).toString(36)}`;
}

/**
 * Stable pseudonyms for anonymous voting.
 *
 * Labels are drawn from the players who actually have an entry in this round, so a late join
 * or a host removal mid-vote cannot renumber everyone. The ordering is seeded with the round
 * id: if the labels were identical every round, the reveal at the end of round 1 would
 * permanently deanonymize rounds 2 and 3. Real names return once the round is scored.
 */
export function anonymousNameMap(players: Player[], roundId: string, selfId?: string) {
  const labels = new Map<string, string>();
  const ordered = [...players].sort(
    (left, right) =>
      seededHash(`${roundId}:${left.id}`) - seededHash(`${roundId}:${right.id}`) ||
      left.id.localeCompare(right.id)
  );
  ordered.forEach((player, index) => {
    if (player.id !== selfId) {
      labels.set(player.id, `Trainer ${index + 1}`);
    }
  });
  return labels;
}

export function buildGameStateView(input: {
  session: GameSession;
  players: Player[];
  rounds: Round[];
  submissions: PromptSubmission[];
  generatedImages: GeneratedImage[];
  votes: Vote[];
  rankings: Ranking[];
  currentPlayer: Player | null;
  isHost: boolean;
}): GameState {
  const currentRound =
    input.rounds.find((round) => round.round_number === input.session.current_round) ?? null;

  if (input.isHost) {
    return {
      session: input.session,
      players: input.players.map((player) => toGamePlayer(player, { includeRank: true })),
      rounds: input.rounds.map(toGameRound),
      currentRound: currentRound ? toGameRound(currentRound) : null,
      submissions: input.submissions.map(toGameSubmission),
      generatedImages: input.generatedImages.map((image) =>
        toGameImage(image, { includeEvaluation: true, includeDiagnostics: true })
      ),
      votes: input.votes.map(toGameVote),
      rankings: input.rankings.map(toGameRanking),
      currentPlayer: input.currentPlayer
        ? toGamePlayer(input.currentPlayer, { includeRank: true })
        : null,
      isHost: true
    };
  }

  const playerId = input.currentPlayer?.id;
  const gameEnded = input.session.status === "ended";
  const resultsVisible = Boolean(
    currentRound &&
      !currentRound.voting_open &&
      (currentRound.status === "scored" || currentRound.status === "complete")
  );
  // Spectators and competitors alike see the gallery once voting opens, and it stays visible
  // through the results so nobody is left staring at a blank screen.
  const galleryVisible = Boolean(currentRound?.voting_open) || resultsVisible || gameEnded;
  const currentRoundId = currentRound?.id;

  // Names are withheld only while the vote is actually being cast.
  const maskNames = Boolean(
    input.session.anonymous_voting && currentRound?.voting_open && !resultsVisible
  );
  // Only players with an entry in this round can be voted for, and that set is frozen once
  // submissions close — so labels drawn from it cannot be renumbered by a late join.
  const entrantIds = new Set(
    input.generatedImages
      .filter((image) => image.round_id === currentRound?.id)
      .map((image) => image.player_id)
  );
  const entrants = input.players.filter((player) => entrantIds.has(player.id));
  const labels =
    maskNames && currentRound
      ? anonymousNameMap(entrants, currentRound.id, playerId)
      : null;
  // While masked, a rival is addressed only by an opaque per-round id.
  const idFor = (id: string) =>
    maskNames && currentRound && id !== playerId ? ballotIdFor(currentRound.id, id) : id;
  const nameFor = (player: Player) => labels?.get(player.id);

  // The prompts are the lesson. Once the round is scored, everyone can read what the other
  // trainers actually wrote — but never before the vote is in.
  const promptsRevealed = Boolean(
    input.session.reveal_prompts && (resultsVisible || gameEnded)
  );

  const visibleSubmissions = input.submissions.filter((submission) => {
    if (submission.player_id === playerId) {
      return true;
    }
    return promptsRevealed && submission.round_id === currentRoundId;
  });

  return {
    session: input.session,
    players: input.players
      // A masked rival who is not in this round has no ballot and no business being listed.
      .filter((player) => !maskNames || player.id === playerId || entrantIds.has(player.id))
      .map((player) => ({
        ...toGamePlayer(player, {
          includeRank: resultsVisible && player.id === playerId,
          nameOverride: nameFor(player)
        }),
        id: idFor(player.id)
      })),
    rounds: input.rounds.map(toGameRound),
    currentRound: currentRound ? toGameRound(currentRound) : null,
    submissions: visibleSubmissions.map(toGameSubmission),
    generatedImages: input.generatedImages
      .filter((image) => {
        // Your own dragons stay with you for the whole game. Dropping them the instant the
        // round advanced meant a student was told they were out with no evidence of what
        // they had made.
        if (image.player_id === playerId) {
          return true;
        }
        return (
          image.round_id === currentRoundId &&
          galleryVisible &&
          image.generation_status === "complete"
        );
      })
      .map((image) => ({
        ...toGameImage(image, {
          // Everyone's score is public once the round is scored; before that, only your own.
          includeEvaluation: resultsVisible || image.player_id === playerId
        }),
        player_id: idFor(image.player_id)
      })),
    votes: input.votes
      .filter(
        (vote) =>
          vote.round_id === currentRoundId && vote.voter_player_id === playerId
      )
      .map((vote) => ({
        ...toGameVote(vote),
        // Your own ballot names who you voted for. Under masking that has to be the ballot
        // id too, or anyone who has already voted can read a real id out of their payload.
        voted_for_player_id: idFor(vote.voted_for_player_id)
      })),
    // The full standing, not just your own row: without it there is no leaderboard and a
    // student never learns where they placed.
    rankings: [
      // The current round's full standing, once it is scored...
      ...(resultsVisible
        ? input.rankings.filter((ranking) => ranking.round_id === currentRoundId)
        : []),
      // ...plus your own placings from earlier rounds, so "you did not advance" can say
      // where you actually finished.
      ...input.rankings.filter(
        (ranking) => ranking.player_id === playerId && ranking.round_id !== currentRoundId
      )
    ].map(toGameRanking),
    currentPlayer: input.currentPlayer
      ? toGamePlayer(input.currentPlayer, { includeRank: resultsVisible })
      : null,
    isHost: false
  };
}
