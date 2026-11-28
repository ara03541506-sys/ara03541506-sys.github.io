-- Apply add-shoe-record-editing.sql first. All test fixtures roll back.
begin;

do $$
declare
  original_model uuid := gen_random_uuid();
  new_model uuid := gen_random_uuid();
  request_key uuid := gen_random_uuid();
  original_id uuid;
  original_created_at timestamptz;
  original_hash text := repeat('b', 64);
  saved boolean;
begin
  insert into public.shoe_models (id, canonical_name, normalized_name)
  values (original_model, 'Edit test A ' || original_model, 'edittest' || original_model),
         (new_model, 'Edit test B ' || new_model, 'edittest' || new_model);
  perform set_config('kutsudoki.edit_request', request_key::text, true);
  perform set_config('kutsudoki.edit_model', new_model::text, true);

  saved := public.save_shoe_lifespan_submission(request_key, original_model, 500, original_hash);
  if not saved then raise exception 'New record must be inserted'; end if;
  select id, created_at into original_id, original_created_at
  from public.shoe_lifespan_submissions where request_id = request_key;

  saved := public.save_shoe_lifespan_submission(request_key, new_model, 800, original_hash);
  if not saved or (select count(*) from public.shoe_lifespan_submissions where request_id = request_key) <> 1 then
    raise exception 'Editing must preserve exactly one record';
  end if;
  if not exists (select 1 from public.shoe_lifespan_submissions
                 where request_id = request_key and id = original_id and created_at = original_created_at
                   and shoe_model_id = new_model and distance_km = 800) then
    raise exception 'Edit must preserve ID and creation time and update model and distance';
  end if;
  if exists (select 1 from public.shoe_lifespan_stats where shoe_model_id = original_model and is_public) then
    raise exception 'Original model statistics must be hidden after moving its only record';
  end if;
  if not exists (select 1 from public.shoe_lifespan_stats
                 where shoe_model_id = new_model and is_public and sample_count = 1 and average_km = 800) then
    raise exception 'New model statistics must be recalculated';
  end if;

  saved := public.save_shoe_lifespan_submission(request_key, original_model, 200, repeat('c', 64));
  if saved or not exists (select 1 from public.shoe_lifespan_submissions
                          where request_id = request_key and shoe_model_id = new_model and distance_km = 800) then
    raise exception 'A different contributor must not edit the record';
  end if;

  update public.shoe_lifespan_submissions set status = 'excluded' where request_id = request_key;
  saved := public.save_shoe_lifespan_submission(request_key, new_model, 900, original_hash);
  if not saved or not exists (select 1 from public.shoe_lifespan_submissions
                              where request_id = request_key and status = 'excluded' and distance_km = 900) then
    raise exception 'Editing must preserve moderation status';
  end if;
  if exists (select 1 from public.shoe_lifespan_stats where shoe_model_id = new_model and is_public) then
    raise exception 'An edited excluded record must remain outside public statistics';
  end if;
end;
$$;

-- Only the Edge Function's service role may call the mutation RPC.
set local role service_role;
do $$
begin
  if not public.save_shoe_lifespan_submission(
    current_setting('kutsudoki.edit_request')::uuid,
    current_setting('kutsudoki.edit_model')::uuid, 950, repeat('b', 64)
  ) then raise exception 'Service role must be able to save'; end if;
end;
$$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.save_shoe_lifespan_submission(uuid,uuid,numeric,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.save_shoe_lifespan_submission(uuid,uuid,numeric,text)', 'EXECUTE') then
    raise exception 'Browser roles must not be able to call the mutation RPC';
  end if;
end;
$$;

rollback;
