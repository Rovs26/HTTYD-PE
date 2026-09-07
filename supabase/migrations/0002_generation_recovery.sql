-- Recovery + observability for the image generation queue.
--
-- Before this migration a row flipped to 'generating' could never be picked up again
-- (the worker only selects 'pending' and 'failed'), so a serverless timeout, a closed
-- host tab, or a dropped connection permanently deadlocked the round.

alter table public.generated_images
  drop constraint if exists generated_images_generation_status_check;

alter table public.generated_images
  add constraint generated_images_generation_status_check
  check (generation_status in ('pending', 'generating', 'complete', 'failed', 'skipped'));

-- When the current attempt was claimed, so a stranded row can be reclaimed.
alter table public.generated_images
  add column if not exists generation_started_at timestamptz;

-- How many times generation has been attempted, so a poison prompt stops burning budget.
alter table public.generated_images
  add column if not exists generation_attempts integer not null default 0;

-- How many times AI scoring has been attempted, so an unscoreable image cannot block the round.
alter table public.generated_images
  add column if not exists scoring_attempts integer not null default 0;

-- The hot worker query is (round_id, generation_status) ordered by created_at.
create index if not exists generated_images_round_status_created_idx
  on public.generated_images (round_id, generation_status, created_at);

-- Scoring selects complete images in a round that have no AI score yet.
create index if not exists generated_images_round_unscored_idx
  on public.generated_images (round_id, created_at)
  where ai_similarity_score is null;

-- Ranking counts votes per candidate within a round.
create index if not exists votes_round_voted_for_idx
  on public.votes (round_id, voted_for_player_id);

-- getGameState fans out five reads keyed on game_session_id.
create index if not exists prompt_submissions_game_session_id_idx
  on public.prompt_submissions (game_session_id);
create index if not exists generated_images_game_session_id_idx
  on public.generated_images (game_session_id);
create index if not exists votes_game_session_id_idx
  on public.votes (game_session_id);
create index if not exists rankings_game_session_id_idx
  on public.rankings (game_session_id);

-- A vote must stay inside one game.
create index if not exists players_game_session_id_name_idx
  on public.players (game_session_id, name);
