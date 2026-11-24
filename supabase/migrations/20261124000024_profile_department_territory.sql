-- EPDMS 024: department and territory on a staff profile (Users & Access > Create user). Nullable and additive.
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists territory text;
