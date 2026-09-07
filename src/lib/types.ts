export type GameStatus = "lobby" | "active" | "ended";
export type RoundStatus =
  | "setup"
  | "submissions"
  | "generating"
  | "voting"
  | "scored"
  | "complete";
export type GenerationStatus =
  | "pending"
  | "generating"
  | "complete"
  | "failed"
  | "skipped";
export type ScoringMode = "voting_first" | "voting_only" | "ai_only" | "blended";

export type GameSession = {
  id: string;
  title: string;
  join_code: string;
  status: GameStatus;
  current_round: number;
  scoring_mode: ScoringMode;
  vote_weight: number;
  audience_voting: boolean;
  anonymous_voting: boolean;
  reveal_prompts: boolean;
  practice_mode: boolean;
  created_at: string;
  updated_at: string;
};

export type Player = {
  id: string;
  game_session_id: string;
  name: string;
  is_eliminated: boolean;
  current_rank: number | null;
  joined_at: string;
};

export type Round = {
  id: string;
  game_session_id: string;
  round_number: number;
  title: string;
  challenge_image_url: string | null;
  challenge_image_storage_path: string | null;
  base_prompt: string;
  additional_instruction: string | null;
  submission_open: boolean;
  voting_open: boolean;
  status: RoundStatus;
  phase_ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptSubmission = {
  id: string;
  game_session_id: string;
  round_id: string;
  player_id: string;
  initial_prompt: string | null;
  follow_up_prompt: string | null;
  combined_prompt: string;
  is_locked: boolean;
  submitted_at: string;
};

export type GeneratedImage = {
  id: string;
  game_session_id: string;
  round_id: string;
  player_id: string;
  prompt_submission_id: string;
  image_url: string | null;
  image_storage_path: string | null;
  generation_status: GenerationStatus;
  generation_error: string | null;
  generation_started_at: string | null;
  generation_attempts: number;
  scoring_attempts: number;
  ai_similarity_score: number | null;
  ai_similarity_rationale: string | null;
  created_at: string;
  updated_at: string;
};

export type Vote = {
  id: string;
  game_session_id: string;
  round_id: string;
  voter_player_id: string;
  voted_for_player_id: string;
  is_audience_vote: boolean;
  created_at: string;
};

export type Ranking = {
  id: string;
  game_session_id: string;
  round_id: string;
  player_id: string;
  vote_score: number;
  ai_similarity_score: number;
  total_score: number;
  rank: number;
  created_at: string;
  updated_at: string;
};

export type GamePlayer = Pick<
  Player,
  "id" | "name" | "is_eliminated" | "current_rank"
>;

export type GameRound = Pick<
  Round,
  | "id"
  | "round_number"
  | "title"
  | "challenge_image_url"
  | "additional_instruction"
  | "submission_open"
  | "voting_open"
  | "status"
  | "phase_ends_at"
>;

export type GamePromptSubmission = Pick<
  PromptSubmission,
  | "id"
  | "round_id"
  | "player_id"
  | "initial_prompt"
  | "follow_up_prompt"
  | "is_locked"
  | "submitted_at"
>;

export type GameGeneratedImage = Pick<
  GeneratedImage,
  | "id"
  | "round_id"
  | "player_id"
  | "image_url"
  | "generation_status"
  | "ai_similarity_score"
  | "ai_similarity_rationale"
> & {
  generation_error: string | null;
};

export type GameVote = Pick<
  Vote,
  "id" | "round_id" | "voter_player_id" | "voted_for_player_id" | "is_audience_vote"
>;

export type GameRanking = Pick<
  Ranking,
  | "id"
  | "round_id"
  | "player_id"
  | "vote_score"
  | "ai_similarity_score"
  | "total_score"
  | "rank"
>;

export type GameState = {
  session: GameSession;
  players: GamePlayer[];
  rounds: GameRound[];
  currentRound: GameRound | null;
  submissions: GamePromptSubmission[];
  generatedImages: GameGeneratedImage[];
  votes: GameVote[];
  rankings: GameRanking[];
  currentPlayer: GamePlayer | null;
  isHost: boolean;
};

export type PublicGameState = Omit<GameState, "submissions"> & {
  submissions: PromptSubmission[];
};

export type HostAction =
  | "open_submissions"
  | "close_submissions"
  | "open_voting"
  | "close_voting"
  | "end_game";
