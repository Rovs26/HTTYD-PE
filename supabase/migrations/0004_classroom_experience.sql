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
