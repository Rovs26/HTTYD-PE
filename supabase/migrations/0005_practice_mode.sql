-- Practice mode: rehearse the whole game without spending anything on OpenAI.
--
-- Previously the only way to try the game was to change AI_PROVIDER and redeploy, so hosts
-- rehearsed against real image spend or not at all.
alter table public.game_sessions
  add column if not exists practice_mode boolean not null default false;
