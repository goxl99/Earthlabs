-- EarthLabs Batch Management: packaging items, supplier bills, pack recipes.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke) AFTER
-- db/raw_material_inventory.sql and db/raw_material_purchasing.sql.

-- 1) Item type: raw material or packaging (bottle, sachet, pack, box, carrier box, other). Packaging is counted in pcs.
alter table public.raw_materials add column if not exists category text not null default 'raw'
  check (category in ('raw','packaging'));
alter table public.raw_materials add column if not exists pack_type text
  check (pack_type in ('bottle','sachet','pack','box','carrier_box','other'));
alter table public.raw_materials drop constraint if exists raw_materials_pack_type_chk;
alter table public.raw_materials add constraint raw_materials_pack_type_chk
  check ((category = 'raw' and pack_type is null) or (category = 'packaging' and pack_type is not null));

-- 2) Pack recipes: packaging used per filled unit, e.g. 500 mL bottle -> 1 bottle + 1 cap + 1 carrier box per 12
create table if not exists public.product_packaging (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  pack_type text not null check (pack_type in ('bottle','sachet')),
  size_ml numeric not null check (size_ml > 0),
  raw_material_id uuid not null references public.raw_materials(id),
  qty numeric not null check (qty > 0),
  per_units integer not null default 1 check (per_units > 0),
  unique (product_id, pack_type, size_ml, raw_material_id)
);
alter table public.product_packaging enable row level security;
drop policy if exists read_product_packaging on public.product_packaging;
create policy read_product_packaging on public.product_packaging for select using ((select app_role()) is not null);
drop policy if exists admin_write_product_packaging on public.product_packaging;
create policy admin_write_product_packaging on public.product_packaging for all
  using ((select app_role())::text = 'admin') with check ((select app_role())::text = 'admin');

-- 3) Status view: packaging cover comes from the pack recipes (per batch of the reference size)
create or replace view public.raw_material_status with (security_invoker = true) as
with cfg as (
  select coalesce((select value::numeric from app_settings where key = 'rm_cover_batches'), 2) as cover,
         coalesce((select value::numeric from app_settings where key = 'rm_ref_batch_l'), 25) as ref_l),
need as (
  select f.raw_material_id,
         max(f.required_pct / 100 * (case when rm.unit in ('mL','g') then 1000 else 1 end)) as per_l
  from formulations f join products p on p.id = f.product_id and p.active
  join raw_materials rm on rm.id = f.raw_material_id group by f.raw_material_id),
pn as (
  select pp.raw_material_id, max(pp.qty / pp.per_units * (cfg.ref_l * 1000 / pp.size_ml)) as per_batch
  from product_packaging pp join products p on p.id = pp.product_id and p.active cross join cfg
  group by pp.raw_material_id),
oo as (
  select l.raw_material_id, sum(greatest(l.qty_ordered - l.qty_received, 0)) as on_order
  from purchase_order_lines l join purchase_orders o on o.id = l.po_id
  where o.status in ('ordered','partial') group by l.raw_material_id),
base as (
  select rm.id as raw_material_id, rm.name, rm.unit, rm.min_level, rm.category, rm.pack_type,
         coalesce(lv.on_hand, 0) as on_hand, coalesce(oo.on_order, 0) as on_order,
         case when rm.category = 'packaging' then coalesce(pn.per_batch, 0)
              else coalesce(n.per_l, 0) * cfg.ref_l end as per_batch_need, cfg.cover, cfg.ref_l
  from raw_materials rm cross join cfg
  left join raw_material_levels lv on lv.raw_material_id = rm.id
  left join need n on n.raw_material_id = rm.id
  left join pn on pn.raw_material_id = rm.id
  left join oo on oo.raw_material_id = rm.id
  where rm.active)
select raw_material_id, name, unit, min_level, on_hand, on_order, per_batch_need,
       case when per_batch_need > 0 then on_hand / per_batch_need end as batches_cover,
       (on_hand < min_level) as below_min,
       (per_batch_need > 0 and on_hand < per_batch_need * cover) as below_cover,
       greatest(min_level, per_batch_need * cover) as target_level,
       greatest(greatest(min_level, per_batch_need * cover) - on_hand - on_order, 0) as suggested_order,
       category, pack_type
from base;

-- 4) Packaging is used up when filling is recorded (and put back if a filling line is changed or removed)
create or replace function public.pack_use(p_batch uuid, p_type text, p_size numeric, p_units integer)
returns table(raw_material_id uuid, qty numeric) language sql stable security definer set search_path = public as $$
  select pp.raw_material_id, ceil(p_units * pp.qty / pp.per_units)
  from batches b join product_packaging pp
    on pp.product_id = b.product_id and pp.pack_type = p_type and pp.size_ml = p_size
  where b.id = p_batch and p_units > 0
$$;

create or replace function public.filling_pack_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
      select u.raw_material_id, 'consumption', -u.qty, new.batch_id, 'Filling ' || new.pack_type || ' ' || new.size_ml || ' mL'
      from pack_use(new.batch_id, new.pack_type, new.size_ml, greatest(new.manufactured, new.filled + new.rejected)) u
      where u.qty > 0;
  elsif tg_op = 'DELETE' then
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
      select u.raw_material_id, 'adjustment', u.qty, old.batch_id, 'Filling line removed'
      from pack_use(old.batch_id, old.pack_type, old.size_ml, greatest(old.manufactured, old.filled + old.rejected)) u
      where u.qty > 0;
  else
    for r in
      select coalesce(o.raw_material_id, n.raw_material_id) as rm, coalesce(n.qty, 0) - coalesce(o.qty, 0) as delta
      from pack_use(old.batch_id, old.pack_type, old.size_ml, greatest(old.manufactured, old.filled + old.rejected)) o
      full join pack_use(new.batch_id, new.pack_type, new.size_ml, greatest(new.manufactured, new.filled + new.rejected)) n
        on n.raw_material_id = o.raw_material_id
    loop
      if r.delta <> 0 then
        insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
          values (r.rm, case when r.delta > 0 then 'consumption' else 'adjustment' end, -r.delta, new.batch_id, 'Filling line changed');
      end if;
    end loop;
  end if;
  return null;
end $$;
revoke all on function public.pack_use(uuid,text,numeric,integer), public.filling_pack_stock() from public, anon, authenticated;
drop trigger if exists trg_filling_pack_stock on public.filling_lines;
create trigger trg_filling_pack_stock after insert or update or delete on public.filling_lines
  for each row execute function public.filling_pack_stock();

-- 5) Supplier bills
create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (length(trim(supplier)) > 0),
  invoice_no text,
  invoice_date date,
  due_date date,
  subtotal numeric,
  tax_amount numeric,
  total numeric,
  currency text not null default 'INR',
  file_path text,
  file_name text,
  notes text,
  stock_posted boolean not null default false,
  extracted jsonb,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists supplier_invoices_uniq on public.supplier_invoices (lower(trim(supplier)), lower(trim(invoice_no)))
  where invoice_no is not null and length(trim(invoice_no)) > 0;
create table if not exists public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  raw_material_id uuid references public.raw_materials(id),
  description text,
  qty numeric,
  unit text,
  rate numeric,
  tax_pct numeric,
  amount numeric
);
create index if not exists inv_lines_inv_idx on public.supplier_invoice_lines(invoice_id);
create index if not exists inv_lines_rm_idx on public.supplier_invoice_lines(raw_material_id);
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;
drop policy if exists read_invoices on public.supplier_invoices;
create policy read_invoices on public.supplier_invoices for select using ((select app_role())::text in ('admin','qc_officer'));
drop policy if exists read_invoice_lines on public.supplier_invoice_lines;
create policy read_invoice_lines on public.supplier_invoice_lines for select using ((select app_role())::text in ('admin','qc_officer'));
drop policy if exists admin_delete_invoices on public.supplier_invoices;
create policy admin_delete_invoices on public.supplier_invoices for delete using ((select app_role())::text = 'admin');
-- (inserts go through save_supplier_invoice; there is no direct insert/update policy)

-- unit conversion into a material's own unit (weight and volume are treated as 1 g = 1 mL, as in the formulations)
create or replace function public.unit_info(u text, out fam text, out mult numeric) language plpgsql immutable as $$
begin
  case lower(trim(u))
    when 'kg','kgs','kilo','kilogram','kilograms' then fam := 'w'; mult := 1000;
    when 'g','gm','gms','gram','grams' then fam := 'w'; mult := 1;
    when 'l','ltr','ltrs','lt','litre','litres','liter','liters' then fam := 'w'; mult := 1000;
    when 'ml','millilitre','milliliter' then fam := 'w'; mult := 1;
    when 'pcs','pc','nos','no','piece','pieces','unit','units','each' then fam := 'c'; mult := 1;
    else raise exception 'Unknown unit "%"', u;
  end case;
end $$;
create or replace function public.convert_qty(q numeric, from_u text, to_u text) returns numeric
language plpgsql immutable as $$
declare f record; t record;
begin
  select * into f from unit_info(from_u); select * into t from unit_info(to_u);
  if f.fam <> t.fam then raise exception 'Cannot convert % to %', from_u, to_u; end if;
  return q * f.mult / t.mult;
end $$;

create or replace function public.save_supplier_invoice(p_header jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sup text := trim(coalesce(p_header->>'supplier','')); v_no text := nullif(trim(coalesce(p_header->>'invoice_no','')), '');
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can save bills'; end if;
  if v_sup = '' then raise exception 'Supplier is required'; end if;
  if v_no is not null and exists (select 1 from supplier_invoices where lower(trim(supplier)) = lower(v_sup) and lower(trim(invoice_no)) = lower(v_no)) then
    raise exception 'Bill % from % is already saved', v_no, v_sup;
  end if;
  insert into supplier_invoices(supplier, invoice_no, invoice_date, due_date, subtotal, tax_amount, total, currency, file_path, file_name, notes, extracted)
  values (v_sup, v_no, nullif(p_header->>'invoice_date','')::date, nullif(p_header->>'due_date','')::date,
          nullif(p_header->>'subtotal','')::numeric, nullif(p_header->>'tax_amount','')::numeric, nullif(p_header->>'total','')::numeric,
          coalesce(nullif(p_header->>'currency',''), 'INR'), nullif(p_header->>'file_path',''), nullif(p_header->>'file_name',''),
          nullif(trim(coalesce(p_header->>'notes','')), ''), p_header->'extracted')
  returning id into v_id;
  insert into supplier_invoice_lines(invoice_id, raw_material_id, description, qty, unit, rate, tax_pct, amount)
    select v_id, x.raw_material_id, x.description, x.qty, nullif(trim(x.unit),''), x.rate, x.tax_pct, x.amount
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as x(raw_material_id uuid, description text, qty numeric, unit text, rate numeric, tax_pct numeric, amount numeric);
  return v_id;
end $$;

create or replace function public.post_invoice_to_stock(p_invoice uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare i supplier_invoices; l record; v_n integer := 0;
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can add stock'; end if;
  select * into i from supplier_invoices where id = p_invoice for update;
  if not found then raise exception 'Bill not found'; end if;
  if i.stock_posted then raise exception 'This bill has already been added to stock'; end if;
  for l in select sl.*, rm.unit as base_unit from supplier_invoice_lines sl join raw_materials rm on rm.id = sl.raw_material_id
           where sl.invoice_id = p_invoice and sl.qty > 0 loop
    insert into raw_material_stock(raw_material_id, movement, qty, supplier, note)
      values (l.raw_material_id, 'receipt', round(convert_qty(l.qty, coalesce(l.unit, l.base_unit), l.base_unit), 3), i.supplier,
              'Bill ' || coalesce(i.invoice_no, '(no number)'));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'No lines are matched to an item with a quantity'; end if;
  update supplier_invoices set stock_posted = true where id = p_invoice;
  return v_n;
end $$;
revoke all on function public.save_supplier_invoice(jsonb,jsonb), public.post_invoice_to_stock(uuid) from public, anon;
grant execute on function public.save_supplier_invoice(jsonb,jsonb), public.post_invoice_to_stock(uuid) to authenticated;
revoke all on function public.unit_info(text), public.convert_qty(numeric,text,text) from public, anon;
grant execute on function public.unit_info(text), public.convert_qty(numeric,text,text) to authenticated;

-- last purchase per item (supplier and rate from the most recent bill)
create or replace view public.v_last_purchase with (security_invoker = true) as
select distinct on (l.raw_material_id) l.raw_material_id, i.id as invoice_id, i.supplier, i.invoice_no, i.invoice_date, l.rate, l.unit, l.qty
from supplier_invoice_lines l join supplier_invoices i on i.id = l.invoice_id
where l.raw_material_id is not null
order by l.raw_material_id, i.invoice_date desc nulls last, i.created_at desc;

-- 6) Private storage bucket for the bill files (admin and QA/QC only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-bills', 'supplier-bills', false, 15728640, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "bills read" on storage.objects;
create policy "bills read" on storage.objects for select to authenticated
  using (bucket_id = 'supplier-bills' and (select public.app_role())::text in ('admin','qc_officer'));
drop policy if exists "bills upload" on storage.objects;
create policy "bills upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-bills' and (select public.app_role())::text in ('admin','qc_officer'));
drop policy if exists "bills delete" on storage.objects;
create policy "bills delete" on storage.objects for delete to authenticated
  using (bucket_id = 'supplier-bills' and (select public.app_role())::text = 'admin');
