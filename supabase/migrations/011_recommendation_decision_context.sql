alter table public.recommendations
  add column if not exists decision_context jsonb;

-- A slower request must not replace the decision produced by a newer request.
create or replace function public.keep_newest_recommendation_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.decision_context->>'evaluated_at')::timestamptz <
     (old.decision_context->>'evaluated_at')::timestamptz then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_newest_recommendation_decision on public.recommendations;
create trigger trg_keep_newest_recommendation_decision
  before update on public.recommendations
  for each row execute function public.keep_newest_recommendation_decision();
