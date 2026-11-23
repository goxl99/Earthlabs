-- EarthLabs: asset register (machinery, drums / containers, vehicles, ...). Run once after db/accounts.sql. Admin only.
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in ('raw_material','packaging','marketing','transport','utilities','salary','rent','asset','other'));

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asset_type text not null default 'machinery' check (asset_type in ('machinery','drums_containers','vehicle','furniture','computer','tools','building','other')),
  qty numeric not null default 1 check (qty > 0),
  purchase_date date not null default current_date,
  vendor text,
  cost numeric not null check (cost >= 0),
  gst_amount numeric not null default 0 check (gst_amount >= 0),
  dep_rate numeric not null default 0 check (dep_rate >= 0 and dep_rate <= 100),
  location text,
  status text not null default 'in_use' check (status in ('in_use','sold','scrapped')),
  disposed_on date,
  sale_value numeric,
  notes text,
  file_path text,
  expense_id uuid references public.expenses(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.assets enable row level security;
drop policy if exists read_assets on public.assets;
create policy read_assets on public.assets for select using (public.acct_ok());

-- depreciation to a date, straight line (per year %), stopping at the cost and at disposal
create or replace function public.asset_dep_at(p_cost numeric, p_rate numeric, p_bought date, p_disposed date, p_on date) returns numeric
language sql immutable as $$
  select least(p_cost, p_cost * p_rate / 100.0 / 365.0 * greatest(0, least(p_on, coalesce(p_disposed, p_on)) - p_bought)) $$;

create or replace view public.v_assets with (security_invoker = true) as
select a.*, round(asset_dep_at(a.cost, a.dep_rate, a.purchase_date, a.disposed_on, current_date), 2) as depreciation,
       case when a.status = 'in_use' then round(a.cost - asset_dep_at(a.cost, a.dep_rate, a.purchase_date, null, current_date), 2) else 0 end as book_value
from assets a;

create or replace function public.asset_dep_between(p_from date, p_to date) returns numeric
language sql stable security definer set search_path = public as $$
  select case when acct_ok() then coalesce(sum(asset_dep_at(cost, dep_rate, purchase_date, disposed_on, p_to) - asset_dep_at(cost, dep_rate, purchase_date, disposed_on, p_from)), 0) else 0 end from assets $$;

-- expenses: category 'asset' also keeps the asset register in step
create or replace function public.save_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_amt numeric := (p->>'amount')::numeric; v_cat text := coalesce(nullif(p->>'category', ''), 'other');
  v_tx uuid := nullif(p->>'bank_txn_id', '')::uuid; v_paid text := coalesce(nullif(trim(coalesce(p->>'paid_by', '')), ''), 'company');
  v_date date; v_vendor text; v_desc text; v_atype text := coalesce(nullif(p->>'asset_type', ''), 'machinery');
begin
  if not acct_ok() then raise exception 'Only admin can record expenses'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  if v_cat not in ('raw_material','packaging','marketing','transport','utilities','salary','rent','asset','other') then raise exception 'Unknown category %', v_cat; end if;
  v_vendor := nullif(trim(coalesce(p->>'vendor', '')), ''); v_desc := nullif(trim(coalesce(p->>'description', '')), '');
  if v_id is null then
    v_date := coalesce(nullif(p->>'exp_date', '')::date, current_date);
    if v_tx is not null and exists (select 1 from bank_txns where id = v_tx and status = 'matched') then raise exception 'That bank entry is already matched'; end if;
    insert into expenses(exp_date, vendor, description, category, amount, gst_amount, paid_by, payment_mode, reimbursed, order_id, challan_id, supplier_invoice_id, file_path, source, bank_txn_id, notes)
    values (v_date, v_vendor, v_desc, v_cat, v_amt, coalesce(nullif(p->>'gst_amount', '')::numeric, 0), v_paid, coalesce(nullif(p->>'payment_mode', ''), 'bank'), (lower(v_paid) = 'company'),
            nullif(p->>'order_id', '')::uuid, nullif(p->>'challan_id', '')::uuid, nullif(p->>'supplier_invoice_id', '')::uuid, nullif(p->>'file_path', ''),
            coalesce(nullif(p->>'source', ''), 'manual'), v_tx, nullif(trim(coalesce(p->>'notes', '')), ''))
    returning id into v_id;
    if v_tx is not null then update bank_txns set status = 'matched', match_kind = 'expense', expense_id = v_id where id = v_tx; end if;
  else
    update expenses set exp_date = coalesce(nullif(p->>'exp_date', '')::date, exp_date), vendor = v_vendor, description = v_desc, category = v_cat, amount = v_amt, gst_amount = coalesce(nullif(p->>'gst_amount', '')::numeric, 0),
      paid_by = v_paid, payment_mode = coalesce(nullif(p->>'payment_mode', ''), payment_mode), order_id = nullif(p->>'order_id', '')::uuid,
      challan_id = nullif(p->>'challan_id', '')::uuid, notes = nullif(trim(coalesce(p->>'notes', '')), '')
    where id = v_id returning exp_date into v_date;
    if not found then raise exception 'Expense not found'; end if;
  end if;
  if v_cat = 'asset' then
    if exists (select 1 from assets where expense_id = v_id) then
      update assets set cost = v_amt, gst_amount = coalesce(nullif(p->>'gst_amount', '')::numeric, 0), purchase_date = v_date, vendor = v_vendor where expense_id = v_id;
    else
      insert into assets(name, asset_type, qty, purchase_date, vendor, cost, gst_amount, dep_rate, expense_id, file_path)
      values (coalesce(v_desc, v_vendor, 'Asset'), v_atype, greatest(coalesce(nullif(p->>'qty', '')::numeric, 1), 0.001), v_date, v_vendor, v_amt, coalesce(nullif(p->>'gst_amount', '')::numeric, 0),
              least(greatest(coalesce(nullif(p->>'dep_rate', '')::numeric, 0), 0), 100), v_id, nullif(p->>'file_path', ''));
    end if;
  else
    delete from assets where expense_id = v_id;
  end if;
  return v_id;
end $$;

-- add or edit an asset. New and paid: also records the payment as an expense. already_owned = true: register only (opening asset).
create or replace function public.save_asset(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_cost numeric := coalesce(nullif(p->>'cost', '')::numeric, 0); v_gst numeric := coalesce(nullif(p->>'gst_amount', '')::numeric, 0);
  v_date date := coalesce(nullif(p->>'purchase_date', '')::date, current_date); v_name text := nullif(trim(coalesce(p->>'name', '')), ''); v_exp uuid;
  v_paid text := coalesce(nullif(trim(coalesce(p->>'paid_by', '')), ''), 'Company');
begin
  if not acct_ok() then raise exception 'Only admin can manage assets'; end if;
  if v_name is null then raise exception 'Give the asset a name'; end if;
  if v_cost < 0 then raise exception 'Cost cannot be negative'; end if;
  if v_id is null then
    if coalesce((p->>'already_owned')::boolean, false) or v_cost = 0 then
      insert into assets(name, asset_type, qty, purchase_date, vendor, cost, gst_amount, dep_rate, location, notes, file_path)
      values (v_name, coalesce(nullif(p->>'asset_type', ''), 'machinery'), greatest(coalesce(nullif(p->>'qty', '')::numeric, 1), 0.001), v_date, nullif(trim(coalesce(p->>'vendor', '')), ''), v_cost, v_gst,
              least(greatest(coalesce(nullif(p->>'dep_rate', '')::numeric, 0), 0), 100), nullif(trim(coalesce(p->>'location', '')), ''), nullif(trim(coalesce(p->>'notes', '')), ''), nullif(p->>'file_path', ''))
      returning id into v_id;
    else
      v_exp := save_expense(jsonb_build_object('exp_date', v_date, 'vendor', p->>'vendor', 'description', v_name, 'category', 'asset', 'amount', v_cost, 'gst_amount', v_gst, 'paid_by', v_paid,
                'payment_mode', coalesce(nullif(p->>'payment_mode', ''), 'bank'), 'file_path', p->>'file_path', 'asset_type', p->>'asset_type', 'qty', p->>'qty', 'dep_rate', p->>'dep_rate', 'notes', p->>'notes'));
      select id into v_id from assets where expense_id = v_exp;
      update assets set location = nullif(trim(coalesce(p->>'location', '')), '') where id = v_id;
    end if;
  else
    update assets set name = v_name, asset_type = coalesce(nullif(p->>'asset_type', ''), asset_type), qty = greatest(coalesce(nullif(p->>'qty', '')::numeric, qty), 0.001), purchase_date = v_date,
      vendor = nullif(trim(coalesce(p->>'vendor', '')), ''), cost = v_cost, gst_amount = v_gst, dep_rate = least(greatest(coalesce(nullif(p->>'dep_rate', '')::numeric, dep_rate), 0), 100),
      location = nullif(trim(coalesce(p->>'location', '')), ''), notes = nullif(trim(coalesce(p->>'notes', '')), '')
    where id = v_id returning expense_id into v_exp;
    if not found then raise exception 'Asset not found'; end if;
    if v_exp is not null then update expenses set amount = greatest(v_cost, 0.01), gst_amount = v_gst, exp_date = v_date, vendor = nullif(trim(coalesce(p->>'vendor', '')), ''), description = v_name where id = v_exp; end if;
  end if;
  return v_id;
end $$;

-- mark an asset sold or scrapped (or back in use)
create or replace function public.set_asset_status(p_id uuid, p_status text, p_on date default null, p_sale numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not acct_ok() then raise exception 'Only admin can manage assets'; end if;
  if p_status not in ('in_use','sold','scrapped') then raise exception 'Unknown status'; end if;
  update assets set status = p_status, disposed_on = case when p_status = 'in_use' then null else coalesce(p_on, current_date) end, sale_value = case when p_status = 'sold' then p_sale else null end where id = p_id;
  if not found then raise exception 'Asset not found'; end if;
end $$;

-- deleting an asset also removes the payment entry created with it
create or replace function public.delete_asset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_exp uuid;
begin
  if not acct_ok() then raise exception 'Only admin can manage assets'; end if;
  select expense_id into v_exp from assets where id = p_id;
  if v_exp is not null then perform delete_expense(v_exp); else delete from assets where id = p_id; end if;
end $$;

revoke all on function public.asset_dep_at(numeric,numeric,date,date,date), public.asset_dep_between(date,date), public.save_asset(jsonb), public.set_asset_status(uuid,text,date,numeric), public.delete_asset(uuid) from public, anon;
grant execute on function public.asset_dep_at(numeric,numeric,date,date,date), public.asset_dep_between(date,date), public.save_asset(jsonb), public.set_asset_status(uuid,text,date,numeric), public.delete_asset(uuid) to authenticated;
