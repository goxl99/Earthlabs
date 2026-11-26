-- BATCH database (project hgdltduqwayfepzuurke).  Send proposals to EPDMS and see what happened to them.
-- Batch never changes EPDMS prices or SKUs: it only sends a proposal, and a Super Admin decides in EPDMS.

create table if not exists public.epdms_outbound (id int primary key check (id = 1), url text not null, anon_key text not null, token text not null);
alter table public.epdms_outbound enable row level security;               -- no policy: only the functions below can read it

create table if not exists public.epdms_proposals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sku_new', 'price_change', 'margin_change')),
  payload     jsonb not null,
  note        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  delivered   boolean not null default false,          -- EPDMS has confirmed it received it
  request_id  bigint,
  last_error  text,
  decision_note text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table public.epdms_proposals enable row level security;
drop policy if exists ep_read on public.epdms_proposals;
create policy ep_read on public.epdms_proposals for select to authenticated using ((select app_role())::text in ('admin', 'qc_officer'));

create or replace function public._send_epdms_proposal(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare o epdms_outbound; r epdms_proposals; rid bigint;
begin
  select * into o from epdms_outbound where id = 1; select * into r from epdms_proposals where id = p_id;
  if o.id is null then update epdms_proposals set last_error = 'Batch is not linked to EPDMS for proposals yet' where id = p_id; return; end if;
  rid := net.http_post(url := o.url || '/rest/v1/rpc/batch_propose',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', o.anon_key, 'Authorization', 'Bearer ' || o.anon_key),
    body := jsonb_build_object('p_secret', o.token, 'p_proposal', jsonb_build_object('ref', r.id::text, 'kind', r.kind, 'payload', r.payload, 'note', r.note,
            'proposed_by', (select email from auth.users where id = r.created_by))),
    timeout_milliseconds := 8000);
  update epdms_proposals set request_id = rid, last_error = null where id = p_id;
end $$;
revoke all on function public._send_epdms_proposal(uuid) from public, anon, authenticated;

create or replace function public.propose_to_epdms(p_kind text, p_payload jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if coalesce((select app_role())::text, '') not in ('admin', 'qc_officer') then raise exception 'Only admin or QA/QC can send proposals to EPDMS'; end if;
  if p_kind not in ('sku_new', 'price_change', 'margin_change') then raise exception 'Unknown proposal type'; end if;
  insert into epdms_proposals(kind, payload, note) values (p_kind, p_payload, nullif(trim(coalesce(p_note, '')), '')) returning id into v;
  perform _send_epdms_proposal(v);
  return v;
end $$;

-- Called from the screen: confirms delivery of proposals sent earlier, and resends any that failed
create or replace function public.refresh_epdms_proposals() returns integer language plpgsql security definer set search_path = public as $$
declare r record; h record; res jsonb; n int := 0;
begin
  if coalesce((select app_role())::text, '') not in ('admin', 'qc_officer') then raise exception 'Not allowed'; end if;
  for r in select * from epdms_proposals where not delivered loop
    if r.request_id is null then perform _send_epdms_proposal(r.id); n := n + 1; continue; end if;
    select status_code, content, error_msg into h from net._http_response where id = r.request_id;
    if found then
      begin res := h.content::jsonb; exception when others then res := null; end;
      if h.status_code = 200 and coalesce(res ->> 'ok', '') = 'true' then update epdms_proposals set delivered = true, last_error = null where id = r.id;
      else update epdms_proposals set request_id = null, last_error = left(coalesce(res ->> 'error', res ->> 'message', h.error_msg, 'HTTP ' || h.status_code), 200) where id = r.id; end if;
    end if;
  end loop;
  return n;
end $$;

-- EPDMS -> Batch: the outcome of a proposal (same shared secret check as epdms_receive)
create or replace function public.epdms_receive_proposal_status(p_secret text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or not exists (select 1 from epdms_link where id = 1 and secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
    then return jsonb_build_object('ok', false, 'error', 'Not authorised'); end if;
  update epdms_proposals set status = p_data ->> 'status', decision_note = p_data ->> 'decision_note', decided_at = now(), delivered = true
  where id = (p_data ->> 'ref')::uuid and p_data ->> 'status' in ('approved', 'rejected');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.propose_to_epdms(text, jsonb, text), public.refresh_epdms_proposals() from public, anon;
grant execute on function public.propose_to_epdms(text, jsonb, text), public.refresh_epdms_proposals() to authenticated;
grant execute on function public.epdms_receive_proposal_status(text, jsonb) to anon, authenticated;
