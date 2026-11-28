-- Publish from two accepted records, including repeat contributors.
-- This transaction updates aggregate publication and recalculates existing data.
begin;

alter table public.shoe_lifespan_stats
  drop constraint if exists shoe_lifespan_stats_minimum_count,
  drop constraint if exists shoe_lifespan_stats_minimum_contributors,
  add constraint shoe_lifespan_stats_minimum_count check (sample_count >= 2),
  add constraint shoe_lifespan_stats_minimum_contributors check (contributor_count >= 1);

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

  -- Publish from two accepted records, including repeat contributors.
  if calculated.sample_count < 2 then
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
    calculated.sample_count >= 2,
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

revoke execute on function public.refresh_shoe_lifespan_stat(uuid)
  from public, anon, authenticated;

do $$
declare
  model_id uuid;
begin
  for model_id in select id from public.shoe_models loop
    perform public.refresh_shoe_lifespan_stat(model_id);
  end loop;
end;
$$;

commit;
