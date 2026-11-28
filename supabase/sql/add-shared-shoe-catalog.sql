-- Publish only manufacturer/model names from curated choices and submissions.
-- Raw submissions, distances, contributor identifiers and dates stay private.
begin;
alter table public.shoe_models
  add column if not exists is_catalog_entry boolean not null default false;
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
commit;
