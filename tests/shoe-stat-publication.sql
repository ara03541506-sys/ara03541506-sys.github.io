-- Run as the database administrator after applying the one-record migration.
-- All fixtures are rolled back. No test records remain in the database.
begin;

do $$
declare
  model_id uuid := gen_random_uuid();
  first_request uuid := gen_random_uuid();
  second_request uuid := gen_random_uuid();
  stat public.shoe_lifespan_stats%rowtype;
begin
  perform set_config('kutsudoki.test_model_id', model_id::text, true);
  insert into public.shoe_models (id, canonical_name, normalized_name)
  values (model_id, 'Publication test ' || model_id, 'publicationtest' || model_id);

  insert into public.shoe_lifespan_submissions
    (request_id, shoe_model_id, distance_km, source_hash, contributor_hash)
  values (first_request, model_id, 500, repeat('a', 64), repeat('b', 64));

  select * into strict stat from public.shoe_lifespan_stats where shoe_model_id = model_id;
  if not stat.is_public or stat.sample_count <> 1 or stat.contributor_count <> 1
     or stat.average_km <> 500 or stat.median_km <> 500
     or stat.minimum_km <> 500 or stat.maximum_km <> 500 then
    raise exception 'One record must publish its distance as all summary values';
  end if;

  insert into public.shoe_lifespan_submissions
    (request_id, shoe_model_id, distance_km, source_hash, contributor_hash)
  values (second_request, model_id, 700, repeat('a', 64), repeat('b', 64));

  select * into strict stat from public.shoe_lifespan_stats where shoe_model_id = model_id;
  if not stat.is_public or stat.sample_count <> 2 or stat.contributor_count <> 1
     or stat.average_km <> 600 or stat.median_km <> 600 then
    raise exception 'Two records from one contributor must publish correct statistics';
  end if;

  begin
    insert into public.shoe_lifespan_submissions
      (request_id, shoe_model_id, distance_km, source_hash, contributor_hash)
    values (second_request, model_id, 700, repeat('a', 64), repeat('b', 64));
    raise exception 'Duplicate request must be rejected';
  exception when unique_violation then null;
  end;

  insert into public.shoe_lifespan_submissions
    (request_id, shoe_model_id, distance_km, status, source_hash, contributor_hash)
  values (gen_random_uuid(), model_id, 900, 'excluded', repeat('a', 64), repeat('c', 64));

  select * into strict stat from public.shoe_lifespan_stats where shoe_model_id = model_id;
  if stat.sample_count <> 2 or stat.average_km <> 600 then
    raise exception 'Excluded and duplicate records must not change the aggregate';
  end if;

  update public.shoe_lifespan_submissions set status = 'excluded' where request_id = second_request;
  select * into strict stat from public.shoe_lifespan_stats where shoe_model_id = model_id;
  if not stat.is_public or stat.sample_count <> 1 or stat.average_km <> 500 then
    raise exception 'Returning to one accepted record must keep statistics public';
  end if;

  update public.shoe_lifespan_submissions set status = 'excluded' where request_id = first_request;
  if exists (select 1 from public.shoe_lifespan_stats where shoe_model_id = model_id and is_public) then
    raise exception 'Zero accepted records must hide statistics';
  end if;
end;
$$;

-- Verify that anonymous readers cannot see an aggregate with no accepted records.
set local role anon;
do $$
begin
  if exists (select 1 from public.shoe_lifespan_stats
             where shoe_model_id = current_setting('kutsudoki.test_model_id')::uuid) then
    raise exception 'RLS must hide a zero-record aggregate';
  end if;
end;
$$;
reset role;

-- Anonymous readers should see a single accepted record.
update public.shoe_lifespan_submissions set status = 'accepted'
where shoe_model_id = current_setting('kutsudoki.test_model_id')::uuid and distance_km = 500;

set local role anon;
do $$
declare
  stat public.shoe_lifespan_stats%rowtype;
begin
  select * into strict stat from public.shoe_lifespan_stats
  where shoe_model_id = current_setting('kutsudoki.test_model_id')::uuid;
  if not stat.is_public or stat.sample_count <> 1 or stat.average_km <> 500 then
    raise exception 'Anonymous readers must see one-record statistics';
  end if;
end;
$$;
reset role;

-- Restore the second record, attributing it to another contributor.
update public.shoe_lifespan_submissions
set status = 'accepted', contributor_hash = repeat('d', 64)
where shoe_model_id = current_setting('kutsudoki.test_model_id')::uuid and distance_km = 700;

set local role anon;
do $$
declare
  stat public.shoe_lifespan_stats%rowtype;
begin
  select * into strict stat from public.shoe_lifespan_stats
  where shoe_model_id = current_setting('kutsudoki.test_model_id')::uuid;
  if not stat.is_public or stat.sample_count <> 2 or stat.contributor_count <> 2 or stat.average_km <> 600 then
    raise exception 'Anonymous readers must see two-record statistics from different contributors';
  end if;
  if has_table_privilege(current_user, 'public.shoe_lifespan_submissions', 'SELECT') then
    raise exception 'Raw submissions must stay private';
  end if;
end;
$$;
reset role;

rollback;
