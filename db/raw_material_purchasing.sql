-- EarthLabs Batch Management: low-stock rules, purchase orders, RM -> FG capacity.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke) AFTER db/raw_material_inventory.sql.
-- All quantities are in each raw material's base unit (mL / g); formulation % is % of batch volume.

-- 1) Rules: cover rule defaults (keep >= 2 batches of 25 L) + per-material minimum level
insert into public.app_settings(key, value) values ('rm_cover_batches','2'), ('rm_ref_batch_l','25')
  on conflict (key) do nothing;
alter table public.raw_materials add column if not exists min_level numeric not null default 0 check (min_level >= 0);

-- 2) Purchase orders (writes only through the RPCs below)
create sequence if not exists public.purchase_order_seq;
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique default ('PO-' || lpad(nextval('public.purchase_order_seq')::text, 5, '0')),
  supplier text not null check (length(trim(supplier)) > 0),
  status text not null default 'ordered' check (status in ('ordered','partial','received','cancelled')),
  expected_date date,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials(id),
  qty_ordered numeric not null check (qty_ordered > 0),
  qty_received numeric not null default 0 check (qty_received >= 0)
);
create index if not exists po_lines_po_idx on public.purchase_order_lines(po_id);
alter table public.raw_material_stock add column if not exists po_id uuid references public.purchase_orders(id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
create policy read_purchase_orders on public.purchase_orders for select using ((select app_role()) is not null);
create policy read_po_lines on public.purchase_order_lines for select using ((select app_role()) is not null);

create or replace function public.create_purchase_order(p_supplier text, p_expected date, p_notes text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can place orders'; end if;
  if p_supplier is null or length(trim(p_supplier)) = 0 then raise exception 'Supplier is required'; end if;
  select count(*) into v_n from jsonb_to_recordset(p_lines) as x(raw_material_id uuid, qty numeric)
    where x.raw_material_id is not null and x.qty > 0;
  if v_n = 0 or v_n <> jsonb_array_length(p_lines) then raise exception 'Every order line needs a raw material and a quantity above zero'; end if;
  insert into purchase_orders(supplier, expected_date, notes) values (trim(p_supplier), p_expected, nullif(trim(p_notes),''))
    returning id into v_id;
  insert into purchase_order_lines(po_id, raw_material_id, qty_ordered)
    select v_id, x.raw_material_id, x.qty from jsonb_to_recordset(p_lines) as x(raw_material_id uuid, qty numeric);
  return v_id;
end $$;

create or replace function public.receive_po_line(p_line uuid, p_qty numeric, p_lot text, p_expiry date)
returns void language plpgsql security definer set search_path = public as $$
declare l purchase_order_lines; o purchase_orders; v_open int; v_got int;
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can receive stock'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Received quantity must be above zero'; end if;
  select * into l from purchase_order_lines where id = p_line for update;
  if not found then raise exception 'Order line not found'; end if;
  select * into o from purchase_orders where id = l.po_id for update;
  if o.status in ('received','cancelled') then raise exception 'This order is already %', o.status; end if;
  insert into raw_material_stock(raw_material_id, movement, qty, lot_no, supplier, expiry_date, po_id, note)
    values (l.raw_material_id, 'receipt', p_qty, nullif(trim(p_lot),''), o.supplier, p_expiry, o.id, 'PO ' || o.po_no);
  update purchase_order_lines set qty_received = qty_received + p_qty where id = p_line;
  select count(*) filter (where qty_received < qty_ordered), count(*) filter (where qty_received > 0)
    into v_open, v_got from purchase_order_lines where po_id = o.id;
  update purchase_orders set status = case when v_open = 0 then 'received' when v_got > 0 then 'partial' else 'ordered' end
    where id = o.id;
end $$;

create or replace function public.cancel_purchase_order(p_po uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can cancel orders'; end if;
  update purchase_orders set status = 'cancelled' where id = p_po and status in ('ordered','partial');
  if not found then raise exception 'Only open orders can be cancelled'; end if;
end $$;

revoke all on function public.create_purchase_order(text,date,text,jsonb), public.receive_po_line(uuid,numeric,text,date),
  public.cancel_purchase_order(uuid) from public, anon;
grant execute on function public.create_purchase_order(text,date,text,jsonb), public.receive_po_line(uuid,numeric,text,date),
  public.cancel_purchase_order(uuid) to authenticated;

-- 3) Status per raw material: stock, on order, cover in batches, low flags, suggested order
create or replace view public.raw_material_status with (security_invoker = true) as
with cfg as (
  select coalesce((select value::numeric from app_settings where key = 'rm_cover_batches'), 2) as cover,
         coalesce((select value::numeric from app_settings where key = 'rm_ref_batch_l'), 25) as ref_l),
need as (  -- base units needed per litre of finished product (max across active products)
  select f.raw_material_id,
         max(f.required_pct / 100 * (case when rm.unit in ('mL','g') then 1000 else 1 end)) as per_l
  from formulations f join products p on p.id = f.product_id and p.active
  join raw_materials rm on rm.id = f.raw_material_id group by f.raw_material_id),
oo as (
  select l.raw_material_id, sum(greatest(l.qty_ordered - l.qty_received, 0)) as on_order
  from purchase_order_lines l join purchase_orders o on o.id = l.po_id
  where o.status in ('ordered','partial') group by l.raw_material_id),
base as (
  select rm.id as raw_material_id, rm.name, rm.unit, rm.min_level,
         coalesce(lv.on_hand, 0) as on_hand, coalesce(oo.on_order, 0) as on_order,
         coalesce(n.per_l, 0) * cfg.ref_l as per_batch_need, cfg.cover, cfg.ref_l
  from raw_materials rm cross join cfg
  left join raw_material_levels lv on lv.raw_material_id = rm.id
  left join need n on n.raw_material_id = rm.id
  left join oo on oo.raw_material_id = rm.id
  where rm.active)
select raw_material_id, name, unit, min_level, on_hand, on_order, per_batch_need,
       case when per_batch_need > 0 then on_hand / per_batch_need end as batches_cover,
       (on_hand < min_level) as below_min,
       (per_batch_need > 0 and on_hand < per_batch_need * cover) as below_cover,
       greatest(min_level, per_batch_need * cover) as target_level,
       greatest(greatest(min_level, per_batch_need * cover) - on_hand - on_order, 0) as suggested_order
from base;

-- 4) Raw material -> finished goods capacity, one row per product x material
create or replace view public.v_product_rm_capacity with (security_invoker = true) as
select p.id as product_id, p.name as product_name, p.variant, st.raw_material_id, st.name as rm_name, st.unit,
       f.required_pct,
       f.required_pct / 100 * (case when st.unit in ('mL','g') then 1000 else 1 end) as per_litre,
       st.on_hand, st.on_order
from formulations f
join products p on p.id = f.product_id and p.active
join raw_material_status st on st.raw_material_id = f.raw_material_id;
