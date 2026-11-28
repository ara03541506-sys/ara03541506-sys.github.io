-- One-time migration of the former YAML starter choices into Supabase.
-- Seed only names; do not invent usage records or affect lifespan statistics.
begin;
alter table public.shoe_models
  add column if not exists is_catalog_entry boolean not null default false;

insert into public.shoe_models as existing
  (canonical_name, normalized_name, manufacturer, model_name, is_catalog_entry)
values
  ('NIKE Pegasus 41', 'nikepegasus41', 'NIKE', 'Pegasus 41', true),
  ('NIKE Vaporfly 3', 'nikevaporfly3', 'NIKE', 'Vaporfly 3', true),
  ('adidas ADIZERO EVO SL', 'adidasadizeroevosl', 'adidas', 'ADIZERO EVO SL', true),
  ('adidas ADIZERO ADIOS PRO 4', 'adidasadizeroadiospro4', 'adidas', 'ADIZERO ADIOS PRO 4', true),
  ('adidas ADIZERO TAKUMI SEN 11', 'adidasadizerotakumisen11', 'adidas', 'ADIZERO TAKUMI SEN 11', true),
  ('adidas ADIZERO JAPAN 9', 'adidasadizerojapan9', 'adidas', 'ADIZERO JAPAN 9', true),
  ('ASICS GEL-NIMBUS 27', 'asicsgelnimbus27', 'ASICS', 'GEL-NIMBUS 27', true),
  ('ASICS NOVABLAST 5', 'asicsnovablast5', 'ASICS', 'NOVABLAST 5', true),
  ('New Balance FuelCell SuperComp Elite v5', 'newbalancefuelcellsupercompelitev5', 'New Balance', 'FuelCell SuperComp Elite v5', true),
  ('PUMA Deviate NITRO Elite 3', 'pumadeviatenitroelite3', 'PUMA', 'Deviate NITRO Elite 3', true),
  ('PUMA Deviate NITRO Elite 4', 'pumadeviatenitroelite4', 'PUMA', 'Deviate NITRO Elite 4', true),
  ('BROOKS Hyperion 3', 'brookshyperion3', 'BROOKS', 'Hyperion 3', true)
on conflict (normalized_name) do update set
  manufacturer = coalesce(existing.manufacturer, excluded.manufacturer),
  model_name = coalesce(existing.model_name, excluded.model_name),
  is_catalog_entry = true;

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

