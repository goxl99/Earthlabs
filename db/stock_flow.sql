-- EarthLabs stock flow: Received (bills) vs Used vs Corrections vs Stock in hand, a packaging catch-up check, and physical counts.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke). Safe to re-run. Does not change any stock entries.

-- 1) One row per item that splits the ledger into: received on bills, used in batches/filling, and manual corrections.
--    received_total + adjust_total - used_total = on_hand  (always)
create or replace view public.raw_material_flow
with (security_invoker = true) as
-- a correction/undo row is counted with the entry it reverses (o), so both sides of a cancelled pair always sit in the same column
select rm.id as raw_material_id, rm.name, rm.unit, rm.category, rm.pack_type,
  coalesce(sum(s.qty) filter (where s.batch_id is null and (coalesce(o.movement, s.movement) = 'receipt' or coalesce(o.invoice_id, s.invoice_id) is not null)), 0) as received_total,
  coalesce(-sum(s.qty) filter (where s.batch_id is not null), 0) as used_total,
  coalesce(sum(s.qty) filter (where s.batch_id is null and not (coalesce(o.movement, s.movement) = 'receipt' or coalesce(o.invoice_id, s.invoice_id) is not null)), 0) as adjust_total,
  coalesce(sum(s.qty), 0) as on_hand,
  count(*) filter (where s.movement = 'receipt' and s.reversed_by is null) as receipts,
  max(s.created_at) filter (where s.movement = 'receipt' and s.reversed_by is null) as last_received,
  coalesce((select sum(l.qty_ordered) from purchase_order_lines l join purchase_orders po on po.id = l.po_id
            where l.raw_material_id = rm.id and po.status <> 'cancelled'), 0) as po_ordered,
  coalesce((select sum(l.qty_received) from purchase_order_lines l join purchase_orders po on po.id = l.po_id
            where l.raw_material_id = rm.id and po.status <> 'cancelled'), 0) as po_received
from public.raw_materials rm
left join public.raw_material_stock s on s.raw_material_id = rm.id
left join public.raw_material_stock o on o.id = s.reverses_id
where rm.active
group by rm.id, rm.name, rm.unit, rm.category, rm.pack_type;

-- 2) Packaging that filling should have used up but did not (e.g. fillings recorded before packaging stock was switched on).
create or replace function public.stock_gaps()
returns table(raw_material_id uuid, name text, unit text, batches integer, missing numeric)
language sql stable security definer set search_path = public as $$
  with exp as (
    select l.batch_id, u.raw_material_id, sum(u.qty) as expected
    from filling_lines l
    cross join lateral pack_use(l.batch_id, l.pack_type, l.size_ml, greatest(l.manufactured, l.filled + l.rejected)) u
    where not l.pre_system group by 1, 2),
  ded as (
    select s.batch_id, s.raw_material_id, -sum(s.qty) as deducted
    from raw_material_stock s where s.batch_id is not null and s.note like 'Filling%' group by 1, 2)
  select rm.id, rm.name, rm.unit, count(*)::integer, sum(e.expected - coalesce(d.deducted, 0))
  from exp e join raw_materials rm on rm.id = e.raw_material_id
  left join ded d on d.batch_id = e.batch_id and d.raw_material_id = e.raw_material_id
  where e.expected - coalesce(d.deducted, 0) > 0
  group by rm.id, rm.name, rm.unit
  order by rm.name
$$;

-- 3) Admin: post those missing deductions (each one tagged "Filling catch-up", so it shows in history and can be seen on the batch).
create or replace function public.fix_stock_gaps(p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if coalesce((select app_role())::text, '') <> 'admin' then raise exception 'Only admin can post missing deductions'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  with exp as (
    select l.batch_id, u.raw_material_id, sum(u.qty) as expected
    from filling_lines l
    cross join lateral pack_use(l.batch_id, l.pack_type, l.size_ml, greatest(l.manufactured, l.filled + l.rejected)) u
    where not l.pre_system group by 1, 2),
  ded as (
    select s.batch_id, s.raw_material_id, -sum(s.qty) as deducted
    from raw_material_stock s where s.batch_id is not null and s.note like 'Filling%' group by 1, 2)
  insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
  select e.raw_material_id, 'consumption', -(e.expected - coalesce(d.deducted, 0)), e.batch_id, 'Filling catch-up: ' || btrim(p_reason)
  from exp e left join ded d on d.batch_id = e.batch_id and d.raw_material_id = e.raw_material_id
  where e.expected - coalesce(d.deducted, 0) > 0;
  get diagnostics n = row_count;
  return n;
end $$;

-- 4) Admin: record what is really on the shelf. The system works out the difference and posts one correcting entry.
--    p_counted is in the item's own unit. Returns the change that was posted (negative = stock reduced).
create or replace function public.set_stock_count(p_rm uuid, p_counted numeric, p_note text) returns numeric
language plpgsql security definer set search_path = public as $$
declare cur numeric; d numeric; u text;
begin
  if coalesce((select app_role())::text, '') <> 'admin' then raise exception 'Only admin can record a physical count'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the counted quantity (zero or more)'; end if;
  select rm.unit into u from raw_materials rm where rm.id = p_rm;
  if not found then raise exception 'Item not found'; end if;
  select coalesce(sum(qty), 0) into cur from raw_material_stock where raw_material_id = p_rm;
  d := round(p_counted, 3) - round(cur, 3);
  if d = 0 then raise exception 'The count matches the system, so nothing was changed'; end if;
  insert into raw_material_stock(raw_material_id, movement, qty, note)
    values (p_rm, 'adjustment', d, 'Physical count: counted ' || round(p_counted, 3) || ' ' || u || ', system showed ' || round(cur, 3) || ' (' || coalesce(nullif(btrim(p_note), ''), 'no note') || ')');
  return d;
end $$;

revoke all on function public.stock_gaps(), public.fix_stock_gaps(text), public.set_stock_count(uuid, numeric, text) from public, anon;
grant execute on function public.stock_gaps(), public.fix_stock_gaps(text), public.set_stock_count(uuid, numeric, text) to authenticated;
grant select on public.raw_material_flow to authenticated;
