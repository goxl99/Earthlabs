-- Test-only stand-in for Supabase Storage, loaded just before the first migration that writes to storage.* directly.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
create or replace function storage.foldername(n text) returns text[] language sql immutable as $$ select (string_to_array(n,'/'))[1:greatest(array_length(string_to_array(n,'/'),1)-1,0)] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated;
