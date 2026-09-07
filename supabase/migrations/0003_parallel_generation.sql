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
