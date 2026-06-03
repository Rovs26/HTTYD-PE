export type GameStatus = "lobby" | "active" | "ended";
export type RoundStatus =
  | "setup"
  | "submissions"
  | "generating"
  | "voting"
  | "scored"
  | "complete";
export type GenerationStatus = "pending" | "generating" | "complete" | "failed";
export type ScoringMode = "voting_first" | "voting_only" | "ai_only" | "blended";

export type GameSession = {
  id: string;
  title: string;
  join_code: string;
  status: GameStatus;
  current_round: number;
  scoring_mode: ScoringMode;
  vote_weight: number;
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

export type GameState = {
  session: GameSession;
  players: Player[];
  rounds: Round[];
  currentRound: Round | null;
  submissions: PromptSubmission[];
  generatedImages: GeneratedImage[];
  votes: Vote[];
  rankings: Ranking[];
  currentPlayer: Player | null;
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
