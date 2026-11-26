-- EPDMS database (project dkkwlipkhvuigkgjwizn).  Run after db/epdms_catalogue.sql is live in Batch (it is).
-- Sends the full Products & pricing set to Batch every time anything in it changes.  EPDMS stays the master.
-- Nothing secret is sent: settings whose key looks like a secret / token / key / password / link are left out.

create or replace function public.build_catalogue_payload() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version',       (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'skus',          coalesce((select jsonb_agg(to_jsonb(s) order by s.sku) from skus s), '[]'),
    'sku_margins',   coalesce((select jsonb_agg(to_jsonb(m)) from sku_margins m), '[]'),
    'margin_slabs',  coalesce((select jsonb_agg(to_jsonb(m)) from margin_slabs m), '[]'),
    'sku_access',    coalesce((select jsonb_agg(to_jsonb(a)) from sku_access a), '[]'),
    'schemes',       coalesce((select jsonb_agg(to_jsonb(c) - 'proposed_by' order by c.created_at) from schemes c), '[]'),
    'partners',      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type_code', p.type_code, 'status', p.status)) from partners p), '[]'),
    'settings',      coalesce((select jsonb_object_agg(key, value) from settings where key !~* '(secret|token|key|password|link)'), '{}'));
$$;

create or replace function public.push_catalogue() returns void language plpgsql security definer set search_path = public as $$
declare l public.batch_link; s text;
begin
  select * into l from batch_link where id = 1; if not found then return; end if;
  -- the shared secret is stored in batch_link; same call shape as the existing Batch sync
  perform net.http_post(
    url     := l.url || '/rest/v1/rpc/epdms_receive_catalogue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', l.anon_key, 'Authorization', 'Bearer ' || l.anon_key),
    body    := jsonb_build_object('p_secret', l.secret, 'p_data', build_catalogue_payload()),
    timeout_milliseconds := 8000);
end $$;
revoke all on function public.push_catalogue(), public.build_catalogue_payload() from public, anon, authenticated;

create or replace function public.trg_push_catalogue() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin perform push_catalogue(); exception when others then null; end;   -- a failed push must never block a pricing edit
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['skus','sku_margins','margin_slabs','sku_access','schemes','settings'] loop
    execute format('drop trigger if exists push_catalogue_%1$s on public.%1$I', t);
    execute format('create trigger push_catalogue_%1$s after insert or update or delete on public.%1$I for each statement execute function public.trg_push_catalogue()', t);
  end loop;
end $$;
-- First load, after applying:   select public.push_catalogue();
