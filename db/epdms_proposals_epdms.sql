-- EPDMS database (project dkkwlipkhvuigkgjwizn).  Proposals that arrive from Batch Management.
-- Batch can only ADD a pending proposal. Only a Super Admin can approve it; approving applies it. Nothing goes live on its own.
-- A new SKU always arrives as a DRAFT (the existing rules still apply before it can be made active).

create table if not exists public.batch_proposal_link (id int primary key check (id = 1), token_hash text not null);
alter table public.batch_proposal_link enable row level security;           -- no policy: only the functions below can read it

create table if not exists public.batch_proposals (
  id            bigint generated always as identity primary key,
  ref           text not null unique,                                          -- id of the proposal in Batch
  kind          text not null check (kind in ('sku_new', 'price_change', 'margin_change')),
  payload       jsonb not null,
  note          text,
  proposed_by   text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposed_at   timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text
);
alter table public.batch_proposals enable row level security;
drop policy if exists bp_super_read on public.batch_proposals;
create policy bp_super_read on public.batch_proposals for select to authenticated using (public.my_role()::text = 'super_admin');

-- Batch -> EPDMS: add a pending proposal (needs the proposal token; cannot change any price or SKU)
create or replace function public.batch_propose(p_secret text, p_proposal jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := p_proposal ->> 'kind'; pl jsonb := p_proposal -> 'payload';
begin
  if p_secret is null or not exists (select 1 from batch_proposal_link where id = 1 and token_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
    then return jsonb_build_object('ok', false, 'error', 'Not authorised'); end if;
  if coalesce(p_proposal ->> 'ref', '') = '' or k is null or pl is null then return jsonb_build_object('ok', false, 'error', 'Incomplete proposal'); end if;
  if k = 'sku_new' and (coalesce(pl ->> 'sku', '') = '' or coalesce(pl ->> 'name', '') = '' or coalesce(pl ->> 'category', '') = '' or coalesce((pl ->> 'mrp')::numeric, 0) <= 0 or coalesce((pl ->> 'pack_size')::int, 0) <= 0)
    then return jsonb_build_object('ok', false, 'error', 'A new SKU needs a code, name, category, MRP and pack size'); end if;
  if k = 'price_change' and (coalesce(pl ->> 'sku', '') = '' or coalesce((pl ->> 'mrp')::numeric, 0) <= 0) then return jsonb_build_object('ok', false, 'error', 'A price change needs a SKU and a new MRP'); end if;
  if k = 'margin_change' and (coalesce(pl ->> 'sku', '') = '' or coalesce(pl ->> 'type_code', '') = '' or (pl ->> 'margin_pct') is null) then return jsonb_build_object('ok', false, 'error', 'A margin change needs a SKU, partner type and margin'); end if;
  insert into batch_proposals(ref, kind, payload, note, proposed_by) values (p_proposal ->> 'ref', k, pl, nullif(p_proposal ->> 'note', ''), nullif(p_proposal ->> 'proposed_by', ''))
  on conflict (ref) do nothing;
  return jsonb_build_object('ok', true);
exception when others then return jsonb_build_object('ok', false, 'error', left(sqlerrm, 200));
end $$;
grant execute on function public.batch_propose(text, jsonb) to anon, authenticated;

-- Super Admin only: approve (applies the change) or reject.  Then tells Batch the outcome.
create or replace function public.decide_batch_proposal(p_id bigint, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare b batch_proposals; pl jsonb; l public.batch_link;
begin
  if public.my_role()::text <> 'super_admin' then raise exception 'Only a Super Admin can decide Batch proposals'; end if;
  select * into b from batch_proposals where id = p_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if b.status <> 'pending' then raise exception 'This proposal is already %', b.status; end if;
  pl := b.payload;
  if p_approve then
    if b.kind = 'sku_new' then
      if exists (select 1 from skus where sku = pl ->> 'sku') then raise exception 'SKU code % already exists', pl ->> 'sku'; end if;
      insert into skus(sku, name, category, mrp, pack_size, unit_ml, moq, make_days, slab, hsn, status)
      values (pl ->> 'sku', pl ->> 'name', pl ->> 'category', (pl ->> 'mrp')::numeric, (pl ->> 'pack_size')::int, nullif(pl ->> 'unit_ml', '')::numeric,
              coalesce(nullif(pl ->> 'moq', '')::int, 5), nullif(pl ->> 'make_days', '')::int, coalesce(nullif(pl ->> 'slab', '')::int, 1), coalesce(nullif(pl ->> 'hsn', ''), '340130'), 'draft');
    elsif b.kind = 'price_change' then
      update skus set mrp = (pl ->> 'mrp')::numeric where sku = pl ->> 'sku';
      if not found then raise exception 'SKU % not found', pl ->> 'sku'; end if;
    elsif b.kind = 'margin_change' then
      insert into sku_margins(sku, type_code, margin_pct) values (pl ->> 'sku', pl ->> 'type_code', (pl ->> 'margin_pct')::numeric)
      on conflict (sku, type_code) do update set margin_pct = excluded.margin_pct;
    end if;
  end if;
  update batch_proposals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  -- tell Batch (same shared secret and route as the catalogue); a failed call never undoes the decision
  begin
    select * into l from batch_link where id = 1;
    if found then perform net.http_post(url := l.url || '/rest/v1/rpc/epdms_receive_proposal_status',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', l.anon_key, 'Authorization', 'Bearer ' || l.anon_key),
      body := jsonb_build_object('p_secret', l.secret, 'p_data', jsonb_build_object('ref', b.ref, 'status', case when p_approve then 'approved' else 'rejected' end, 'decision_note', nullif(trim(coalesce(p_note, '')), ''))),
      timeout_milliseconds := 8000); end if;
  exception when others then null; end;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;
revoke all on function public.decide_batch_proposal(bigint, boolean, text) from public, anon;
grant execute on function public.decide_batch_proposal(bigint, boolean, text) to authenticated;
