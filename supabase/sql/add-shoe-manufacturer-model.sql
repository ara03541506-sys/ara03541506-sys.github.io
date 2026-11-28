-- Add structured names while preserving canonical names and model IDs.
begin;
alter table public.shoe_models add column if not exists manufacturer text;
alter table public.shoe_models add column if not exists model_name text;
commit;
