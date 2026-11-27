-- Earlier records: things that happened before the system was in use.
-- Earlier sales count in sales/ledger/profit but never touch stock.
-- Earlier production counts in production totals but never uses raw material or packaging stock.

create table if not exists public.earlier_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  customer_id uuid not null references customers(id),
  kind text not null default 'company' check (kind in ('company','local')),
  product text not null,
  qty numeric, unit text, rate numeric,
  amount numeric not null check (amount >= 0),      -- before GST
  gst_amount numeric not null default 0,
  total numeric not null,
  received numeric not null default 0,
  payment_id uuid references customer_payments(id) on delete set null,
  cogs numeric not null default 0,                   -- cost, if known
  notes text,
  created_by uuid, created_at timestamptz default now()
);
alter table public.earlier_sales enable row level security;
drop policy if exists earlier_sales_admin on public.earlier_sales;
create policy earlier_sales_admin on public.earlier_sales for all using (acct_ok()) with check (acct_ok());

alter table public.filling_lines add column if not exists pre_system boolean not null default false;
alter table public.filling_lines add column if not exists pre_sold integer not null default 0;

-- customer balance now includes earlier sales
create or replace view public.v_customer_balance with (security_invoker = true) as
 select c.id as customer_id, c.name, c.customer_type,
   coalesce((select sum(i.total) from tax_invoices i join sales_orders o on o.id = i.order_id where o.customer_id = c.id and i.status = 'issued'), 0)
   + coalesce((select sum(e.total) from earlier_sales e where e.customer_id = c.id), 0) as billed,
   coalesce((select sum(p.amount) from customer_payments p where p.customer_id = c.id), 0) as received
 from customers c;

-- packaging is not used up by earlier (pre-system) filling
create or replace function public.filling_pack_stock() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    if new.pre_system then return null; end if;
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
      select u.raw_material_id, 'consumption', -u.qty, new.batch_id, 'Filling ' || new.pack_type || ' ' || new.size_ml || ' mL'
      from pack_use(new.batch_id, new.pack_type, new.size_ml, greatest(new.manufactured, new.filled + new.rejected)) u where u.qty > 0;
  elsif tg_op = 'DELETE' then
    if old.pre_system then return null; end if;
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
      select u.raw_material_id, 'adjustment', u.qty, old.batch_id, 'Filling line removed'
      from pack_use(old.batch_id, old.pack_type, old.size_ml, greatest(old.manufactured, old.filled + old.rejected)) u where u.qty > 0;
  else
    if new.pre_system then return null; end if;
    for r in
      select coalesce(o.raw_material_id, n.raw_material_id) as rm, coalesce(n.qty, 0) - coalesce(o.qty, 0) as delta
      from pack_use(old.batch_id, old.pack_type, old.size_ml, greatest(old.manufactured, old.filled + old.rejected)) o
      full join pack_use(new.batch_id, new.pack_type, new.size_ml, greatest(new.manufactured, new.filled + new.rejected)) n on n.raw_material_id = o.raw_material_id
    loop
      if r.delta <> 0 then
        insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
          values (r.rm, case when r.delta > 0 then 'consumption' else 'adjustment' end, -r.delta, new.batch_id, 'Filling line changed');
      end if;
    end loop;
  end if;
  return null;
end $$;

-- finished goods: units sold before the system are taken off
create or replace view public.v_finished_goods as
 with f as (select batch_id, pack_type, size_ml, sum(manufactured) manufactured, sum(filled) filled, sum(rejected) rejected, sum(pre_sold) pre_sold from filling_lines group by 1,2,3),
 d as (select batch_id, pack_type, size_ml, sum(qty) dispatched from dispatch_lines group by 1,2,3),
 r as (select batch_id, pack_type, size_ml, sum(qty) reserved from reservations where not released group by 1,2,3)
 select b.id as batch_id, b.batch_code, p.name as product_name, p.variant, f.pack_type, f.size_ml, f.manufactured, f.filled, f.rejected,
   coalesce(r.reserved, 0::bigint) as reserved,
   coalesce(d.dispatched, 0::bigint) + f.pre_sold as dispatched,
   f.filled - coalesce(d.dispatched, 0::bigint) - f.pre_sold - coalesce(r.reserved, 0::bigint) as available,
   f.filled - coalesce(d.dispatched, 0::bigint) - f.pre_sold as remaining_stock
 from f join batches b on b.id = f.batch_id join products p on p.id = b.product_id
 left join d on d.batch_id = f.batch_id and d.pack_type = f.pack_type and d.size_ml = f.size_ml
 left join r on r.batch_id = f.batch_id and r.pack_type = f.pack_type and r.size_ml = f.size_ml;

create or replace function public.guard_dispatch_line() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare filled_q numeric; sent numeric; resv numeric;
begin
  select coalesce(sum(filled - pre_sold),0) into filled_q from public.filling_lines where batch_id = new.batch_id and pack_type = new.pack_type and size_ml = new.size_ml;
  select coalesce(sum(qty),0) into sent from public.dispatch_lines where batch_id = new.batch_id and pack_type = new.pack_type and size_ml = new.size_ml and id is distinct from new.id;
  select coalesce(sum(qty),0) into resv from public.reservations where batch_id = new.batch_id and pack_type = new.pack_type and size_ml = new.size_ml and not released;
  if new.qty > filled_q - sent - resv then
    raise exception 'Only % units available for this batch/pack (filled %, dispatched %, reserved %)', greatest(filled_q - sent - resv,0), filled_q, sent, resv;
  end if;
  return new;
end $$;

-- ---------- earlier sale ----------
create or replace function public.save_earlier_sale(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cust uuid := nullif(p->>'customer_id','')::uuid; v_name text := nullif(trim(coalesce(p->>'customer_name','')),'');
  v_amt numeric := coalesce((p->>'amount')::numeric, 0); v_gst numeric := coalesce((p->>'gst_amount')::numeric, 0);
  v_rec numeric := coalesce((p->>'received')::numeric, 0); v_date date := coalesce(nullif(p->>'sale_date','')::date, current_date);
  v_kind text := coalesce(nullif(p->>'kind',''),'company'); v_id uuid; v_pay uuid; v_prod text := nullif(trim(coalesce(p->>'product','')),'');
begin
  if not acct_ok() then raise exception 'Only admin can add earlier sales'; end if;
  if v_prod is null then raise exception 'Enter what was sold'; end if;
  if v_amt <= 0 then raise exception 'Enter the sale amount'; end if;
  if v_kind not in ('company','local') then raise exception 'Kind must be company or local'; end if;
  if v_rec < 0 or v_rec > v_amt + v_gst + 0.005 then raise exception 'Received cannot be more than the total'; end if;
  if v_cust is null then
    if v_name is null then raise exception 'Pick or type the customer'; end if;
    select id into v_cust from customers where lower(name) = lower(v_name) limit 1;
    if v_cust is null then insert into customers(name, customer_type) values (v_name, 'direct') returning id into v_cust; end if;
  end if;
  insert into earlier_sales(sale_date, customer_id, kind, product, qty, unit, rate, amount, gst_amount, total, received, cogs, notes, created_by)
    values (v_date, v_cust, v_kind, v_prod, nullif(p->>'qty','')::numeric, nullif(p->>'unit',''), nullif(p->>'rate','')::numeric, v_amt, v_gst, v_amt + v_gst, v_rec,
            coalesce(nullif(p->>'cogs','')::numeric, 0), nullif(p->>'notes',''), auth.uid()) returning id into v_id;
  if v_rec > 0 then
    insert into customer_payments(customer_id, invoice_id, paid_on, amount, mode, notes, created_by)
      values (v_cust, null, v_date, v_rec, coalesce(nullif(p->>'mode',''),'cash'), 'Earlier sale (before the system): ' || v_prod, auth.uid()) returning id into v_pay;
    update earlier_sales set payment_id = v_pay where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_earlier_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay uuid;
begin
  if not acct_ok() then raise exception 'Only admin can delete earlier sales'; end if;
  select payment_id into v_pay from earlier_sales where id = p_id;
  delete from earlier_sales where id = p_id;
  if v_pay is not null then delete from customer_payments where id = v_pay; end if;
end $$;

-- ---------- earlier production (made and filled before the system) ----------
-- p_lines: [{pack_type:'bottle'|'sachet'|..., size_ml, filled, sold}]
create or replace function public.add_earlier_production(p_product uuid, p_date date, p_lines jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_run uuid; l jsonb; v_litres numeric := 0; v_n int; v_code text; v_date date := coalesce(p_date, current_date);
begin
  if not acct_ok() then raise exception 'Only admin can add earlier production'; end if;
  if p_product is null then raise exception 'Pick the product'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one pack line'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'filled')::int, 0) <= 0 then raise exception 'Filled quantity must be above zero'; end if;
    if coalesce((l->>'size_ml')::numeric, 0) <= 0 then raise exception 'Enter the pack size in mL'; end if;
    if coalesce((l->>'sold')::int, 0) < 0 or coalesce((l->>'sold')::int, 0) > (l->>'filled')::int then raise exception 'Sold cannot be more than filled'; end if;
    v_litres := v_litres + (l->>'filled')::numeric * (l->>'size_ml')::numeric / 1000.0;
  end loop;
  select count(*) + 1 into v_n from batches where batch_code like 'PRE-' || to_char(v_date,'YYYYMMDD') || '-%';
  v_code := 'PRE-' || to_char(v_date,'YYYYMMDD') || '-' || lpad(v_n::text, 3, '0');
  insert into batches(batch_code, status, mfg_date, product_id, batch_size_l, operator_id, approved_by, approved_at, officer_remarks, observations, locked)
    values (v_code, 'approved', v_date, p_product, round(v_litres, 3), auth.uid(), auth.uid(), v_date::timestamptz, 'Made before the system was in use', p_note, true) returning id into v_b;
  insert into filling_runs(batch_id, run_date, operator_id, loss_l, notes) values (v_b, v_date, auth.uid(), 0, 'Earlier production: ' || coalesce(p_note, 'before the system')) returning id into v_run;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into filling_lines(run_id, batch_id, pack_type, size_ml, manufactured, filled, rejected, pre_system, pre_sold)
      values (v_run, v_b, l->>'pack_type', (l->>'size_ml')::numeric, (l->>'filled')::int, (l->>'filled')::int, 0, true, coalesce((l->>'sold')::int, 0));
  end loop;
  return v_b;
end $$;

grant execute on function public.save_earlier_sale(jsonb), public.delete_earlier_sale(uuid), public.add_earlier_production(uuid, date, jsonb, text) to authenticated;
