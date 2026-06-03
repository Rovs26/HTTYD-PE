create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'How to Train Your Dragon: Prompt Engineering',
  join_code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'ended')),
  current_round integer not null default 0,
  host_pin_hash text not null,
  host_token_hash text not null,
  scoring_mode text not null default 'voting_first' check (scoring_mode in ('voting_first', 'voting_only', 'ai_only', 'blended')),
  vote_weight numeric not null default 0.5 check (vote_weight >= 0 and vote_weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_game_sessions_updated_at
before update on public.game_sessions
for each row execute function public.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  player_token_hash text not null,
  is_eliminated boolean not null default false,
  current_rank integer,
  joined_at timestamptz not null default now(),
  unique (game_session_id, player_token_hash)
);

create index players_game_session_id_idx on public.players(game_session_id);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 3),
  title text not null,
  challenge_image_url text,
  challenge_image_storage_path text,
  base_prompt text not null,
  additional_instruction text,
  submission_open boolean not null default false,
  voting_open boolean not null default false,
  status text not null default 'setup' check (status in ('setup', 'submissions', 'generating', 'voting', 'scored', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_session_id, round_number)
);

create trigger set_rounds_updated_at
before update on public.rounds
for each row execute function public.set_updated_at();

create index rounds_game_session_id_idx on public.rounds(game_session_id);

create table public.prompt_submissions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  initial_prompt text,
  follow_up_prompt text,
  combined_prompt text not null,
  is_locked boolean not null default true,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index prompt_submissions_round_id_idx on public.prompt_submissions(round_id);
create index prompt_submissions_player_id_idx on public.prompt_submissions(player_id);

create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  prompt_submission_id uuid not null references public.prompt_submissions(id) on delete cascade,
  image_url text,
  image_storage_path text,
  generation_status text not null default 'pending' check (generation_status in ('pending', 'generating', 'complete', 'failed')),
  generation_error text,
  ai_similarity_score numeric,
  ai_similarity_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create trigger set_generated_images_updated_at
before update on public.generated_images
for each row execute function public.set_updated_at();

create index generated_images_round_id_idx on public.generated_images(round_id);
create index generated_images_status_idx on public.generated_images(generation_status);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  voted_for_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, voter_player_id),
  check (voter_player_id <> voted_for_player_id)
);

create index votes_round_id_idx on public.votes(round_id);

create table public.rankings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  vote_score numeric not null default 0,
  ai_similarity_score numeric not null default 0,
  total_score numeric not null default 0,
  rank integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create trigger set_rankings_updated_at
before update on public.rankings
for each row execute function public.set_updated_at();

create index rankings_round_id_idx on public.rankings(round_id);

alter table public.game_sessions enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.prompt_submissions enable row level security;
alter table public.generated_images enable row level security;
alter table public.votes enable row level security;
alter table public.rankings enable row level security;

insert into storage.buckets (id, name, public)
values ('dragon-images', 'dragon-images', true)
on conflict (id) do update set public = excluded.public;
