-- Backend-only atomic save: edit the caller's existing submission or insert
-- when an earlier request failed before reaching the database.
begin;

create or replace function public.save_shoe_lifespan_submission(
  p_request_id uuid,
  p_shoe_model_id uuid,
  p_distance_km numeric,
  p_contributor_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_request_id uuid;
begin
  insert into public.shoe_lifespan_submissions as existing (
    request_id, shoe_model_id, distance_km, status, source_hash, contributor_hash
  ) values (
    p_request_id, p_shoe_model_id, p_distance_km, 'accepted', p_contributor_hash, p_contributor_hash
  )
  on conflict (request_id) do update set
    shoe_model_id = excluded.shoe_model_id,
    distance_km = excluded.distance_km
  where existing.contributor_hash = excluded.contributor_hash
  returning request_id into saved_request_id;

  -- Existing moderation status, record ID and creation time are preserved.
  return saved_request_id is not null;
end;
$$;

revoke execute on function public.save_shoe_lifespan_submission(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.save_shoe_lifespan_submission(uuid, uuid, numeric, text)
  to service_role;
notify pgrst, 'reload schema';

commit;
