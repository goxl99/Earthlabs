-- EPDMS 016 (build 9): module on/off switches, distributor "My network", vendor RFQs and quotes, awarding a quote creates a
-- purchase order (a release order, so the same payment gate applies), vendor performance scoring, BOM-based material planning,
-- computed inputs for partner scoring, WhatsApp outbox. No real prices or partner data: everything is entered at run time.

-- ============ 1) Module switches ============
-- Settings key 'modules' = {"<module>": false} for every module that is switched OFF. Missing key = on.
insert into public.settings(key,value) values ('modules','{}') on conflict (key) do nothing;
create or replace function public.module_enabled(k text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> k)::boolean from public.settings where key = 'modules'), true) $$;
create or replace function public.my_modules() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'modules'), '{}'::jsonb) $$;
create or replace function public.set_module(k text, on_ boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin can switch modules'; end if;
  if k in ('dashboard','users','audit','approvals','notifications') then raise exception 'Module % is core and cannot be switched off', k; end if;
  if k not in ('applications','partners','territory','agreements','catalogue','schemes','inventory','invoices','vendors','procurement','performance','reports','credit','ai','orders','rfq','network','bom') then
    raise exception 'Unknown module %', k; end if;
  insert into public.settings(key,value) values ('modules', jsonb_build_object(k, on_))
    on conflict (key) do update set value = public.settings.value || jsonb_build_object(k, on_);
end $$;
create or replace function public.module_guard(k text) returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.module_enabled(k) then raise exception 'The % module is switched off by Super Admin', k; end if; end $$;

-- ============ 2) My network (distributor sees own dealers) ============
alter table public.partners add column if not exists parent_id text references public.partners(id);
create index if not exists partners_parent_idx on public.partners(parent_id);
create or replace function public.set_partner_parent(pid text, parent text) returns void language plpgsql security definer set search_path = public as $$
declare c public.partners; p public.partners; cl int; pl int;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can link a partner to a distributor'; end if;
  select * into c from public.partners where id = pid; if c.id is null then raise exception 'Partner not found'; end if;
  if parent is null then update public.partners set parent_id = null where id = pid; return; end if;
  select * into p from public.partners where id = parent; if p.id is null then raise exception 'Parent partner not found'; end if;
  if p.id = c.id then raise exception 'A partner cannot be its own parent'; end if;
  select level into cl from public.partner_types where code = c.type_code;
  select level into pl from public.partner_types where code = p.type_code;
  if pl <= cl then raise exception 'The parent must be a higher level than the partner'; end if;
  update public.partners set parent_id = parent where id = pid;
end $$;
-- limited view for the parent: no GSTIN, credit level or contact details
create or replace function public.my_network() returns table(id text, name text, type_code text, district text, status text, orders_90d int, billed_90d numeric, last_score numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.type_code, p.district, p.status,
         (select count(*)::int from public.orders o where o.partner_id = p.id and o.created_at > now() - interval '90 days' and o.status <> 'Cancelled'),
         coalesce((select sum(o.total) from public.orders o where o.partner_id = p.id and o.created_at > now() - interval '90 days' and o.status not in ('Cancelled','Pending Approval')), 0),
         (select s.score from public.partner_scores s where s.partner_id = p.id order by s.month desc limit 1)
  from public.partners p
  where p.parent_id = public.my_partner() and public.module_enabled('network')
  order by p.name $$;

-- ============ 3) RFQs, quotes, purchase orders ============
create sequence public.rfq_seq;
create table public.rfqs (
  id text primary key default ('RFQ-' || to_char(current_date,'YYMM') || '-' || lpad(nextval('public.rfq_seq')::text, 4, '0')),
  rm_id text not null references public.raw_materials(id),
  qty numeric(14,3) not null check (qty > 0),
  needed_by date, note text,
  status text not null default 'Open' check (status in ('Open','Awarded','Closed')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table public.rfq_invites (rfq_id text not null references public.rfqs(id) on delete cascade, vendor_id text not null references public.vendors(id), primary key (rfq_id, vendor_id));
create table public.quotes (
  id bigint generated always as identity primary key,
  rfq_id text not null references public.rfqs(id), vendor_id text not null references public.vendors(id),
  rate numeric(12,2) not null check (rate > 0), lead_days int not null check (lead_days >= 0), valid_until date,
  status text not null default 'Submitted' check (status in ('Submitted','Accepted','Rejected')),
  created_at timestamptz not null default now(),
  unique (rfq_id, vendor_id)
);
create index rfq_invites_vendor_idx on public.rfq_invites(vendor_id);
create index quotes_vendor_idx on public.quotes(vendor_id);
create index rfqs_rm_idx on public.rfqs(rm_id);
alter table public.rfqs enable row level security; alter table public.rfq_invites enable row level security; alter table public.quotes enable row level security;
-- vendors see only RFQs they were invited to, and only their own quote (never a competitor's rate)
create policy rfqs_read on public.rfqs for select using ((select public.my_role()) in ('super_admin','accounts','warehouse') or exists (select 1 from public.rfq_invites i where i.rfq_id = id and i.vendor_id = (select public.my_vendor())));
create policy rfq_invites_read on public.rfq_invites for select using ((select public.my_role()) in ('super_admin','accounts','warehouse') or vendor_id = (select public.my_vendor()));
create policy quotes_read on public.quotes for select using ((select public.my_role()) in ('super_admin','accounts','warehouse') or vendor_id = (select public.my_vendor()));
revoke insert, update, delete, truncate on public.rfqs, public.rfq_invites, public.quotes from anon, authenticated;
revoke all on public.rfqs, public.rfq_invites, public.quotes from anon;
revoke all on public.rfq_seq from anon, authenticated;
create trigger audit_rfqs after insert or update on public.rfqs for each row execute function public.audit_row('id');
create trigger audit_quotes after insert or update on public.quotes for each row execute function public.audit_row('id');

create or replace function public.create_rfq(rm text, q numeric, needed date, vendors text[], note_ text) returns text
language plpgsql security definer set search_path = public as $$
declare rid text; v text; vv public.vendors;
begin
  perform public.module_guard('rfq');
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can raise an RFQ'; end if;
  if not exists (select 1 from public.raw_materials where id = rm and active) then raise exception 'Raw material not found'; end if;
  if vendors is null or array_length(vendors,1) is null then raise exception 'Pick at least one vendor'; end if;
  insert into public.rfqs(rm_id, qty, needed_by, note) values (rm, q, needed, note_) returning id into rid;
  foreach v in array vendors loop
    select * into vv from public.vendors where id = v;
    if vv.id is null or vv.status <> 'Active' then raise exception 'Vendor % is not active', v; end if;
    insert into public.rfq_invites(rfq_id, vendor_id) values (rid, v) on conflict do nothing;
    if vv.email is not null then insert into public.email_outbox(to_email, subject, body) values (vv.email, 'Request for quotation ' || rid,
      'EarthLabs invites your quotation for ' || q || ' units of ' || rm || '. Please submit your rate and lead time in the vendor portal.'); end if;
  end loop;
  return rid;
end $$;
create or replace function public.close_rfq(rid text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can close an RFQ'; end if;
  update public.rfqs set status = 'Closed' where id = rid and status = 'Open';
  if not found then raise exception 'RFQ is not open'; end if;
end $$;
create or replace function public.submit_quote(rid text, rt numeric, ld int, valid date) returns void
language plpgsql security definer set search_path = public as $$
declare v text := public.my_vendor();
begin
  perform public.module_guard('rfq');
  if v is null then raise exception 'Only a vendor can submit a quote'; end if;
  if not exists (select 1 from public.rfq_invites where rfq_id = rid and vendor_id = v) then raise exception 'You were not invited to this RFQ'; end if;
  if not exists (select 1 from public.rfqs where id = rid and status = 'Open') then raise exception 'This RFQ is closed'; end if;
  if valid is not null and valid < current_date then raise exception 'Validity date is in the past'; end if;
  insert into public.quotes(rfq_id, vendor_id, rate, lead_days, valid_until) values (rid, v, rt, ld, valid)
    on conflict (rfq_id, vendor_id) do update set rate = excluded.rate, lead_days = excluded.lead_days, valid_until = excluded.valid_until, created_at = now()
    where public.quotes.status = 'Submitted';
end $$;
-- Awarding is a commercial decision: Super Admin only. It creates a release order (the purchase order), which goes through the same approval and payment gate.
create or replace function public.award_quote(qid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare q public.quotes; r public.rfqs; rid text; tot numeric; ps jsonb;
begin
  if not public.is_super() then raise exception 'Only Super Admin can award a quote'; end if;
  select * into q from public.quotes where id = qid for update; if q.id is null then raise exception 'Quote not found'; end if;
  select * into r from public.rfqs where id = q.rfq_id for update;
  if r.status <> 'Open' then raise exception 'RFQ is not open'; end if;
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'This quote has expired'; end if;
  if not exists (select 1 from public.vendors where id = q.vendor_id and status = 'Active') then raise exception 'The vendor is not active'; end if;
  update public.quotes set status = case when id = qid then 'Accepted' else 'Rejected' end where rfq_id = r.id;
  update public.rfqs set status = 'Awarded' where id = r.id;
  insert into public.release_orders(vendor_id, rm_id, qty, rate, lead_days) values (q.vendor_id, r.rm_id, r.qty, q.rate, q.lead_days) returning id, total into rid, tot;
  perform public.ro_event(rid, 'Pending approval', 'Raised from ' || r.id || ' quote ' || qid);
  select value into ps from public.settings where key = 'procurement';
  if coalesce((ps->>'auto_limit')::numeric, 0) > 0 and tot <= (ps->>'auto_limit')::numeric then perform public.ro_approve_core(rid, 'Auto-approved under the limit'); end if;
  return rid;
end $$;

-- ============ 4) Vendor performance ============
-- on-time = received within promised lead days (+ buffer); fill = received share of orders that were approved; response = quotes sent per invite.
create or replace function public.vendor_scorecard(vid text default null)
returns table(vendor_id text, name text, orders int, received int, on_time_pct numeric, fill_pct numeric, response_pct numeric, score numeric)
language sql stable security definer set search_path = public as $$
  with scope as (select v.id, v.name from public.vendors v
                  where (public.my_role() in ('super_admin','accounts','warehouse') and (vid is null or v.id = vid)) or v.id = public.my_vendor()),
  ro as (select r.vendor_id, count(*) filter (where r.status not in ('Pending approval','Rejected','Cancelled'))::int as orders,
                count(*) filter (where r.status = 'Received')::int as received,
                count(*) filter (where r.status = 'Received' and r.actual_days <= r.lead_days + 2)::int as on_time
           from public.release_orders r group by r.vendor_id),
  rq as (select i.vendor_id, count(*)::int as invites, count(q.id)::int as quoted
           from public.rfq_invites i left join public.quotes q on q.rfq_id = i.rfq_id and q.vendor_id = i.vendor_id group by i.vendor_id)
  select s.id, s.name, coalesce(ro.orders,0), coalesce(ro.received,0),
         case when coalesce(ro.received,0) = 0 then null else round(100.0 * ro.on_time / ro.received, 1) end,
         case when coalesce(ro.orders,0) = 0 then null else round(100.0 * ro.received / ro.orders, 1) end,
         case when coalesce(rq.invites,0) = 0 then null else round(100.0 * rq.quoted / rq.invites, 1) end,
         -- weights 60/25/15, over the parts that have data (missing parts are left out, never counted as zero)
         (select case when sum(w) = 0 then null else round(sum(v * w) / sum(w), 1) end
            from (values (case when coalesce(ro.received,0) = 0 then null else 100.0 * ro.on_time / ro.received end, 60.0),
                         (case when coalesce(ro.orders,0) = 0 then null else 100.0 * ro.received / ro.orders end, 25.0),
                         (case when coalesce(rq.invites,0) = 0 then null else 100.0 * rq.quoted / rq.invites end, 15.0)) t(v, w) where v is not null)
  from scope s left join ro on ro.vendor_id = s.id left join rq on rq.vendor_id = s.id
  order by s.name $$;

-- ============ 5) BOM and material planning ============
create table public.bom (
  sku text not null references public.skus(sku), rm_id text not null references public.raw_materials(id),
  qty_per_unit numeric(14,4) not null check (qty_per_unit > 0), primary key (sku, rm_id)
);
create index bom_rm_idx on public.bom(rm_id);
alter table public.bom enable row level security;
create policy bom_read on public.bom for select using ((select public.my_role()) in ('super_admin','accounts','warehouse'));
revoke insert, update, delete, truncate on public.bom from anon, authenticated;
revoke all on public.bom from anon;
create trigger audit_bom after insert or update or delete on public.bom for each row execute function public.audit_row('sku');
create or replace function public.set_bom(s text, rm text, q numeric) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.module_guard('bom');
  if not public.is_procurement() then raise exception 'Only Warehouse or Super Admin can edit the bill of materials'; end if;
  if q is null or q <= 0 then delete from public.bom where sku = s and rm_id = rm; return; end if;
  insert into public.bom(sku, rm_id, qty_per_unit) values (s, rm, q) on conflict (sku, rm_id) do update set qty_per_unit = excluded.qty_per_unit;
end $$;
-- plan = [{"sku":"...","units":123}, ...] -> what to buy, with lead time and the date to order by
create or replace function public.plan_materials(plan jsonb, need_by date default null)
returns table(rm_id text, name text, unit text, needed numeric, on_hand numeric, shortfall numeric, lead_days int, order_by date, vendor_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.module_guard('bom');
  if not public.is_procurement() and public.my_role() not in ('accounts') then raise exception 'Not allowed'; end if;
  if jsonb_typeof(plan) <> 'array' or jsonb_array_length(plan) > 200 then raise exception 'Plan must be a list of at most 200 lines'; end if;
  return query
  with req as (
    select b.rm_id, sum(b.qty_per_unit * (e->>'units')::numeric) as needed
    from jsonb_array_elements(plan) e join public.bom b on b.sku = e->>'sku' group by b.rm_id)
  select m.id, m.name, m.unit, round(r.needed, 3), m.on_hand, round(greatest(r.needed - m.on_hand, 0), 3), coalesce(m.v_lead, m.lead_days),
         case when need_by is null then null else need_by - coalesce(m.v_lead, m.lead_days) end, m.vendor_id
  from req r join public.raw_materials m on m.id = r.rm_id order by m.id;
end $$;

-- ============ 6) Computed inputs for partner scoring (staff review, then record_partner_score) ============
-- Only the parameters the system can verify are filled; the rest stay null (unverified, kept out of the score).
-- index: 0 target, 1 network development, 2 payment discipline, 3 secondary sales, 4 new customers, 5 repeat orders, 6 inventory discipline, 7 compliance
create or replace function public.suggest_score_inputs(pid text, m date default current_date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.partners; a jsonb := jsonb_build_array(null,null,null,null,null,null,null,null);
        d0 date := date_trunc('month', m)::date; d1 date := (date_trunc('month', m) + interval '1 month')::date;
        inv numeric; pay numeric; kids int; kids_act int; months_with int;
begin
  if public.my_role() not in ('super_admin','sales','accounts') then raise exception 'Not allowed'; end if;
  select * into p from public.partners where id = pid; if p.id is null then raise exception 'Partner not found'; end if;
  -- payment discipline: payments received over invoices raised in the 90 days to month end (capped at 1)
  select coalesce(sum(debit),0), coalesce(sum(credit) filter (where kind = 'payment'),0) into inv, pay
    from public.ledger_entries where partner_id = pid and at >= d1 - interval '90 days' and at < d1;
  if inv > 0 then a := jsonb_set(a, '{2}', to_jsonb(round(least(pay / inv, 1), 3))); end if;
  -- repeat orders: months with a non-cancelled order, out of the last 3 months
  select count(distinct date_trunc('month', created_at)) into months_with from public.orders
   where partner_id = pid and status <> 'Cancelled' and created_at >= d1 - interval '3 months' and created_at < d1;
  if exists (select 1 from public.orders where partner_id = pid) then a := jsonb_set(a, '{5}', to_jsonb(round(months_with / 3.0, 3))); end if;
  -- network development: share of linked partners that ordered this month (only where partners are linked to this one)
  select count(*), count(*) filter (where exists (select 1 from public.orders o where o.partner_id = k.id and o.status <> 'Cancelled' and o.created_at >= d0 and o.created_at < d1))
    into kids, kids_act from public.partners k where k.parent_id = pid and k.status = 'Active';
  if kids > 0 then a := jsonb_set(a, '{1}', to_jsonb(round(kids_act::numeric / kids, 3))); end if;
  return a;
end $$;

-- ============ 7) WhatsApp outbox (hook only: delivery is the send-whatsapp Edge Function; switched off until Super Admin enables it) ============
insert into public.settings(key,value) values ('whatsapp','{"enabled":false}') on conflict (key) do nothing;
create table public.whatsapp_outbox (
  id bigint generated always as identity primary key,
  to_phone text not null check (to_phone ~ '^[0-9]{11,15}$'), body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')), attempts int not null default 0,
  created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.whatsapp_outbox enable row level security;   -- no policy: only the service key reads or writes
revoke all on public.whatsapp_outbox from anon, authenticated;
create index whatsapp_outbox_queue_idx on public.whatsapp_outbox(created_at) where status = 'queued';
create or replace function public.notify_partner(pid text, ttl text, msg text, lnk text) returns void
language plpgsql security definer set search_path = public as $$
declare mail text; ph text; wa jsonb;
begin
  insert into public.notifications(user_id,title,body,link) select id, ttl, msg, lnk from public.profiles where partner_id = pid and active;
  select email, regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') into mail, ph from public.partners where id = pid;
  if mail is not null then insert into public.email_outbox(to_email,subject,body) values (mail, ttl, msg); end if;
  select value into wa from public.settings where key = 'whatsapp';
  if coalesce((wa->>'enabled')::boolean, false) and ph is not null then
    if length(ph) = 10 then ph := '91' || ph; end if;
    if ph ~ '^[0-9]{11,15}$' then insert into public.whatsapp_outbox(to_phone, body) values (ph, left(ttl || ': ' || msg, 900)); end if;
  end if;
end $$;
revoke execute on function public.notify_partner(text,text,text,text) from public, anon, authenticated;

-- ============ 8) Grants: only signed-in users may call the app's actions (each checks the role inside) ============
revoke execute on function public.module_enabled(text), public.my_modules(), public.set_module(text,boolean), public.module_guard(text),
  public.set_partner_parent(text,text), public.my_network(), public.create_rfq(text,numeric,date,text[],text), public.close_rfq(text),
  public.submit_quote(text,numeric,int,date), public.award_quote(bigint), public.vendor_scorecard(text), public.set_bom(text,text,numeric),
  public.plan_materials(jsonb,date), public.suggest_score_inputs(text,date) from public, anon;
grant execute on function public.module_enabled(text), public.my_modules(), public.set_module(text,boolean),
  public.set_partner_parent(text,text), public.my_network(), public.create_rfq(text,numeric,date,text[],text), public.close_rfq(text),
  public.submit_quote(text,numeric,int,date), public.award_quote(bigint), public.vendor_scorecard(text), public.set_bom(text,text,numeric),
  public.plan_materials(jsonb,date), public.suggest_score_inputs(text,date) to authenticated;
revoke execute on function public.module_guard(text) from authenticated;
