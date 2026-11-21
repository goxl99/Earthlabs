-- EPDMS 008 (build 3): SKU lifecycle and price lists, scheme engine and disclosure, order workflow with payment gate,
-- stock reservations, dispatch notes, stock movements, dashboard numbers.

-- ============ 1) Catalogue rules ============
-- stock quantities change only through the logged functions (adjust_stock, order workflow); only the reorder level is editable directly
revoke insert, update, delete, truncate on public.stock from anon, authenticated;
grant update (reorder_level) on public.stock to authenticated;

-- every SKU has a stock row from the moment it exists
create or replace function public.sku_stock_row() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.stock(sku) values (new.sku) on conflict do nothing; return new; end $$;
create trigger sku_stock_row_t after insert on public.skus for each row execute function public.sku_stock_row();
insert into public.stock(sku) select sku from public.skus on conflict do nothing;

-- a SKU may go live only when a margin exists for every open partner type (otherwise a partner would see the full MRP-based price)
-- a retired SKU can be restored but never goes back to draft; only draft SKUs can be deleted
create or replace function public.skus_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare missing text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only a draft SKU can be deleted. Retire it instead'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'retired' and new.status = 'draft' then raise exception 'A retired SKU cannot go back to draft. Restore it to active'; end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    select string_agg(t.code, ', ') into missing from public.partner_types t
     where t.registration_open
       and not exists (select 1 from public.sku_margins m where m.sku = new.sku and m.type_code = t.code)
       and not exists (select 1 from public.margin_slabs d where d.type_code = t.code and d.slab = new.slab);
    if missing is not null then raise exception 'Set a margin for % before making this SKU active', missing; end if;
  end if;
  return new;
end $$;
create trigger skus_guard_t before insert or update or delete on public.skus for each row execute function public.skus_guard();

-- Super Admin changes lifecycle through one call (reason is kept in the audit trail through the change request or note)
create or replace function public.set_sku_status(s text, st text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin controls products'; end if;
  if st not in ('active','retired') then raise exception 'Status must be active or retired'; end if;
  update public.skus set status = st where sku = s;
  if not found then raise exception 'SKU not found'; end if;
end $$;
revoke execute on function public.set_sku_status(text,text) from public, anon;
grant execute on function public.set_sku_status(text,text) to authenticated;

-- staff price list: MRP, margin and price for each partner type and SKU (commercial, staff only)
create or replace function public.price_list()
returns table(sku text, name text, category text, mrp numeric, status text, type_code text, margin_pct numeric, price numeric)
language sql stable security definer set search_path = public as $$
  select k.sku, k.name, k.category, k.mrp, k.status, t.code,
         coalesce(m.margin_pct, d.margin_pct, 0),
         round(k.mrp / 1.18 * (1 - coalesce(m.margin_pct, d.margin_pct, 0) / 100.0), 4)
  from public.skus k cross join public.partner_types t
  left join public.sku_margins m on m.sku = k.sku and m.type_code = t.code
  left join public.margin_slabs d on d.type_code = t.code and d.slab = k.slab
  where public.is_staff() and t.code <> 'INS' and coalesce(m.margin_pct, d.margin_pct) is not null   -- only types that have a margin set
  order by k.sku, t.level
$$;
grant execute on function public.price_list() to authenticated;

-- partner price list: only SKUs visible to this partner, only the partner's own price, no margin
create or replace function public.my_price_list()
returns table(sku text, name text, category text, pack_size int, unit text, moq int, mrp numeric, price numeric)
language sql stable security definer set search_path = public as $$
  select k.sku, k.name, k.category, k.pack_size, k.unit, k.moq, k.mrp, public.unit_price(public.my_partner(), k.sku)
  from public.skus k where public.my_partner() is not null and public.sku_visible(k.sku) order by k.sku
$$;
grant execute on function public.my_price_list() to authenticated;

-- ============ 2) Scheme engine and disclosure ============
create table public.scheme_usage (
  id bigint generated always as identity primary key,
  scheme_id text not null references public.schemes(id),
  order_id text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index scheme_usage_scheme_idx on public.scheme_usage(scheme_id);
alter table public.scheme_usage enable row level security;
create policy scheme_usage_read on public.scheme_usage for select using (public.is_staff());
revoke insert, update, delete, truncate on public.scheme_usage from anon, authenticated;

create or replace function public.scheme_used(sid text) returns numeric
language sql stable security definer set search_path = public as $$ select coalesce(sum(amount),0) from public.scheme_usage where scheme_id = sid $$;
revoke execute on function public.scheme_used(text) from public, anon, authenticated;

-- scheme rules checked on every change: sane values, percent cap, free-carton fields
create or replace function public.schemes_guard() returns trigger language plpgsql as $$
begin
  if new.kind in ('pct','flat') and new.value <= 0 then raise exception 'Enter the scheme value'; end if;
  if new.kind = 'pct' and new.value > 25 then raise exception 'A percent scheme above 25 needs a second look. Lower it'; end if;
  if new.kind = 'free' and (coalesce(new.buy,0) <= 0 or coalesce(new.get,0) <= 0) then raise exception 'Enter buy and free cartons'; end if;
  if new.disclosed and not new.active then raise exception 'Only an active scheme can be disclosed'; end if;
  if new.audience_mode = 'types' and cardinality(new.audience_types) = 0 then raise exception 'Choose at least one partner type'; end if;
  if new.audience_mode = 'partners' and cardinality(new.audience_partners) = 0 then raise exception 'Choose at least one partner'; end if;
  return new;
end $$;
create trigger schemes_guard_t before insert or update on public.schemes for each row execute function public.schemes_guard();

-- show or hide a scheme: Super Admin, or a role Super Admin has allowed in settings.scheme_disclosers
create or replace function public.disclose_scheme(sid text, show boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.app_role := public.my_role();
begin
  if r is null then raise exception 'Not allowed'; end if;
  if not (r = 'super_admin' or (r in ('sales','accounts','warehouse') and (select value from public.settings where key = 'scheme_disclosers') ? r::text)) then
    raise exception 'You are not allowed to disclose schemes';
  end if;
  update public.schemes set disclosed = show where id = sid;
  if not found then raise exception 'Scheme not found'; end if;
end $$;
revoke execute on function public.disclose_scheme(text,boolean) from public, anon;
grant execute on function public.disclose_scheme(text,boolean) to authenticated;

-- does this live scheme apply to partner pid today
create or replace function public.scheme_applies(s public.schemes, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select s.active and s.disclosed and current_date between s.valid_from and s.valid_to and (
    s.audience_mode = 'all'
    or (s.audience_mode = 'types' and (select type_code from public.partners where id = pid) = any (s.audience_types))
    or (s.audience_mode = 'partners' and pid = any (s.audience_partners)))
$$;
revoke execute on function public.scheme_applies(public.schemes, text) from public, anon, authenticated;

create or replace function public.sku_visible_for(pid text, s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.skus k where k.sku = s and k.status = 'active'
         and (not k.restricted or exists (select 1 from public.sku_access a where a.sku = k.sku and a.partner_id = pid)))
$$;
revoke execute on function public.sku_visible_for(text,text) from public, anon, authenticated;

-- The price engine. items = [{"sku":"S1","cartons":10}, ...]. Prices come from the database only.
-- Stackable schemes all apply; among non-stackable schemes only the best one applies; budget caps stop a scheme when exhausted.
create or replace function public.order_calc(pid text, items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r record; s public.schemes; lines jsonb := '[]'; taxable numeric := 0; first_ boolean; ptype text;
  c_el int; v_el numeric; amt numeric; applied jsonb := '[]'; hints jsonb := '[]'; stack_sum numeric := 0; best_ns numeric := 0; best_ns_j jsonb;
  disc numeric; net numeric; gst numeric; cand jsonb; ben text;
begin
  select type_code into ptype from public.partners where id = pid;
  if ptype is null then raise exception 'Partner not found'; end if;
  first_ := not exists (select 1 from public.orders where partner_id = pid and status <> 'Cancelled');
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'Add at least one product'; end if;
  for r in select x.sku, sum(x.cartons)::int as cartons from jsonb_to_recordset(items) as x(sku text, cartons int) group by x.sku loop
    if r.cartons is null or r.cartons <= 0 then raise exception 'Cartons must be at least 1'; end if;
    if not public.sku_visible_for(pid, r.sku) then raise exception 'Product % is not available for you', r.sku; end if;
    declare k public.skus; u numeric; begin
      select * into k from public.skus where sku = r.sku;
      if r.cartons < k.moq then raise exception 'Minimum for % is % cartons', k.name, k.moq; end if;
      u := public.unit_price(pid, r.sku);
      amt := round(r.cartons * k.pack_size * u, 2);
      taxable := taxable + amt;
      lines := lines || jsonb_build_object('sku', k.sku, 'name', k.name, 'cartons', r.cartons, 'pack', k.pack_size, 'units', r.cartons * k.pack_size, 'unit', u, 'amt', amt);
    end;
  end loop;

  for s in select * from public.schemes where active and disclosed and current_date between valid_from and valid_to order by id loop
    if not public.scheme_applies(s, pid) then continue; end if;
    if s.first_order_only and not first_ then continue; end if;
    select coalesce(sum((l->>'cartons')::int),0), coalesce(sum((l->>'amt')::numeric),0) into c_el, v_el
      from jsonb_array_elements(lines) l where s.skus is null or (l->>'sku') = any (s.skus);
    if c_el = 0 then continue; end if;
    ben := case s.kind when 'pct' then s.value || '% off' when 'flat' then 'Rs ' || s.value || ' off the order'
                       when 'free' then s.get || ' free carton per ' || s.buy || ' bought' else 'Free brand kit' end;
    if c_el < s.min_cartons then hints := hints || to_jsonb('Add ' || (s.min_cartons - c_el) || ' more carton(s) to unlock ' || s.name || ' (' || ben || ')'); continue; end if;
    if v_el * 1.18 < s.min_value then hints := hints || to_jsonb('Add Rs ' || round(s.min_value - v_el * 1.18) || ' more to unlock ' || s.name || ' (' || ben || ')'); continue; end if;
    amt := case s.kind
      when 'pct' then v_el * s.value / 100
      when 'flat' then least(s.value, v_el)
      when 'free' then (select coalesce(sum(floor((l->>'cartons')::int / s.buy) * s.get * (l->>'pack')::int * (l->>'unit')::numeric),0)
                          from jsonb_array_elements(lines) l where s.skus is null or (l->>'sku') = any (s.skus))
      else 0 end;
    amt := round(amt, 2);
    if s.kind <> 'kit' and amt <= 0 then continue; end if;
    if s.budget > 0 and public.scheme_used(s.id) + amt > s.budget then continue; end if;
    cand := jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'amt', amt, 'stackable', s.stackable);
    if s.stackable then applied := applied || cand; stack_sum := stack_sum + amt;
    elsif amt >= best_ns then best_ns := amt; best_ns_j := cand; end if;
  end loop;
  if best_ns_j is not null then applied := applied || best_ns_j; end if;
  disc := least(stack_sum + best_ns, taxable);
  net := taxable - disc; gst := round(net * 0.18, 2);
  return jsonb_build_object('lines', lines, 'taxable', taxable, 'discount', disc, 'net', net, 'gst', gst, 'total', net + gst,
                            'applied', applied, 'hints', hints, 'first_order', first_);
end $$;
revoke execute on function public.order_calc(text, jsonb) from public, anon, authenticated;

-- what the partner sees while building an order: own prices, applied schemes, hints, lead-time estimate
create or replace function public.quote_order(items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid text := public.my_partner(); q jsonb; lt jsonb; short int := 0; days int; st text;
begin
  if pid is null then raise exception 'Only partners can quote orders'; end if;
  q := public.order_calc(pid, items);
  select value into lt from public.settings where key = 'lead_time';
  select coalesce(sum(greatest((l->>'cartons')::int - greatest(coalesce(s.available,0) - coalesce(s.reserved,0), 0), 0)),0)::int into short
    from jsonb_array_elements(q->'lines') l left join public.stock s on s.sku = l->>'sku';
  select state into st from public.partners where id = pid;
  days := (lt->>'confirm')::int + (lt->>'dispatch')::int + case when short > 0 then (lt->>'make')::int else 0 end
        + case when st = 'Gujarat' then (lt->>'transit_in')::int else (lt->>'transit_out')::int end;
  return q || jsonb_build_object('short_cartons', short, 'lead_days', days, 'show_lead', coalesce((lt->>'show')::boolean, true));
end $$;
grant execute on function public.quote_order(jsonb) to authenticated;

-- ============ 3) Orders: workflow with payment gate ============
create sequence public.order_seq;
create table public.orders (
  id text primary key default ('ORD-' || lpad(nextval('public.order_seq')::text, 6, '0')),
  partner_id text not null references public.partners(id),
  status text not null default 'Pending Approval' check (status in ('Pending Approval','Approved','Payment Confirmed','Dispatched','Delivered','On hold','Cancelled')),
  prev_status text,
  taxable numeric(12,2) not null, discount numeric(12,2) not null default 0, net numeric(12,2) not null, gst numeric(12,2) not null, total numeric(12,2) not null,
  applied jsonb not null default '[]',
  lead_days int, eta_from date, eta_to date,
  hold_reason text, cancel_reason text,
  placed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index orders_partner_idx on public.orders(partner_id, created_at desc);
create index orders_status_idx on public.orders(status, created_at desc);
create table public.order_lines (
  order_id text not null references public.orders(id) on delete cascade,
  sku text not null references public.skus(sku),
  cartons int not null check (cartons > 0),
  units int not null, unit_price numeric(12,4) not null, amount numeric(12,2) not null,
  reserved_cartons int not null default 0, short_cartons int not null default 0,
  primary key (order_id, sku)
);
create index order_lines_sku_idx on public.order_lines(sku);
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  at timestamptz not null default now(), actor uuid default auth.uid(), status text not null, note text
);
create index order_events_idx on public.order_events(order_id, at);
create table public.order_payments (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id),
  utr text not null check (length(trim(utr)) >= 6), amount numeric(12,2) not null check (amount > 0),
  confirmed_by uuid default auth.uid(), confirmed_at timestamptz not null default now()
);
create unique index order_payments_utr_idx on public.order_payments(lower(trim(utr)));   -- one UTR can pay only once
create index order_payments_order_idx on public.order_payments(order_id);
create table public.dispatch_notes (
  id bigint generated always as identity primary key,
  order_id text not null unique references public.orders(id),
  vehicle text, lr_no text, batch_ref text,
  dispatched_by uuid default auth.uid(), dispatched_at timestamptz not null default now()
);
create table public.stock_moves (
  id bigint generated always as identity primary key,
  sku text not null references public.skus(sku), delta int not null, reason text not null,
  order_id text, by_user uuid default auth.uid(), at timestamptz not null default now()
);
create index stock_moves_sku_idx on public.stock_moves(sku, at desc);

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.order_payments enable row level security;
alter table public.dispatch_notes enable row level security;
alter table public.stock_moves enable row level security;
create policy orders_read on public.orders for select using (public.is_staff() or partner_id = public.my_partner());
create policy lines_read on public.order_lines for select using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.partner_id = public.my_partner())));
create policy events_read on public.order_events for select using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.partner_id = public.my_partner())));
create policy payments_read on public.order_payments for select using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.partner_id = public.my_partner())));
create policy dispatch_read on public.dispatch_notes for select using (exists (select 1 from public.orders o where o.id = order_id and (public.is_staff() or o.partner_id = public.my_partner())));
create policy moves_read on public.stock_moves for select using (public.is_staff());
-- nobody writes these tables directly; every change goes through the workflow functions below
revoke insert, update, delete, truncate on public.orders, public.order_lines, public.order_events, public.order_payments, public.dispatch_notes, public.stock_moves from anon, authenticated;
revoke all on public.order_seq from anon, authenticated;

create trigger audit_orders after insert or update on public.orders for each row execute function public.audit_row('id');
create trigger audit_order_payments after insert on public.order_payments for each row execute function public.audit_row('order_id');
create trigger audit_dispatch after insert on public.dispatch_notes for each row execute function public.audit_row('order_id');
create trigger audit_stock_moves after insert on public.stock_moves for each row execute function public.audit_row('sku');

-- allowed status moves; anything else is refused even for functions
create or replace function public.orders_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'Pending Approval' and new.status in ('Approved','On hold','Cancelled'))
    or (old.status = 'Approved'         and new.status in ('Payment Confirmed','Dispatched','On hold','Cancelled'))
    or (old.status = 'Payment Confirmed' and new.status in ('Dispatched','On hold','Cancelled'))
    or (old.status = 'On hold'          and new.status in ('Pending Approval','Approved','Payment Confirmed','Cancelled'))
    or (old.status = 'Dispatched'       and new.status = 'Delivered')) then
    raise exception 'An order cannot move from % to %', old.status, new.status;
  end if;
  if new.status = 'Dispatched' and old.status <> 'Dispatched' and current_setting('epdms.dispatching', true) is distinct from 'on' then
    raise exception 'Dispatch through dispatch_order()';
  end if;
  return new;
end $$;
create trigger orders_guard_t before update on public.orders for each row execute function public.orders_guard();

create or replace function public.order_event(oid text, st text, note text) returns void
language sql security definer set search_path = public as $$ insert into public.order_events(order_id, status, note) values (oid, st, note) $$;
revoke execute on function public.order_event(text,text,text) from public, anon, authenticated;

-- Partner places an order. Price, schemes, minimums, stock reservation and lead time are all decided here.
create or replace function public.place_order(items jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare pid text := public.my_partner(); q jsonb; oid text; l jsonb; free int; res int; lt jsonb; short int := 0; days int; st text; a jsonb; pstatus text;
begin
  if pid is null or public.my_role() not in ('dealer','distributor') then raise exception 'Only partners can place orders'; end if;
  select status, state into pstatus, st from public.partners where id = pid;
  if pstatus <> 'Active' then raise exception 'Your partnership is not active, so you cannot place orders'; end if;
  q := public.order_calc(pid, items);
  select value into lt from public.settings where key = 'lead_time';
  insert into public.orders(partner_id, taxable, discount, net, gst, total, applied)
  values (pid, (q->>'taxable')::numeric, (q->>'discount')::numeric, (q->>'net')::numeric, (q->>'gst')::numeric, (q->>'total')::numeric, q->'applied')
  returning id into oid;
  for l in select * from jsonb_array_elements(q->'lines') loop
    select greatest(coalesce(available,0) - coalesce(reserved,0), 0) into free from public.stock where sku = l->>'sku' for update;
    res := least(coalesce(free,0), (l->>'cartons')::int);
    insert into public.order_lines(order_id, sku, cartons, units, unit_price, amount, reserved_cartons, short_cartons)
    values (oid, l->>'sku', (l->>'cartons')::int, (l->>'units')::int, (l->>'unit')::numeric, (l->>'amt')::numeric, res, (l->>'cartons')::int - res);
    update public.stock set reserved = reserved + res where sku = l->>'sku';
    short := short + ((l->>'cartons')::int - res);
  end loop;
  for a in select * from jsonb_array_elements(q->'applied') loop
    insert into public.scheme_usage(scheme_id, order_id, amount) values (a->>'id', oid, (a->>'amt')::numeric);
  end loop;
  days := (lt->>'confirm')::int + (lt->>'dispatch')::int + case when short > 0 then (lt->>'make')::int else 0 end
        + case when st = 'Gujarat' then (lt->>'transit_in')::int else (lt->>'transit_out')::int end;
  update public.orders set lead_days = days where id = oid;
  perform public.order_event(oid, 'Pending Approval', 'Order placed by partner');
  return oid;
end $$;

create or replace function public.approve_order(oid text) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can approve orders'; end if;
  update public.orders set status = 'Approved' where id = oid and status = 'Pending Approval' returning partner_id into pid;
  if pid is null then raise exception 'Only an order waiting for approval can be approved'; end if;
  perform public.order_event(oid, 'Approved', 'Approved');
  perform public.notify_partner(pid, 'Order ' || oid || ' approved', 'Please pay by bank transfer or UPI and add the UTR number. Your order moves on once EarthLabs confirms the payment.', '/partner/orders/');
end $$;

-- Accounts confirms money received. The order moves to Payment Confirmed only when confirmed payments cover the total.
create or replace function public.confirm_order_payment(oid text, utr text, amt numeric) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; paid numeric; lt jsonb; newst text;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can confirm payments'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'Approved' then raise exception 'Payment can be confirmed only for an approved order (this one is %)', o.status; end if;
  begin
    insert into public.order_payments(order_id, utr, amount) values (oid, trim(utr), amt);
  exception when unique_violation then raise exception 'This UTR is already recorded against a payment';
  end;
  select coalesce(sum(amount),0) into paid from public.order_payments where order_id = oid;
  if paid >= o.total then
    select value into lt from public.settings where key = 'lead_time';
    update public.orders set status = 'Payment Confirmed', eta_from = current_date + coalesce(lead_days, 0), eta_to = current_date + coalesce(lead_days, 0) + 2 where id = oid;
    perform public.order_event(oid, 'Payment Confirmed', 'Payment of ' || paid || ' confirmed (UTR ' || trim(utr) || ')');
    perform public.notify_partner(o.partner_id, 'Payment confirmed for ' || oid, 'Your order will be dispatched shortly.', '/partner/orders/');
    newst := 'Payment Confirmed';
  else
    perform public.order_event(oid, 'Approved', 'Part payment ' || amt || ' confirmed. Balance ' || (o.total - paid));
    newst := 'Approved';
  end if;
  return newst;
end $$;

create or replace function public.hold_order(oid text, why text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can hold orders'; end if;
  if length(trim(coalesce(why,''))) < 5 then raise exception 'A reason is required'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  update public.orders set prev_status = o.status, status = 'On hold', hold_reason = trim(why) where id = oid;
  perform public.order_event(oid, 'On hold', trim(why));
  perform public.notify_partner(o.partner_id, 'Order ' || oid || ' is on hold', trim(why), '/partner/orders/');
end $$;

create or replace function public.resume_order(oid text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can resume orders'; end if;
  select * into o from public.orders where id = oid for update;
  if o.status <> 'On hold' then raise exception 'Only an order on hold can be resumed'; end if;
  update public.orders set status = coalesce(prev_status, 'Pending Approval'), prev_status = null, hold_reason = null where id = oid;
  perform public.order_event(oid, coalesce(o.prev_status,'Pending Approval'), 'Resumed');
end $$;

-- cancelling returns reserved stock and the scheme budget; a dispatched order cannot be cancelled
create or replace function public.cancel_order(oid text, why text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; r record;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can cancel orders'; end if;
  if length(trim(coalesce(why,''))) < 5 then raise exception 'A reason is required'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status in ('Dispatched','Delivered','Cancelled') then raise exception 'A % order cannot be cancelled', lower(o.status); end if;
  for r in select sku, reserved_cartons from public.order_lines where order_id = oid and reserved_cartons > 0 loop
    update public.stock set reserved = greatest(reserved - r.reserved_cartons, 0) where sku = r.sku;
  end loop;
  update public.order_lines set reserved_cartons = 0 where order_id = oid;
  delete from public.scheme_usage where order_id = oid;
  update public.orders set status = 'Cancelled', cancel_reason = trim(why) where id = oid;
  perform public.order_event(oid, 'Cancelled', trim(why) || case when exists (select 1 from public.order_payments where order_id = oid) then ' (payment received: refund through a credit note)' else '' end);
  perform public.notify_partner(o.partner_id, 'Order ' || oid || ' cancelled', trim(why), '/partner/orders/');
end $$;

-- Warehouse dispatches. The payment gate: only a Payment Confirmed order ships, except a credit-approved partner when pay-and-carry is switched off.
create or replace function public.dispatch_order(oid text, vehicle text, lr text, batch text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; pc jsonb; credit_ok boolean := false; lvl int; av int;
begin
  if public.my_role() not in ('super_admin','warehouse') then raise exception 'Only Warehouse or Super Admin can dispatch'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  select value into pc from public.settings where key = 'pay_and_carry';
  select credit_level into lvl from public.partners where id = o.partner_id;
  credit_ok := o.status = 'Approved' and not coalesce((pc->>'enabled')::boolean, true) and coalesce(lvl,0) > 0;
  if o.status <> 'Payment Confirmed' and not credit_ok then
    raise exception 'Payment is not confirmed. An order ships only after Accounts confirms payment';
  end if;
  if coalesce((select (value)::text = 'true' from public.settings where key = 'batch_ref_required'), false) and length(trim(coalesce(batch,''))) = 0 then
    raise exception 'Enter the QC-approved batch reference';
  end if;
  for r in select sku, cartons, reserved_cartons from public.order_lines where order_id = oid loop
    select available into av from public.stock where sku = r.sku for update;
    if coalesce(av,0) < r.cartons then raise exception 'Not enough stock of % to dispatch (have %, need %)', r.sku, coalesce(av,0), r.cartons; end if;
    update public.stock set available = available - r.cartons, reserved = greatest(reserved - r.reserved_cartons, 0) where sku = r.sku;
    insert into public.stock_moves(sku, delta, reason, order_id) values (r.sku, -r.cartons, 'Dispatch', oid);
  end loop;
  perform set_config('epdms.dispatching','on',true);
  update public.orders set status = 'Dispatched' where id = oid;
  insert into public.dispatch_notes(order_id, vehicle, lr_no, batch_ref) values (oid, nullif(trim(vehicle),''), nullif(trim(lr),''), nullif(trim(batch),''));
  perform public.order_event(oid, 'Dispatched', coalesce('Vehicle ' || nullif(trim(vehicle),''), 'Dispatched'));
  perform public.notify_partner(o.partner_id, 'Order ' || oid || ' dispatched', 'Your order is on its way.', '/partner/orders/');
end $$;

create or replace function public.deliver_order(oid text) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if public.my_role() not in ('super_admin','warehouse','sales') then raise exception 'Not allowed'; end if;
  update public.orders set status = 'Delivered' where id = oid and status = 'Dispatched' returning partner_id into pid;
  if pid is null then raise exception 'Only a dispatched order can be marked delivered'; end if;
  perform public.order_event(oid, 'Delivered', 'Delivered');
end $$;

-- Warehouse stock adjustment (stock take, goods in from the batch system). Reason is mandatory and every move is logged.
create or replace function public.adjust_stock(s text, delta int, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','warehouse') then raise exception 'Only Warehouse or Super Admin can change stock'; end if;
  if delta = 0 then raise exception 'Change cannot be zero'; end if;
  if length(trim(coalesce(why,''))) < 3 then raise exception 'A reason is required'; end if;
  update public.stock set available = available + delta where sku = s;
  if not found then raise exception 'SKU not found'; end if;
  insert into public.stock_moves(sku, delta, reason) values (s, delta, trim(why));
end $$;

revoke execute on function public.place_order(jsonb), public.approve_order(text), public.confirm_order_payment(text,text,numeric), public.hold_order(text,text),
  public.resume_order(text), public.cancel_order(text,text), public.dispatch_order(text,text,text,text), public.deliver_order(text), public.adjust_stock(text,int,text) from public, anon;
grant execute on function public.place_order(jsonb), public.approve_order(text), public.confirm_order_payment(text,text,numeric), public.hold_order(text,text),
  public.resume_order(text), public.cancel_order(text,text), public.dispatch_order(text,text,text,text), public.deliver_order(text), public.adjust_stock(text,int,text) to authenticated;

-- ============ 4) Dashboard numbers (one call, role-aware) ============
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.app_role := public.my_role(); pid text := public.my_partner(); j jsonb := '{}';
begin
  if r is null then return j; end if;
  if public.is_staff() then
    j := jsonb_build_object(
      'applications_open', (select count(*) from public.applications where status in ('Submitted','More info needed','Field verification')),
      'partners_active', (select count(*) from public.partners where status = 'Active'),
      'orders_pending', (select count(*) from public.orders where status = 'Pending Approval'),
      'orders_to_pay', (select count(*) from public.orders where status = 'Approved'),
      'orders_to_dispatch', (select count(*) from public.orders where status = 'Payment Confirmed'),
      'low_stock', (select count(*) from public.stock s join public.skus k on k.sku = s.sku where k.status = 'active' and s.available - s.reserved <= s.reorder_level),
      'approvals_pending', case when public.is_super() then (select count(*) from public.change_requests where status = 'Pending') end);
  elsif pid is not null then
    j := jsonb_build_object(
      'orders_open', (select count(*) from public.orders where partner_id = pid and status not in ('Delivered','Cancelled')),
      'orders_total', (select count(*) from public.orders where partner_id = pid),
      'orders_to_pay', (select count(*) from public.orders where partner_id = pid and status = 'Approved'),
      'ordered_value', (select coalesce(sum(total),0) from public.orders where partner_id = pid and status <> 'Cancelled'));
  end if;
  return j;
end $$;
grant execute on function public.dashboard_stats() to authenticated;
