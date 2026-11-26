-- BATCH database (project hgdltduqwayfepzuurke).  Not applied yet – run in the Supabase SQL editor after review.
-- Keeps one read-only copy of EPDMS "Products & pricing". EPDMS pushes it; the Batch app only reads it.

create table if not exists public.epdms_catalogue (
  id         int primary key check (id = 1),
  payload    jsonb not null,
  version    bigint not null default 0,
  fetched_at timestamptz not null default now()
);
alter table public.epdms_catalogue enable row level security;

drop policy if exists epdms_cat_read on public.epdms_catalogue;
create policy epdms_cat_read on public.epdms_catalogue for select to authenticated
  using ((select app_role())::text in ('admin','qc_officer'));
-- no insert / update / delete policy: only the function below can write.

-- Same shared-secret check as epdms_receive (epdms_link.secret_hash).
create or replace function public.epdms_receive_catalogue(p_secret text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v bigint := coalesce(nullif(p_data ->> 'version', '')::bigint, 0);
begin
  if p_secret is null or not exists (select 1 from epdms_link where id = 1 and secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
    then return jsonb_build_object('ok', false, 'error', 'Not authorised'); end if;
  if p_data is null or jsonb_typeof(p_data -> 'skus') <> 'array' then return jsonb_build_object('ok', false, 'error', 'Not a catalogue feed'); end if;
  -- an older update never overwrites a newer one
  insert into epdms_catalogue(id, payload, version, fetched_at) values (1, p_data, v, now())
  on conflict (id) do update set payload = excluded.payload, version = excluded.version, fetched_at = now()
  where epdms_catalogue.version <= excluded.version;
  return jsonb_build_object('ok', true, 'skus', jsonb_array_length(p_data -> 'skus'), 'version', v);
end $$;
grant execute on function public.epdms_receive_catalogue(text, jsonb) to anon, authenticated;
