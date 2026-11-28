-- Repair only the backend privileges required by submit-shoe-lifespan.
-- This does not grant browser roles access to raw submissions.
begin;
grant usage on schema public to service_role;
grant select, insert, update on table public.shoe_models to service_role;
grant select, insert on table public.shoe_lifespan_submissions to service_role;
grant select on table public.shoe_lifespan_stats to service_role;
commit;
