-- Shoe lifespan community statistics
-- Run this file in the Supabase SQL Editor.
-- Raw submissions are private. Browsers can read public aggregates and the
-- name-only shared shoe catalog.

create extension if not exists pgcrypto;

create table if not exists public.shoe_models (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null unique,
  manufacturer text,
  model_name text,
  is_catalog_entry boolean not null default false,
  created_at timestamptz not null default now(),
  constraint shoe_models_name_length
    check (char_length(canonical_name) between 2 and 80),
  constraint shoe_models_normalized_name_length
    check (char_length(normalized_name) between 2 and 80)
);

alter table public.shoe_models add column if not exists manufacturer text;
alter table public.shoe_models add column if not exists model_name text;
alter table public.shoe_models add column if not exists is_catalog_entry boolean not null default false;

create table if not exists public.shoe_lifespan_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  shoe_model_id uuid not null references public.shoe_models(id) on delete restrict,
  distance_km numeric(6,1) not null,
  status text not null default 'accepted',
  source_hash text not null,
  contributor_hash text not null,
  created_at timestamptz not null default now(),
  constraint shoe_lifespan_distance_range
    check (distance_km between 10 and 3000),
  constraint shoe_lifespan_status_values
    check (status in ('accepted', 'excluded')),
  constraint shoe_lifespan_source_hash_format
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint shoe_lifespan_contributor_hash_format
    check (contributor_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists shoe_lifespan_submissions_model_status_idx
  on public.shoe_lifespan_submissions (shoe_model_id, status);

create table if not exists public.shoe_lifespan_stats (
  shoe_model_id uuid primary key references public.shoe_models(id) on delete cascade,
  shoe_name text not null,
  sample_count integer not null,
  contributor_count integer not null,
  average_km numeric(7,1),
  median_km numeric(7,1),
  trimmed_average_km numeric(7,1),
  minimum_km numeric(7,1),
  maximum_km numeric(7,1),
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint shoe_lifespan_stats_minimum_count check (sample_count >= 1),
  constraint shoe_lifespan_stats_minimum_contributors check (contributor_count >= 1)
);

-- Makes the script compatible with a database created by an earlier draft.
alter table public.shoe_lifespan_stats
  add column if not exists is_public boolean not null default false;

-- Also update constraints when rerunning setup on an existing database.
alter table public.shoe_lifespan_stats
  drop constraint if exists shoe_lifespan_stats_minimum_count,
  drop constraint if exists shoe_lifespan_stats_minimum_contributors,
  add constraint shoe_lifespan_stats_minimum_count check (sample_count >= 1),
  add constraint shoe_lifespan_stats_minimum_contributors check (contributor_count >= 1);

-- Recalculate one model. For 10+ samples the trimmed average removes the
-- highest and lowest 10 percent, limiting the effect of extreme submissions.
create or replace function public.refresh_shoe_lifespan_stat(target_model_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated record;
  model_name text;
begin
  select canonical_name
    into model_name
    from public.shoe_models
   where id = target_model_id;

  if model_name is null then return; end if;

  with accepted as (
    select distance_km::numeric as distance_km,
           contributor_hash
      from public.shoe_lifespan_submissions
     where shoe_model_id = target_model_id
       and status = 'accepted'
  ), boundaries as (
    select count(*)::integer as sample_count,
           count(distinct contributor_hash)::integer as contributor_count,
           percentile_cont(0.10) within group (order by distance_km) as p10,
           percentile_cont(0.90) within group (order by distance_km) as p90
      from accepted
  )
  select b.sample_count,
         b.contributor_count,
         round(avg(a.distance_km), 1) as average_km,
         round((percentile_cont(0.5) within group (order by a.distance_km))::numeric, 1) as median_km,
         round(
           coalesce(
             avg(a.distance_km) filter (
               where b.sample_count >= 10
                 and a.distance_km between b.p10 and b.p90
             ),
             avg(a.distance_km)
           ),
           1
         ) as trimmed_average_km,
         round(min(a.distance_km), 1) as minimum_km,
         round(max(a.distance_km), 1) as maximum_km
    into calculated
    from boundaries b
    left join accepted a on true
   group by b.sample_count, b.contributor_count, b.p10, b.p90;

  -- Publish from the first accepted record, including repeat contributors.
  if calculated.sample_count < 1 then
    update public.shoe_lifespan_stats
       set is_public = false,
           updated_at = now()
     where shoe_model_id = target_model_id;
    return;
  end if;

  insert into public.shoe_lifespan_stats (
    shoe_model_id,
    shoe_name,
    sample_count,
    contributor_count,
    average_km,
    median_km,
    trimmed_average_km,
    minimum_km,
    maximum_km,
    is_public,
    updated_at
  ) values (
    target_model_id,
    model_name,
    calculated.sample_count,
    calculated.contributor_count,
    calculated.average_km,
    calculated.median_km,
    calculated.trimmed_average_km,
    calculated.minimum_km,
    calculated.maximum_km,
    calculated.sample_count >= 1,
    now()
  )
  on conflict (shoe_model_id) do update set
    shoe_name = excluded.shoe_name,
    sample_count = excluded.sample_count,
    contributor_count = excluded.contributor_count,
    average_km = excluded.average_km,
    median_km = excluded.median_km,
    trimmed_average_km = excluded.trimmed_average_km,
    minimum_km = excluded.minimum_km,
    maximum_km = excluded.maximum_km,
    is_public = excluded.is_public,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.update_shoe_lifespan_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.shoe_model_id <> new.shoe_model_id then
    perform public.refresh_shoe_lifespan_stat(old.shoe_model_id);
  end if;

  perform public.refresh_shoe_lifespan_stat(new.shoe_model_id);
  return new;
end;
$$;

create or replace trigger update_shoe_lifespan_stats
after insert or update on public.shoe_lifespan_submissions
for each row execute function public.update_shoe_lifespan_stats_trigger();

-- Every exposed table uses RLS. Raw data and the model table are available
-- only to the backend secret key; a separate RPC exposes model names only.
alter table public.shoe_models enable row level security;
alter table public.shoe_lifespan_submissions enable row level security;
alter table public.shoe_lifespan_stats enable row level security;

revoke all on table public.shoe_models from anon, authenticated;
revoke all on table public.shoe_lifespan_submissions from anon, authenticated;
revoke all on table public.shoe_lifespan_stats from anon, authenticated;
grant select on table public.shoe_lifespan_stats to anon, authenticated;

-- Secret keys use service_role. RLS bypass does not replace SQL privileges,
-- and projects with automatic table grants disabled need these explicitly.
grant usage on schema public to service_role;
grant select, insert, update on table public.shoe_models to service_role;
grant select, insert on table public.shoe_lifespan_submissions to service_role;
grant select on table public.shoe_lifespan_stats to service_role;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'shoe_lifespan_stats'
       and policyname = 'public_read_shoe_lifespan_stats'
  ) then
    create policy "public_read_shoe_lifespan_stats"
    on public.shoe_lifespan_stats
    for select
    to anon, authenticated
    using (is_public = true);
  end if;
end;
$$;

alter policy "public_read_shoe_lifespan_stats"
on public.shoe_lifespan_stats
using (is_public = true);

-- This RPC intentionally bypasses RLS to expose curated and submitted names.
-- It does not expose individual distances, dates, IDs, counts or source hashes.
create or replace function public.get_shoe_catalog()
returns table (manufacturer text, model_name text, shoe_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.manufacturer, m.model_name, m.canonical_name as shoe_name
    from public.shoe_models m
   where m.is_catalog_entry or exists (
     select 1 from public.shoe_lifespan_submissions s
      where s.shoe_model_id = m.id and s.status = 'accepted'
   )
   order by m.manufacturer, m.model_name, m.canonical_name;
$$;
revoke execute on function public.get_shoe_catalog() from public;
grant execute on function public.get_shoe_catalog() to anon, authenticated, service_role;
comment on function public.get_shoe_catalog() is
  'Name-only catalog of curated entries and accepted submissions. No raw record access.';
notify pgrst, 'reload schema';

-- Trigger helpers must never be callable from the public API.
revoke execute on function public.refresh_shoe_lifespan_stat(uuid) from public, anon, authenticated;
revoke execute on function public.update_shoe_lifespan_stats_trigger() from public, anon, authenticated;

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

-- To exclude a bad submission later, run this in the SQL Editor:
-- update public.shoe_lifespan_submissions
-- set status = 'excluded'
-- where id = '<submission-id>';
