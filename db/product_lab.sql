-- EarthLabs Batch Management: New-product lab.
--   * product_ranges / dev_products / dev_product_lines : new products & ranges with formulation rows
--     (raw material price, expected price, +/- market deviation %) -- a sandbox, separate from the live `products` table
--   * costing budget parameters live on dev_products (batch size, loss, conversion, contingency, target cost)
--   * sku_scenarios : bottle / shape comparisons for the Unit economics "New SKU lab" tab
-- Additive only (nothing existing is changed). Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke).
-- Admin and QA/QC can use products + budget; SKU scenarios are admin only (they sit in Accounts).

-- 1) Ranges, e.g. "Herbal hand wash", "Floor cleaners"
create table if not exists public.product_ranges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists product_ranges_name_uq on public.product_ranges (lower(trim(name)));

-- 2) Products under development (idea -> trial -> approved -> launched)
create table if not exists public.dev_products (
  id uuid primary key default gen_random_uuid(),
  range_id uuid references public.product_ranges(id) on delete set null,
  base_product_id uuid references public.products(id) on delete set null,   -- live product it was copied from, if any
  name text not null check (length(trim(name)) > 0),
  variant text,
  status text not null default 'idea' check (status in ('idea','trial','approved','launched','dropped')),
  notes text,
  density numeric not null default 1 check (density > 0),                  -- kg per litre
  -- costing budget
  batch_size_l numeric not null default 25 check (batch_size_l > 0),
  process_loss_pct numeric not null default 0 check (process_loss_pct >= 0),
  labour_per_batch numeric not null default 0 check (labour_per_batch >= 0),
  power_per_batch numeric not null default 0 check (power_per_batch >= 0),
  other_per_batch numeric not null default 0 check (other_per_batch >= 0),  -- QC, consumables, etc.
  contingency_pct numeric not null default 0 check (contingency_pct >= 0),
  target_cost_per_l numeric check (target_cost_per_l is null or target_cost_per_l >= 0),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dev_products_range_idx on public.dev_products(range_id);

-- 3) Formulation rows. Prices are per kg (or per litre; 1 kg = 1 L as in the live formulations).
create table if not exists public.dev_product_lines (
  id uuid primary key default gen_random_uuid(),
  dev_product_id uuid not null references public.dev_products(id) on delete cascade,
  raw_material_id uuid references public.raw_materials(id) on delete set null,  -- null = a new ingredient not in the stock list yet
  item_name text not null check (length(trim(item_name)) > 0),
  pct numeric not null default 0 check (pct >= 0 and pct <= 100),               -- % of the batch
  current_rate numeric check (current_rate is null or current_rate >= 0),       -- raw material price today (latest bill / estimate)
  expected_rate numeric check (expected_rate is null or expected_rate >= 0),    -- price you expect to pay
  deviation_pct numeric not null default 0 check (deviation_pct >= 0 and deviation_pct <= 100),  -- +/- market swing
  notes text,
  sort_order integer not null default 0
);
create index if not exists dev_lines_product_idx on public.dev_product_lines(dev_product_id);

-- 4) Bottle / shape scenarios for the Unit economics "New SKU lab"
create table if not exists public.sku_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  dev_product_id uuid references public.dev_products(id) on delete set null,
  shared jsonb not null default '{}'::jsonb,        -- assumptions common to every option (GST, margins, bulk cost...)
  variants jsonb not null default '[]'::jsonb,      -- one entry per bottle / shape option
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) Row-level security
alter table public.product_ranges enable row level security;
alter table public.dev_products enable row level security;
alter table public.dev_product_lines enable row level security;
alter table public.sku_scenarios enable row level security;

drop policy if exists lab_ranges_rw on public.product_ranges;
create policy lab_ranges_rw on public.product_ranges for all
  using ((select app_role())::text in ('admin','qc_officer')) with check ((select app_role())::text in ('admin','qc_officer'));
drop policy if exists lab_products_rw on public.dev_products;
create policy lab_products_rw on public.dev_products for all
  using ((select app_role())::text in ('admin','qc_officer')) with check ((select app_role())::text in ('admin','qc_officer'));
drop policy if exists lab_lines_rw on public.dev_product_lines;
create policy lab_lines_rw on public.dev_product_lines for all
  using ((select app_role())::text in ('admin','qc_officer')) with check ((select app_role())::text in ('admin','qc_officer'));
drop policy if exists lab_sku_admin on public.sku_scenarios;
create policy lab_sku_admin on public.sku_scenarios for all
  using ((select app_role())::text = 'admin') with check ((select app_role())::text = 'admin');

-- 6) Save a product and all its rows in one go (atomic; runs as the caller, so the policies above apply)
create or replace function public.save_dev_product(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid := nullif(p->>'id','')::uuid; l jsonb; i int := 0;
begin
  if coalesce((select app_role())::text,'') not in ('admin','qc_officer') then
    raise exception 'Only admin or QA/QC can save products';
  end if;
  if length(trim(coalesce(p->>'name',''))) = 0 then raise exception 'Give the product a name'; end if;
  if v_id is null then
    insert into dev_products(name, variant, range_id, base_product_id, status, notes, density)
    values (trim(p->>'name'), nullif(trim(coalesce(p->>'variant','')),''), nullif(p->>'range_id','')::uuid,
            nullif(p->>'base_product_id','')::uuid, coalesce(nullif(p->>'status',''),'idea'), nullif(p->>'notes',''),
            coalesce(nullif(p->>'density','')::numeric, 1))
    returning id into v_id;
  else
    update dev_products set name = trim(p->>'name'), variant = nullif(trim(coalesce(p->>'variant','')),''),
      range_id = nullif(p->>'range_id','')::uuid, status = coalesce(nullif(p->>'status',''),'idea'),
      notes = nullif(p->>'notes',''), density = coalesce(nullif(p->>'density','')::numeric, 1), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Product not found'; end if;
    delete from dev_product_lines where dev_product_id = v_id;
  end if;
  for l in select value from jsonb_array_elements(coalesce(p->'lines','[]'::jsonb)) loop
    i := i + 1;
    insert into dev_product_lines(dev_product_id, raw_material_id, item_name, pct, current_rate, expected_rate, deviation_pct, notes, sort_order)
    values (v_id, nullif(l->>'raw_material_id','')::uuid, trim(coalesce(l->>'item_name','')),
            coalesce(nullif(l->>'pct','')::numeric, 0), nullif(l->>'current_rate','')::numeric, nullif(l->>'expected_rate','')::numeric,
            coalesce(nullif(l->>'deviation_pct','')::numeric, 0), nullif(l->>'notes',''), i);
  end loop;
  return v_id;
end $$;
revoke all on function public.save_dev_product(jsonb) from public, anon;
grant execute on function public.save_dev_product(jsonb) to authenticated;
