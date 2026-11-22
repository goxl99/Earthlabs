-- EPDMS 011 (build 6): vendors, vendor stock reports, raw-material inventory, release orders with a payment gate,
-- procurement settings (lead time, limits), credit ladder (pay-and-carry first, AI proposes, Super Admin approves),
-- AI recommendations (stored only by the service key, decided only by Super Admin) and the approvals queue.
-- No real prices or partner data: rates are entered by staff at run time and live only in the database.

create or replace function public.my_vendor() returns text
language sql stable security definer set search_path = public as $$ select vendor_id from public.profiles where id = auth.uid() and active and role = 'vendor' $$;
create or replace function public.is_procurement() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('super_admin','warehouse'), false) $$;


-- ============ 0) Payment gate, enforced on the table itself (defence in depth) ============
-- Whatever path writes an order, it cannot reach Payment Confirmed / Dispatched / Delivered unless confirmed payments cover the total.
-- The only exception is the documented credit exception (dispatch from Approved, pay-and-carry off, partner on a credit level), done inside dispatch_order().
create or replace function public.orders_payment_gate() returns trigger language plpgsql security definer set search_path = public as $$
declare paid numeric;
begin
  if new.status in ('Payment Confirmed','Dispatched','Delivered') and new.status is distinct from old.status and old.status not in ('Payment Confirmed','Dispatched') then
    select coalesce(sum(amount),0) into paid from public.order_payments where order_id = new.id;
    if paid < new.total and not (new.status = 'Dispatched' and old.status = 'Approved' and current_setting('epdms.dispatching', true) = 'on') then
      raise exception 'Payment gate: order % has no verified payment covering its total (paid %, total %)', new.id, paid, new.total;
    end if;
  end if;
  return new;
end $$;
create trigger orders_payment_gate_t before update on public.orders for each row execute function public.orders_payment_gate();
revoke execute on function public.orders_payment_gate() from public, anon, authenticated;

-- ============ settings (adjustable by Super Admin only, through the existing settings policy) ============
insert into public.settings(key,value) values
 ('procurement','{"lead_buffer":2,"ro_limit":100000,"auto_limit":0,"advance_pct":100,"auto_email":true}'),
 ('credit_ladder','[{"n":"Pay & carry","limit":0,"days":0,"min":0},{"n":"Starter credit","limit":100000,"days":7,"min":75},{"n":"Standard credit","limit":300000,"days":15,"min":85},{"n":"Trusted","limit":600000,"days":30,"min":90}]')
on conflict (key) do nothing;
-- procurement settings contain no secrets but are internal: staff read them, partners and vendors do not (existing policy: staff or lead_time only)

-- ============ 1) Vendors ============
create sequence public.vendor_seq;
create table public.vendors (
  id text primary key default ('VND-' || lpad(nextval('public.vendor_seq')::text, 4, '0')),
  name text not null check (length(trim(name)) > 1),
  person text, email text, phone text,
  supplies text not null default '',
  district text not null default '',
  status text not null default 'Under Verification' check (status in ('Under Verification','Active','Suspended')),
  credit_level int not null default 0 check (credit_level >= 0),   -- 0 = EarthLabs pays before dispatch (pay and carry)
  created_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
create policy vendors_read on public.vendors for select using (public.my_role() in ('super_admin','accounts','warehouse') or id = public.my_vendor());
revoke insert, update, delete, truncate on public.vendors from anon, authenticated;
create trigger audit_vendors after insert or update on public.vendors for each row execute function public.audit_row('id');
revoke all on public.vendor_seq from anon, authenticated;

create or replace function public.create_vendor(nm text, person text, mail text, ph text, sup text, dist text) returns text
language plpgsql security definer set search_path = public as $$
declare vid text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can add vendors'; end if;
  insert into public.vendors(name, person, email, phone, supplies, district) values (trim(nm), person, mail, ph, coalesce(sup,''), coalesce(dist,'')) returning id into vid;
  return vid;
end $$;
create or replace function public.set_vendor_status(vid text, st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve or suspend vendors'; end if;
  if st not in ('Under Verification','Active','Suspended') then raise exception 'Unknown status'; end if;
  update public.vendors set status = st where id = vid;
  if not found then raise exception 'Vendor not found'; end if;
end $$;

-- ============ 2) Raw materials ============
create table public.raw_materials (
  id text primary key,
  name text not null, unit text not null default 'kg',
  vendor_id text references public.vendors(id),
  on_hand numeric(14,3) not null default 0 check (on_hand >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  per_day numeric(14,3) not null default 0 check (per_day >= 0),
  lead_days int not null default 7 check (lead_days >= 0),
  rate numeric(12,2),                                   -- EarthLabs' planning rate, entered at run time (never in the repo)
  v_avail numeric(14,3), v_rate numeric(12,2), v_lead int, v_date date,   -- from the last approved vendor stock report
  active boolean not null default true
);
create index raw_materials_vendor_idx on public.raw_materials(vendor_id);
alter table public.raw_materials enable row level security;
create policy rm_read on public.raw_materials for select using (public.my_role() in ('super_admin','accounts','warehouse'));
revoke insert, update, delete, truncate on public.raw_materials from anon, authenticated;
create trigger audit_raw_materials after insert or update on public.raw_materials for each row execute function public.audit_row('id');
create table public.rm_moves (
  id bigint generated always as identity primary key,
  rm_id text not null references public.raw_materials(id),
  delta numeric(14,3) not null, reason text not null, ref text, by_user uuid default auth.uid(), at timestamptz not null default now()
);
create index rm_moves_idx on public.rm_moves(rm_id, at desc);
alter table public.rm_moves enable row level security;
create policy rm_moves_read on public.rm_moves for select using (public.my_role() in ('super_admin','accounts','warehouse'));
revoke insert, update, delete, truncate on public.rm_moves from anon, authenticated;

-- Super Admin defines a raw material, including its lead time and reorder level (management-adjustable)
create or replace function public.upsert_raw_material(i text, nm text, un text, vid text, reorder numeric, perday numeric, lead int, rt numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin can change raw-material master data and lead times'; end if;
  if vid is not null and not exists (select 1 from public.vendors where id = vid) then raise exception 'Vendor not found'; end if;
  insert into public.raw_materials(id, name, unit, vendor_id, reorder_level, per_day, lead_days, rate) values (trim(i), nm, coalesce(un,'kg'), vid, coalesce(reorder,0), coalesce(perday,0), coalesce(lead,7), rt)
  on conflict (id) do update set name = excluded.name, unit = excluded.unit, vendor_id = excluded.vendor_id, reorder_level = excluded.reorder_level,
    per_day = excluded.per_day, lead_days = excluded.lead_days, rate = excluded.rate;
end $$;
create or replace function public.adjust_raw_material(i text, delta numeric, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can change raw-material stock'; end if;
  if length(trim(coalesce(why,''))) < 3 then raise exception 'Give a reason for the stock change'; end if;
  update public.raw_materials set on_hand = on_hand + delta where id = i;   -- the check (on_hand >= 0) refuses negative stock
  if not found then raise exception 'Raw material not found'; end if;
  insert into public.rm_moves(rm_id, delta, reason) values (i, delta, why);
end $$;

-- a vendor sees which items EarthLabs buys from it (code, name, unit only: no stock, no rates)
create or replace function public.my_vendor_items() returns table(id text, name text, unit text)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.unit from public.raw_materials r where r.vendor_id = public.my_vendor() and r.active order by r.id $$;
grant execute on function public.my_vendor_items() to authenticated;
revoke execute on function public.my_vendor_items() from anon;

-- ============ 3) Vendor stock reports (vendor reports availability, Super Admin approves) ============
create sequence public.vsr_seq;
create table public.vendor_stock_reports (
  id text primary key default ('VSR-' || lpad(nextval('public.vsr_seq')::text, 4, '0')),
  vendor_id text not null references public.vendors(id),
  status text not null default 'Pending approval' check (status in ('Pending approval','Approved','Rejected')),
  reason text, decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.vendor_stock_lines (
  report_id text not null references public.vendor_stock_reports(id) on delete cascade,
  rm_id text not null references public.raw_materials(id),
  avail numeric(14,3) not null check (avail >= 0), rate numeric(12,2) check (rate is null or rate >= 0), lead_days int check (lead_days is null or lead_days >= 0),
  primary key (report_id, rm_id)
);
create index vsr_status_idx on public.vendor_stock_reports(status, created_at);
alter table public.vendor_stock_reports enable row level security;
alter table public.vendor_stock_lines enable row level security;
create policy vsr_read on public.vendor_stock_reports for select using (public.my_role() in ('super_admin','accounts','warehouse') or vendor_id = public.my_vendor());
create policy vsl_read on public.vendor_stock_lines for select using (exists (select 1 from public.vendor_stock_reports r where r.id = report_id));
revoke insert, update, delete, truncate on public.vendor_stock_reports, public.vendor_stock_lines from anon, authenticated;
revoke all on public.vsr_seq from anon, authenticated;
create trigger audit_vsr after insert or update on public.vendor_stock_reports for each row execute function public.audit_row('id');

create or replace function public.submit_vendor_stock_report(items jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare vid text := public.my_vendor(); rid text; it jsonb;
begin
  if vid is null then raise exception 'Only a vendor can submit a stock report'; end if;
  if not exists (select 1 from public.vendors where id = vid and status = 'Active') then raise exception 'Your vendor account is not active yet'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'Report at least one item'; end if;
  insert into public.vendor_stock_reports(vendor_id) values (vid) returning id into rid;
  for it in select * from jsonb_array_elements(items) loop
    if not exists (select 1 from public.raw_materials where id = it->>'rm' and vendor_id = vid) then raise exception 'You can report only items EarthLabs buys from you (%)', it->>'rm'; end if;
    insert into public.vendor_stock_lines(report_id, rm_id, avail, rate, lead_days) values (rid, it->>'rm', (it->>'avail')::numeric, (it->>'rate')::numeric, (it->>'lead')::int);
  end loop;
  return rid;
end $$;
create or replace function public.decide_vendor_stock_report(rid text, approve boolean, why text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.vendor_stock_reports; l record;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve vendor stock reports'; end if;
  select * into r from public.vendor_stock_reports where id = rid for update;
  if r.id is null then raise exception 'Report not found'; end if;
  if r.status <> 'Pending approval' then raise exception 'This report is already %', r.status; end if;
  if not approve and length(trim(coalesce(why,''))) < 3 then raise exception 'Give a reason for rejecting'; end if;
  update public.vendor_stock_reports set status = case when approve then 'Approved' else 'Rejected' end, reason = why, decided_by = auth.uid(), decided_at = now() where id = rid;
  if approve then
    for l in select * from public.vendor_stock_lines where report_id = rid loop
      update public.raw_materials set v_avail = l.avail, v_rate = l.rate, v_lead = l.lead_days, v_date = current_date where id = l.rm_id;
    end loop;
  end if;
end $$;

-- ============ 4) Credit ladder: pay-and-carry first, proposals by AI or staff, Super Admin decides ============
create table public.credit_proposals (
  id bigint generated always as identity primary key,
  entity_kind text not null check (entity_kind in ('partner','vendor')),
  entity_id text not null,
  from_level int not null, to_level int not null check (to_level >= 0),
  reason text not null,
  source text not null check (source in ('ai','staff')),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  proposed_by uuid, decided_by uuid, decided_at timestamptz, note text,
  created_at timestamptz not null default now()
);
create index credit_proposals_status_idx on public.credit_proposals(status, created_at);
create unique index credit_one_open_idx on public.credit_proposals(entity_kind, entity_id) where status = 'Pending';
alter table public.credit_proposals enable row level security;
create policy credit_read on public.credit_proposals for select using (public.my_role() in ('super_admin','accounts','sales'));
revoke insert, update, delete, truncate on public.credit_proposals from anon, authenticated;
create trigger audit_credit_proposals after insert or update on public.credit_proposals for each row execute function public.audit_row('id');

-- credit levels change only through decide_credit_change
create or replace function public.credit_level_guard() returns trigger language plpgsql as $$
begin
  if new.credit_level is distinct from old.credit_level and coalesce(current_setting('epdms.credit_apply', true),'') <> 'on' then
    raise exception 'Credit levels change only when Super Admin approves a credit proposal';
  end if;
  return new;
end $$;
create trigger partners_credit_guard before update on public.partners for each row execute function public.credit_level_guard();
create trigger vendors_credit_guard before update on public.vendors for each row execute function public.credit_level_guard();

create or replace function public.ladder_len() returns int language sql stable security definer set search_path = public as $$
  select jsonb_array_length(value) from public.settings where key = 'credit_ladder' $$;
create or replace function public.entity_credit_level(k text, i text) returns int language plpgsql stable security definer set search_path = public as $$
declare l int;
begin
  if k = 'partner' then select credit_level into l from public.partners where id = i; else select credit_level into l from public.vendors where id = i; end if;
  if l is null then raise exception '% % not found', k, i; end if;
  return l;
end $$;
revoke execute on function public.entity_credit_level(text,text) from public, anon, authenticated;

-- one internal insert path; validates the step. Not callable by users.
create or replace function public.insert_credit_proposal(k text, i text, to_lvl int, why text, src text, uid uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare cur int := public.entity_credit_level(k, i); pid bigint;
begin
  if to_lvl < 0 or to_lvl >= public.ladder_len() then raise exception 'That credit level does not exist'; end if;
  if to_lvl = cur then raise exception 'Already at that level'; end if;
  if to_lvl > cur + 1 then raise exception 'Credit moves up one step at a time'; end if;
  if length(trim(coalesce(why,''))) < 3 then raise exception 'Give the reason for the change'; end if;
  insert into public.credit_proposals(entity_kind, entity_id, from_level, to_level, reason, source, proposed_by) values (k, i, cur, to_lvl, why, src, uid) returning id into pid;
  return pid;
end $$;
revoke execute on function public.insert_credit_proposal(text,text,int,text,text,uuid) from public, anon, authenticated;

create or replace function public.propose_credit_change(k text, i text, to_lvl int, why text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','sales','accounts') then raise exception 'Only staff can propose a credit change'; end if;
  return public.insert_credit_proposal(k, i, to_lvl, why, 'staff', auth.uid());
end $$;
-- the AI Edge Function (service key) files its credit proposals here
create or replace function public.ai_propose_credit(k text, i text, to_lvl int, why text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Reserved for the AI service'; end if;
  return public.insert_credit_proposal(k, i, to_lvl, why, 'ai', null);
end $$;
revoke execute on function public.ai_propose_credit(text,text,int,text) from public, anon, authenticated;

create or replace function public.apply_credit_level(k text, i text, lvl int) returns void
language plpgsql security definer set search_path = public as $$
declare pc jsonb;
begin
  select value into pc from public.settings where key = 'pay_and_carry';
  if lvl > 0 and coalesce((pc->>'enabled')::boolean, true) then raise exception 'Pay-and-carry is switched on. Switch it off in settings before any credit is opened'; end if;
  perform set_config('epdms.credit_apply','on',true);
  if k = 'partner' then update public.partners set credit_level = lvl where id = i; else update public.vendors set credit_level = lvl where id = i; end if;
  perform set_config('epdms.credit_apply','off',true);
end $$;
revoke execute on function public.apply_credit_level(text,text,int) from public, anon, authenticated;

create or replace function public.decide_credit_change(pid bigint, approve boolean, why text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.credit_proposals;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve credit changes'; end if;
  select * into p from public.credit_proposals where id = pid for update;
  if p.id is null then raise exception 'Proposal not found'; end if;
  if p.status <> 'Pending' then raise exception 'This proposal is already %', p.status; end if;
  if approve then
    if public.entity_credit_level(p.entity_kind, p.entity_id) <> p.from_level then raise exception 'The level changed since this was proposed. Propose again'; end if;
    perform public.apply_credit_level(p.entity_kind, p.entity_id, p.to_level);
  end if;
  update public.credit_proposals set status = case when approve then 'Approved' else 'Rejected' end, decided_by = auth.uid(), decided_at = now(), note = why where id = pid;
  if approve and p.entity_kind = 'partner' then
    perform public.notify_partner(p.entity_id, 'Credit level changed', 'Your credit level was updated by EarthLabs.', '/partner/dashboard/');
  end if;
end $$;

-- ============ 5) Release orders (EarthLabs buys raw material; vendor ships only after payment is released or credit applies) ============
create sequence public.ro_seq;
create table public.release_orders (
  id text primary key default ('RO-' || to_char(current_date,'YYMM') || '-' || lpad(nextval('public.ro_seq')::text, 4, '0')),
  vendor_id text not null references public.vendors(id),
  rm_id text not null references public.raw_materials(id),
  qty numeric(14,3) not null check (qty > 0),
  rate numeric(12,2) not null check (rate >= 0),
  total numeric(14,2) generated always as (round(qty * rate, 2)) stored,
  lead_days int not null, eta date,
  status text not null default 'Pending approval' check (status in ('Pending approval','Approved','Acknowledged','Dispatched','Received','Rejected','Cancelled')),
  pay_mode text check (pay_mode in ('Advance','Credit')),
  pay_status text not null default 'Unpaid' check (pay_status in ('Unpaid','Paid','On credit')),
  pay_amount numeric(14,2) not null default 0,
  pay_utr text,
  raised_by uuid default auth.uid(), approved_by uuid, approved_at timestamptz, received_at timestamptz, actual_days int,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index release_orders_status_idx on public.release_orders(status, created_at desc);
create index release_orders_vendor_idx on public.release_orders(vendor_id, created_at desc);
create unique index release_orders_utr_idx on public.release_orders(lower(trim(pay_utr))) where pay_utr is not null;
alter table public.release_orders enable row level security;
create policy ro_read on public.release_orders for select using (public.my_role() in ('super_admin','accounts','warehouse') or (vendor_id = public.my_vendor() and status not in ('Pending approval','Rejected')));
revoke insert, update, delete, truncate on public.release_orders from anon, authenticated;
revoke all on public.ro_seq from anon, authenticated;
create trigger audit_release_orders after insert or update on public.release_orders for each row execute function public.audit_row('id');
create table public.ro_events (
  id bigint generated always as identity primary key,
  ro_id text not null references public.release_orders(id) on delete cascade, at timestamptz not null default now(), actor uuid default auth.uid(), status text not null, note text
);
alter table public.ro_events enable row level security;
create policy ro_events_read on public.ro_events for select using (exists (select 1 from public.release_orders r where r.id = ro_id));
revoke insert, update, delete, truncate on public.ro_events from anon, authenticated;

create or replace function public.ro_event(rid text, st text, note text) returns void language sql security definer set search_path = public as $$
  insert into public.ro_events(ro_id, status, note) values (rid, st, note) $$;
revoke execute on function public.ro_event(text,text,text) from public, anon, authenticated;

create or replace function public.ro_approve_core(rid text, why text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders; v public.vendors; ps jsonb; lad jsonb; lvl jsonb; adv numeric; buf int; mail text;
begin
  select * into r from public.release_orders where id = rid for update;
  select * into v from public.vendors where id = r.vendor_id;
  if v.status <> 'Active' then raise exception 'Vendor % is not active', v.id; end if;
  select value into ps from public.settings where key = 'procurement';
  select value into lad from public.settings where key = 'credit_ladder';
  buf := coalesce((ps->>'lead_buffer')::int, 2);
  lvl := lad -> v.credit_level;
  if v.credit_level > 0 and lvl is not null and r.total <= (lvl->>'limit')::numeric then
    update public.release_orders set pay_mode = 'Credit', pay_status = 'On credit' where id = rid;
  else
    adv := round(r.total * coalesce((ps->>'advance_pct')::numeric, 100) / 100, 2);
    update public.release_orders set pay_mode = 'Advance', pay_status = 'Unpaid', pay_amount = adv where id = rid;
  end if;
  update public.release_orders set status = 'Approved', approved_by = auth.uid(), approved_at = now(), eta = current_date + lead_days + buf where id = rid;
  perform public.ro_event(rid, 'Approved', coalesce(why,'Approved'));
  if coalesce((ps->>'auto_email')::boolean, true) and v.email is not null then
    insert into public.email_outbox(to_email, subject, body) values (v.email, 'Release order ' || rid,
      'EarthLabs has issued release order ' || rid || ' for ' || r.qty || ' units. Please acknowledge it in the vendor portal. Material ships after payment is released, or on the agreed credit terms.');
  end if;
end $$;
revoke execute on function public.ro_approve_core(text,text) from public, anon, authenticated;

-- rate and lead time come from the database (approved vendor report first, planning rate second), never from the client
create or replace function public.raise_release_order(rm text, q numeric) returns text
language plpgsql security definer set search_path = public as $$
declare m public.raw_materials; rid text; rt numeric; ld int; ps jsonb; tot numeric;
begin
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can raise release orders'; end if;
  select * into m from public.raw_materials where id = rm and active;
  if m.id is null then raise exception 'Raw material not found'; end if;
  if m.vendor_id is null then raise exception 'No vendor is set for this material. Ask Super Admin to assign one'; end if;
  if not exists (select 1 from public.vendors where id = m.vendor_id and status = 'Active') then raise exception 'The vendor for this material is not active'; end if;
  rt := coalesce(m.v_rate, m.rate); ld := coalesce(m.v_lead, m.lead_days);
  if rt is null then raise exception 'No rate is known for this material. Record a planning rate or an approved vendor stock report first'; end if;
  insert into public.release_orders(vendor_id, rm_id, qty, rate, lead_days) values (m.vendor_id, rm, q, rt, ld) returning id, total into rid, tot;
  perform public.ro_event(rid, 'Pending approval', 'Raised');
  select value into ps from public.settings where key = 'procurement';
  if coalesce((ps->>'auto_limit')::numeric, 0) > 0 and tot <= (ps->>'auto_limit')::numeric then perform public.ro_approve_core(rid, 'Auto-approved under the limit'); end if;
  return rid;
end $$;
create or replace function public.approve_release_order(rid text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve release orders'; end if;
  select * into r from public.release_orders where id = rid for update;
  if r.id is null then raise exception 'Release order not found'; end if;
  if r.status <> 'Pending approval' then raise exception 'This release order is already %', r.status; end if;
  perform public.ro_approve_core(rid, 'Approved by Super Admin');
end $$;
create or replace function public.reject_release_order(rid text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin can reject release orders'; end if;
  if length(trim(coalesce(why,''))) < 3 then raise exception 'Give a reason for rejecting'; end if;
  update public.release_orders set status = 'Rejected', reject_reason = why where id = rid and status = 'Pending approval';
  if not found then raise exception 'Only a pending release order can be rejected'; end if;
  perform public.ro_event(rid, 'Rejected', why);
end $$;
create or replace function public.vendor_acknowledge_ro(rid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.release_orders set status = 'Acknowledged' where id = rid and vendor_id = public.my_vendor() and status = 'Approved';
  if not found then raise exception 'Nothing to acknowledge'; end if;
  perform public.ro_event(rid, 'Acknowledged', 'Acknowledged by vendor');
end $$;
-- Accounts releases the advance (UTR required, a UTR can be used once across all release orders)
create or replace function public.release_vendor_payment(rid text, u text, amt numeric) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can release vendor payments'; end if;
  select * into r from public.release_orders where id = rid for update;
  if r.id is null then raise exception 'Release order not found'; end if;
  if r.status not in ('Approved','Acknowledged') or r.pay_mode <> 'Advance' or r.pay_status <> 'Unpaid' then raise exception 'No advance is due on this release order'; end if;
  if length(trim(coalesce(u,''))) < 6 then raise exception 'Enter the UTR of the payment'; end if;
  if amt < r.pay_amount then raise exception 'The advance due is %', r.pay_amount; end if;
  begin
    update public.release_orders set pay_status = 'Paid', pay_utr = trim(u) where id = rid;
  exception when unique_violation then raise exception 'This UTR is already used for another vendor payment';
  end;
  perform public.ro_event(rid, r.status, 'Payment released (UTR ' || trim(u) || ')');
end $$;
-- the vendor can ship only when payment is released or the order is on approved credit
create or replace function public.vendor_dispatch_ro(rid text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders;
begin
  select * into r from public.release_orders where id = rid and vendor_id = public.my_vendor() and status not in ('Pending approval','Rejected') for update;
  if r.id is null then raise exception 'Release order not found'; end if;
  if r.status not in ('Approved','Acknowledged') then raise exception 'This release order cannot be dispatched (it is %)', r.status; end if;
  if r.pay_status not in ('Paid','On credit') then raise exception 'Payment has not been released yet. Dispatch after EarthLabs releases the payment'; end if;
  update public.release_orders set status = 'Dispatched' where id = rid;
  perform public.ro_event(rid, 'Dispatched', 'Dispatched by vendor');
end $$;
create or replace function public.receive_release_order(rid text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders;
begin
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can receive material'; end if;
  select * into r from public.release_orders where id = rid for update;
  if r.id is null then raise exception 'Release order not found'; end if;
  if r.status <> 'Dispatched' then raise exception 'Only a dispatched release order can be received (this one is %)', r.status; end if;
  update public.release_orders set status = 'Received', received_at = now(), actual_days = (current_date - approved_at::date) where id = rid;
  update public.raw_materials set on_hand = on_hand + r.qty where id = r.rm_id;
  insert into public.rm_moves(rm_id, delta, reason, ref) values (r.rm_id, r.qty, 'Received', rid);
  perform public.ro_event(rid, 'Received', 'Received at the plant');
end $$;

-- ============ 6) AI recommendations: stored by the service key only, decided by Super Admin only ============
create table public.ai_recommendations (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('reorder','lead_time','credit','scheme','promotion')),
  title text not null, reasons jsonb not null default '[]',
  target_kind text, target_id text, payload jsonb not null default '{}',
  status text not null default 'Pending' check (status in ('Pending','Approved','Dismissed')),
  model text, created_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, note text
);
create index ai_rec_status_idx on public.ai_recommendations(status, created_at desc);
alter table public.ai_recommendations enable row level security;
create policy ai_rec_read on public.ai_recommendations for select using (public.my_role() in ('super_admin','sales','accounts','warehouse'));
revoke insert, update, delete, truncate on public.ai_recommendations from anon, authenticated;
create trigger audit_ai_rec after insert or update on public.ai_recommendations for each row execute function public.audit_row('id');

create or replace function public.ai_store_recommendations(items jsonb, mdl text) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  if auth.uid() is not null then raise exception 'Reserved for the AI service'; end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into public.ai_recommendations(kind, title, reasons, target_kind, target_id, payload, model)
    values (it->>'kind', left(it->>'title', 300), coalesce(it->'reasons','[]'), it->>'target_kind', it->>'target_id', coalesce(it->'payload','{}'), mdl);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.ai_store_recommendations(jsonb,text) from public, anon, authenticated;

-- Super Admin decides. Approving performs the action through the same guarded paths a person would use.
create or replace function public.decide_ai_recommendation(rid bigint, approve boolean, why text) returns text
language plpgsql security definer set search_path = public as $$
declare a public.ai_recommendations; res text := 'Dismissed';
begin
  if not public.is_super() then raise exception 'AI recommends. Only Super Admin can approve'; end if;
  select * into a from public.ai_recommendations where id = rid for update;
  if a.id is null then raise exception 'Recommendation not found'; end if;
  if a.status <> 'Pending' then raise exception 'Already %', a.status; end if;
  if approve then
    res := 'Approved';
    if a.kind = 'credit' then
      perform public.apply_credit_level(a.target_kind, a.target_id, (a.payload->>'to_level')::int);
    elsif a.kind = 'reorder' then
      res := 'Approved: release order ' || public.raise_release_order(a.target_id, (a.payload->>'qty')::numeric) || ' raised';
    elsif a.kind = 'lead_time' then
      update public.raw_materials set lead_days = (a.payload->>'lead_days')::int where id = a.target_id;
    end if;
  end if;
  update public.ai_recommendations set status = case when approve then 'Approved' else 'Dismissed' end, decided_by = auth.uid(), decided_at = now(), note = why where id = rid;
  return res;
end $$;

-- facts for the AI Edge Function: ids and numbers only, no names, phones, e-mail or prices
create or replace function public.ai_facts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'ladder', (select value from public.settings where key = 'credit_ladder'),
    'pay_and_carry', (select value from public.settings where key = 'pay_and_carry'),
    'procurement', (select value from public.settings where key = 'procurement'),
    'raw_materials', coalesce((select jsonb_agg(jsonb_build_object('id',id,'unit',unit,'on_hand',on_hand,'reorder',reorder_level,'per_day',per_day,'lead_days',lead_days,'vendor_active', exists (select 1 from public.vendors v where v.id = vendor_id and v.status='Active'),
       'incoming', coalesce((select sum(qty) from public.release_orders r where r.rm_id = raw_materials.id and r.status in ('Approved','Acknowledged','Dispatched')),0),
       'avg_actual_days', (select round(avg(actual_days),1) from public.release_orders r where r.rm_id = raw_materials.id and r.status='Received'))) from public.raw_materials where active), '[]'),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id',id,'credit_level',credit_level,'balance', coalesce((select sum(debit-credit) from public.ledger_entries l where l.partner_id = partners.id),0),
       'orders_90d', (select count(*) from public.orders o where o.partner_id = partners.id and o.status <> 'Cancelled' and o.created_at > now() - interval '90 days'))) from public.partners where status='Active'), '[]'),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('id',id,'credit_level',credit_level,'received_orders',(select count(*) from public.release_orders r where r.vendor_id = vendors.id and r.status='Received'))) from public.vendors where status='Active'), '[]'));
end $$;
grant execute on function public.ai_facts() to authenticated;

-- ============ 7) Approvals centre: one queue for Super Admin ============
create or replace function public.approval_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin sees the approvals queue'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
    select jsonb_build_object('group','procurement','type','Release order','id',id,'title',qty || ' x ' || rm_id,'amount',total,'at',created_at,'flag', case when total > coalesce((select (value->>'ro_limit')::numeric from public.settings where key='procurement'),0) then 'Above approval limit' end) x from public.release_orders where status='Pending approval'
    union all select jsonb_build_object('group','procurement','type','Vendor stock report','id',id,'title',vendor_id,'at',created_at) from public.vendor_stock_reports where status='Pending approval'
    union all select jsonb_build_object('group','credit','type','Credit change','id',id::text,'title',entity_kind || ' ' || entity_id || ': level ' || from_level || ' to ' || to_level,'at',created_at,'source',source) from public.credit_proposals where status='Pending'
    union all select jsonb_build_object('group','ai','type','AI recommendation','id',id::text,'title',title,'at',created_at) from public.ai_recommendations where status='Pending'
    union all select jsonb_build_object('group','change','type','Change request','id',id::text,'title',summary,'at',created_at,'kind',kind) from public.change_requests where status='Pending'
    union all select jsonb_build_object('group','payments','type','Payment proof','id',id::text,'title',partner_id || ' ' || order_id,'amount',amount,'at',submitted_at) from public.payment_proofs where status='Submitted'
    union all select jsonb_build_object('group','orders','type','Order','id',id,'title',partner_id,'amount',total,'at',created_at) from public.orders where status='Pending Approval'
  ) q), '[]');
end $$;
grant execute on function public.approval_queue() to authenticated;

-- ============ grants: users call functions, never write tables ============
grant execute on function
  public.create_vendor(text,text,text,text,text,text), public.set_vendor_status(text,text), public.upsert_raw_material(text,text,text,text,numeric,numeric,int,numeric),
  public.adjust_raw_material(text,numeric,text), public.submit_vendor_stock_report(jsonb), public.decide_vendor_stock_report(text,boolean,text),
  public.propose_credit_change(text,text,int,text), public.decide_credit_change(bigint,boolean,text),
  public.raise_release_order(text,numeric), public.approve_release_order(text), public.reject_release_order(text,text), public.vendor_acknowledge_ro(text),
  public.release_vendor_payment(text,text,numeric), public.vendor_dispatch_ro(text), public.receive_release_order(text), public.decide_ai_recommendation(bigint,boolean,text)
  to authenticated;
-- default privileges grant execute to anon/authenticated on every function; close the internal ones explicitly
revoke execute on function public.ro_approve_core(text,text), public.ro_event(text,text,text), public.insert_credit_proposal(text,text,int,text,text,uuid),
  public.apply_credit_level(text,text,int), public.ai_propose_credit(text,text,int,text), public.ai_store_recommendations(jsonb,text) from anon, authenticated;
revoke execute on function public.create_vendor(text,text,text,text,text,text), public.set_vendor_status(text,text), public.upsert_raw_material(text,text,text,text,numeric,numeric,int,numeric),
  public.adjust_raw_material(text,numeric,text), public.submit_vendor_stock_report(jsonb), public.decide_vendor_stock_report(text,boolean,text),
  public.propose_credit_change(text,text,int,text), public.decide_credit_change(bigint,boolean,text),
  public.raise_release_order(text,numeric), public.approve_release_order(text), public.reject_release_order(text,text), public.vendor_acknowledge_ro(text),
  public.release_vendor_payment(text,text,numeric), public.vendor_dispatch_ro(text), public.receive_release_order(text), public.decide_ai_recommendation(bigint,boolean,text),
  public.approval_queue(), public.ai_facts() from anon;
