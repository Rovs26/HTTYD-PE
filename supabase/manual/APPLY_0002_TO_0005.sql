-- Combined migrations 0002-0005 for the Supabase SQL Editor.
-- 0001_init.sql is deliberately excluded: it is already applied and is not
-- replayable (bare CREATE TABLE statements). Everything below is guarded with
-- IF NOT EXISTS / OR REPLACE, so running it twice is harmless.

-- ============================================================
-- 0002_generation_recovery.sql
-- ============================================================
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

-- ============================================================
-- 0003_parallel_generation.sql
-- ============================================================
-- Atomic claim for the image generation queue.
--
-- Generation is driven by concurrent requests from the host dashboard. Selecting a row and
-- then updating it in two steps lets two workers claim the same image, which generates the
-- same dragon twice and charges OpenAI twice. This claims one row atomically, and
-- FOR UPDATE SKIP LOCKED lets parallel workers each take a different row instead of queueing.

create or replace function public.claim_next_image(
  p_round_id uuid,
  p_max_attempts integer default 3,
  p_stale_before timestamptz default null
)
returns setof public.generated_images
language plpgsql
as $$
begin
  return query
  update public.generated_images as target
  set
    generation_status = 'generating',
    generation_started_at = now(),
    generation_error = null,
    generation_attempts = target.generation_attempts + 1
  where target.id = (
    select candidate.id
    from public.generated_images as candidate
    where candidate.round_id = p_round_id
      and candidate.generation_attempts < p_max_attempts
      and (
        candidate.generation_status in ('pending', 'failed')
        -- Reclaim a row whose worker died mid-flight. A row that was already stuck in
        -- 'generating' before this migration has no generation_started_at at all, so treat
        -- a null timestamp as infinitely stale rather than leaving it wedged forever.
        or (
          candidate.generation_status = 'generating'
          and p_stale_before is not null
          and coalesce(candidate.generation_started_at, 'epoch'::timestamptz) < p_stale_before
        )
      )
    -- Drain never-attempted work first so one poison prompt cannot block the class.
    order by candidate.generation_attempts, candidate.created_at
    limit 1
    for update skip locked
  )
  returning target.*;
end;
$$;

-- Counts image generations a game has actually paid for, for the per-game budget cap.
-- Summing attempts rather than counting rows matters: a retry costs another OpenAI call but
-- reuses the same row, so counting rows would under-report spend without bound.
create or replace function public.count_generated_images(p_game_session_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(generation_attempts), 0)::integer
  from public.generated_images
  where game_session_id = p_game_session_id;
$$;

-- ============================================================
-- 0004_classroom_experience.sql
-- ============================================================
-- Classroom experience: spectators, anonymity, prompt reveal, and phase timers.

-- Per-game teaching settings the host controls at runtime.
alter table public.game_sessions
  -- Lets eliminated students keep voting instead of holding a dead phone for two thirds
  -- of the lesson. Off by default: it changes who decides the winner.
  add column if not exists audience_voting boolean not null default false,
  -- Hides authors' names during voting so students cannot simply vote for friends.
  add column if not exists anonymous_voting boolean not null default false,
  -- Reveals the winning prompts after each round. This is the lesson, so it defaults on.
  add column if not exists reveal_prompts boolean not null default true;

-- Advisory countdown for the current phase. The host still drives every transition; this
-- only tells the room how long they have.
alter table public.rounds
  add column if not exists phase_ends_at timestamptz;

-- Distinguishes a spectator's vote from a competing player's vote, so the two can be
-- reported separately even though both are counted.
alter table public.votes
  add column if not exists is_audience_vote boolean not null default false;

create index if not exists votes_round_audience_idx
  on public.votes (round_id, is_audience_vote);

-- ============================================================
-- 0005_practice_mode.sql
-- ============================================================
-- Practice mode: rehearse the whole game without spending anything on OpenAI.
--
-- Previously the only way to try the game was to change AI_PROVIDER and redeploy, so hosts
-- rehearsed against real image spend or not at all.
alter table public.game_sessions
  add column if not exists practice_mode boolean not null default false;

