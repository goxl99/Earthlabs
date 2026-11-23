-- EarthLabs Accounts: party ledger & payments, expenses (scan / Excel), bank statement matching, profitability.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke) after db/sales_invoicing.sql and db/sales_po_shipto.sql. Admin only.

create or replace function public.acct_ok() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app_role())::text, '') = 'admin' $$;

-- 1) tables
create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer not null default 0,
  uploaded_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.bank_txns (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.bank_statements(id) on delete cascade,
  txn_date date not null,
  description text,
  ref text,
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  balance numeric,
  status text not null default 'unmatched' check (status in ('unmatched','matched','ignored')),
  match_kind text check (match_kind in ('payment','expense')),
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists bank_txns_stmt_idx on public.bank_txns(statement_id);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.tax_invoices(id),
  paid_on date not null default current_date,
  amount numeric not null check (amount > 0),
  mode text not null default 'bank' check (mode in ('bank','upi','cash','cheque','other')),
  ref text,
  notes text,
  bank_txn_id uuid references public.bank_txns(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists cp_customer_idx on public.customer_payments(customer_id);
create index if not exists cp_invoice_idx on public.customer_payments(invoice_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  exp_date date not null default current_date,
  vendor text,
  description text,
  category text not null default 'other' check (category in ('raw_material','packaging','marketing','transport','utilities','salary','rent','other')),
  amount numeric not null check (amount > 0),
  gst_amount numeric not null default 0 check (gst_amount >= 0),
  paid_by text not null default 'company',
  payment_mode text not null default 'bank' check (payment_mode in ('bank','upi','cash','cheque','other')),
  reimbursed boolean not null default false,
  order_id uuid references public.sales_orders(id),
  challan_id uuid references public.challans(id),
  supplier_invoice_id uuid references public.supplier_invoices(id),
  file_path text,
  source text not null default 'manual' check (source in ('manual','scan','excel','bank')),
  bank_txn_id uuid references public.bank_txns(id) on delete set null,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists exp_date_idx on public.expenses(exp_date);
create index if not exists exp_cat_idx on public.expenses(category);

alter table public.bank_txns add column if not exists payment_id uuid references public.customer_payments(id) on delete set null;
alter table public.bank_txns add column if not exists expense_id uuid references public.expenses(id) on delete set null;

do $$ declare t text; begin
  foreach t in array array['bank_statements','bank_txns','customer_payments','expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_%1$s on public.%1$I', t);
    execute format('create policy read_%1$s on public.%1$I for select using (public.acct_ok())', t);
  end loop; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-files', 'expense-files', false, 15728640, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists expense_files_read on storage.objects;
create policy expense_files_read on storage.objects for select to authenticated using (bucket_id = 'expense-files' and public.acct_ok());
drop policy if exists expense_files_write on storage.objects;
create policy expense_files_write on storage.objects for insert to authenticated with check (bucket_id = 'expense-files' and public.acct_ok());

-- 2) costing helpers (last purchase rate of each material)
create or replace function public.safe_conv(q numeric, f text, t text) returns numeric language plpgsql stable as $$
begin return convert_qty(q, f, t); exception when others then return null; end $$;

create or replace function public.rm_rate_value(p_rm uuid, p_qty numeric, p_unit text) returns numeric
language sql stable security definer set search_path = public as $$
  select safe_conv(p_qty, p_unit, lp.unit) * lp.rate from v_last_purchase lp where lp.raw_material_id = p_rm $$;

create or replace function public.batch_rm_cost(p_batch uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(rm_rate_value(m.raw_material_id, m.actual_qty, m.unit)), 0) from batch_materials m where m.batch_id = p_batch $$;

create or replace function public.pack_cost(p_product uuid, p_type text, p_size numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(rm_rate_value(pp.raw_material_id, pp.qty / pp.per_units, rm.unit)), 0)
  from product_packaging pp join raw_materials rm on rm.id = pp.raw_material_id
  where pp.product_id = p_product and pp.pack_type = p_type and pp.size_ml = p_size $$;

-- 3) views
create or replace view public.v_invoice_balance with (security_invoker = true) as
select i.id, i.invoice_no, i.invoice_date, i.order_id, o.customer_id, c.name as customer, i.total,
       coalesce((select sum(p.amount) from customer_payments p where p.invoice_id = i.id), 0) as paid,
       i.total - coalesce((select sum(p.amount) from customer_payments p where p.invoice_id = i.id), 0) as balance
from tax_invoices i join sales_orders o on o.id = i.order_id join customers c on c.id = o.customer_id
where i.status = 'issued';

create or replace view public.v_customer_balance with (security_invoker = true) as
select c.id as customer_id, c.name, c.customer_type,
       coalesce((select sum(i.total) from tax_invoices i join sales_orders o on o.id = i.order_id where o.customer_id = c.id and i.status = 'issued'), 0) as billed,
       coalesce((select sum(p.amount) from customer_payments p where p.customer_id = c.id), 0) as received
from customers c;

create or replace view public.v_rm_value with (security_invoker = true) as
select s.raw_material_id, s.name, s.category, s.unit, s.on_hand, lp.rate, lp.unit as rate_unit,
       coalesce(rm_rate_value(s.raw_material_id, s.on_hand, s.unit), 0) as value,
       (lp.rate is null) as no_rate
from raw_material_status s left join v_last_purchase lp on lp.raw_material_id = s.raw_material_id;

create or replace view public.v_sale_lines with (security_invoker = true) as
select cl.id, cl.challan_id, c.dc_no, c.dc_date, ti.invoice_no, c.order_id, o.order_no, o.customer_id, cu.name as customer,
       b.facility_id, coalesce(f.name, 'Unassigned') as facility, cl.batch_id, cl.qty, sol.rate,
       round(cl.qty * sol.rate, 2) as revenue,
       round(cl.qty * cl.size_ml / 1000.0 * coalesce(batch_rm_cost(b.id) / nullif(b.batch_size_l, 0), 0)
             + cl.qty * pack_cost(b.product_id, cl.pack_type, cl.size_ml), 2) as cogs
from challan_lines cl
join challans c on c.id = cl.challan_id and c.status = 'issued'
join sales_orders o on o.id = c.order_id
join customers cu on cu.id = o.customer_id
join batches b on b.id = cl.batch_id
left join facilities f on f.id = b.facility_id
join sales_order_lines sol on sol.id = cl.order_line_id
left join tax_invoices ti on ti.challan_id = c.id and ti.status = 'issued';

-- 4) payments
create or replace function public.record_payment(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cust uuid := nullif(p->>'customer_id', '')::uuid; v_inv uuid := nullif(p->>'invoice_id', '')::uuid; v_amt numeric := (p->>'amount')::numeric;
  v_id uuid; v_bal numeric; v_ic uuid; v_tx uuid := nullif(p->>'bank_txn_id', '')::uuid; v_mode text := coalesce(nullif(p->>'mode', ''), 'bank');
begin
  if not acct_ok() then raise exception 'Only admin can record payments'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  if v_inv is not null then
    select o.customer_id, i.total - coalesce((select sum(amount) from customer_payments where invoice_id = i.id), 0) into v_ic, v_bal
      from tax_invoices i join sales_orders o on o.id = i.order_id where i.id = v_inv;
    if v_ic is null then raise exception 'Invoice not found'; end if;
    if v_cust is null then v_cust := v_ic; end if;
    if v_ic <> v_cust then raise exception 'That invoice belongs to another customer'; end if;
    if v_amt > v_bal + 0.005 then raise exception 'Amount is more than the invoice balance (%)', v_bal; end if;
  end if;
  if v_cust is null then raise exception 'Choose a customer'; end if;
  if v_tx is not null and exists (select 1 from bank_txns where id = v_tx and status = 'matched') then raise exception 'That bank entry is already matched'; end if;
  insert into customer_payments(customer_id, invoice_id, paid_on, amount, mode, ref, notes, bank_txn_id)
  values (v_cust, v_inv, coalesce(nullif(p->>'paid_on', '')::date, current_date), v_amt, v_mode, nullif(trim(coalesce(p->>'ref', '')), ''), nullif(trim(coalesce(p->>'notes', '')), ''), v_tx)
  returning id into v_id;
  if v_tx is not null then update bank_txns set status = 'matched', match_kind = 'payment', payment_id = v_id where id = v_tx; end if;
  return v_id;
end $$;

create or replace function public.delete_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not acct_ok() then raise exception 'Only admin can delete payments'; end if;
  update bank_txns set status = 'unmatched', match_kind = null, payment_id = null where payment_id = p_id;
  delete from customer_payments where id = p_id;
end $$;

-- 5) expenses
create or replace function public.save_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_amt numeric := (p->>'amount')::numeric; v_cat text := coalesce(nullif(p->>'category', ''), 'other');
  v_tx uuid := nullif(p->>'bank_txn_id', '')::uuid; v_paid text := coalesce(nullif(trim(coalesce(p->>'paid_by', '')), ''), 'company');
begin
  if not acct_ok() then raise exception 'Only admin can record expenses'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  if v_cat not in ('raw_material','packaging','marketing','transport','utilities','salary','rent','other') then raise exception 'Unknown category %', v_cat; end if;
  if v_id is null then
    if v_tx is not null and exists (select 1 from bank_txns where id = v_tx and status = 'matched') then raise exception 'That bank entry is already matched'; end if;
    insert into expenses(exp_date, vendor, description, category, amount, gst_amount, paid_by, payment_mode, reimbursed, order_id, challan_id, supplier_invoice_id, file_path, source, bank_txn_id, notes)
    values (coalesce(nullif(p->>'exp_date', '')::date, current_date), nullif(trim(coalesce(p->>'vendor', '')), ''), nullif(trim(coalesce(p->>'description', '')), ''), v_cat, v_amt,
            coalesce(nullif(p->>'gst_amount', '')::numeric, 0), v_paid, coalesce(nullif(p->>'payment_mode', ''), 'bank'), (lower(v_paid) = 'company'),
            nullif(p->>'order_id', '')::uuid, nullif(p->>'challan_id', '')::uuid, nullif(p->>'supplier_invoice_id', '')::uuid, nullif(p->>'file_path', ''),
            coalesce(nullif(p->>'source', ''), 'manual'), v_tx, nullif(trim(coalesce(p->>'notes', '')), ''))
    returning id into v_id;
    if v_tx is not null then update bank_txns set status = 'matched', match_kind = 'expense', expense_id = v_id where id = v_tx; end if;
  else
    update expenses set exp_date = coalesce(nullif(p->>'exp_date', '')::date, exp_date), vendor = nullif(trim(coalesce(p->>'vendor', '')), ''),
      description = nullif(trim(coalesce(p->>'description', '')), ''), category = v_cat, amount = v_amt, gst_amount = coalesce(nullif(p->>'gst_amount', '')::numeric, 0),
      paid_by = v_paid, payment_mode = coalesce(nullif(p->>'payment_mode', ''), payment_mode), order_id = nullif(p->>'order_id', '')::uuid,
      challan_id = nullif(p->>'challan_id', '')::uuid, notes = nullif(trim(coalesce(p->>'notes', '')), '')
    where id = v_id;
    if not found then raise exception 'Expense not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.set_reimbursed(p_id uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not acct_ok() then raise exception 'Only admin can do this'; end if;
  update expenses set reimbursed = p_value where id = p_id;
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not acct_ok() then raise exception 'Only admin can delete expenses'; end if;
  update bank_txns set status = 'unmatched', match_kind = null, expense_id = null where expense_id = p_id;
  delete from expenses where id = p_id;
end $$;

-- rows: [{exp_date, vendor, description, category, amount, gst_amount, paid_by, payment_mode, notes}]
create or replace function public.bulk_import_expenses(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; bad jsonb := '[]'::jsonb; i int := 0;
begin
  if not acct_ok() then raise exception 'Only admin can import expenses'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    i := i + 1;
    begin
      perform save_expense(r || '{"source":"excel"}'::jsonb);
      n := n + 1;
    exception when others then
      bad := bad || jsonb_build_object('row', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('imported', n, 'failed', bad);
end $$;

-- rows: [{customer, invoice_no, paid_on, amount, mode, ref}]
create or replace function public.bulk_import_payments(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; bad jsonb := '[]'::jsonb; i int := 0; v_c uuid; v_i uuid;
begin
  if not acct_ok() then raise exception 'Only admin can import payments'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    i := i + 1; v_c := null; v_i := null;
    begin
      if nullif(trim(coalesce(r->>'invoice_no', '')), '') is not null then
        select ti.id, o.customer_id into v_i, v_c from tax_invoices ti join sales_orders o on o.id = ti.order_id where lower(ti.invoice_no) = lower(trim(r->>'invoice_no'));
        if v_i is null then raise exception 'Invoice % not found', r->>'invoice_no'; end if;
      else
        select id into v_c from customers where lower(trim(name)) = lower(trim(coalesce(r->>'customer', '')));
        if v_c is null then raise exception 'Customer "%" not found', r->>'customer'; end if;
      end if;
      perform record_payment(jsonb_build_object('customer_id', v_c, 'invoice_id', v_i, 'paid_on', r->>'paid_on', 'amount', r->>'amount', 'mode', r->>'mode', 'ref', r->>'ref'));
      n := n + 1;
    exception when others then
      bad := bad || jsonb_build_object('row', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('imported', n, 'failed', bad);
end $$;

-- 6) bank statement
-- rows: [{date, description, ref, debit, credit, balance}]
create or replace function public.import_bank_txns(p_name text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_st uuid; r jsonb; n int := 0; dup int := 0; k text; seen jsonb := '{}'::jsonb; occ int; v_deb numeric; v_cred numeric; v_date date; v_new uuid;
begin
  if not acct_ok() then raise exception 'Only admin can import a bank statement'; end if;
  insert into bank_statements(file_name) values (left(coalesce(nullif(trim(p_name), ''), 'statement'), 200)) returning id into v_st;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_date := nullif(r->>'date', '')::date; v_deb := coalesce(nullif(r->>'debit', '')::numeric, 0); v_cred := coalesce(nullif(r->>'credit', '')::numeric, 0);
    if v_date is null or (v_deb = 0 and v_cred = 0) then continue; end if;
    k := md5(concat_ws('|', v_date, coalesce(r->>'description', ''), v_deb, v_cred, coalesce(r->>'balance', '')));
    occ := coalesce((seen->>k)::int, 0) + 1; seen := seen || jsonb_build_object(k, occ);
    insert into bank_txns(statement_id, txn_date, description, ref, debit, credit, balance, dedupe_key)
    values (v_st, v_date, left(r->>'description', 500), left(r->>'ref', 100), v_deb, v_cred, nullif(r->>'balance', '')::numeric, k || '-' || occ)
    on conflict (dedupe_key) do nothing returning id into v_new;
    if v_new is null then dup := dup + 1; else n := n + 1; end if;
    v_new := null;
  end loop;
  update bank_statements set row_count = n where id = v_st;
  if n = 0 then delete from bank_statements where id = v_st; end if;
  return jsonb_build_object('statement_id', v_st, 'added', n, 'duplicates', dup);
end $$;

-- links bank entries to payments / expenses that already exist with the same amount within 5 days
create or replace function public.auto_match_bank() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; v_id uuid; m_pay int := 0; m_exp int := 0;
begin
  if not acct_ok() then raise exception 'Only admin can match the bank statement'; end if;
  for t in select * from bank_txns where status = 'unmatched' order by txn_date loop
    v_id := null;
    if t.credit > 0 then
      select id into v_id from customer_payments where bank_txn_id is null and amount = t.credit and abs(paid_on - t.txn_date) <= 5 order by abs(paid_on - t.txn_date) limit 1;
      if v_id is not null then
        update customer_payments set bank_txn_id = t.id where id = v_id;
        update bank_txns set status = 'matched', match_kind = 'payment', payment_id = v_id where id = t.id; m_pay := m_pay + 1;
      end if;
    elsif t.debit > 0 then
      select id into v_id from expenses where bank_txn_id is null and amount = t.debit and abs(exp_date - t.txn_date) <= 5 order by abs(exp_date - t.txn_date) limit 1;
      if v_id is not null then
        update expenses set bank_txn_id = t.id where id = v_id;
        update bank_txns set status = 'matched', match_kind = 'expense', expense_id = v_id where id = t.id; m_exp := m_exp + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('payments', m_pay, 'expenses', m_exp);
end $$;

create or replace function public.set_bank_txn_ignored(p_id uuid, p_ignored boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not acct_ok() then raise exception 'Only admin can do this'; end if;
  update bank_txns set status = case when p_ignored then 'ignored' else 'unmatched' end where id = p_id and status <> 'matched';
end $$;

revoke all on function public.acct_ok(), public.safe_conv(numeric,text,text), public.rm_rate_value(uuid,numeric,text), public.batch_rm_cost(uuid), public.pack_cost(uuid,text,numeric),
  public.record_payment(jsonb), public.delete_payment(uuid), public.save_expense(jsonb), public.set_reimbursed(uuid,boolean), public.delete_expense(uuid),
  public.bulk_import_expenses(jsonb), public.bulk_import_payments(jsonb), public.import_bank_txns(text,jsonb), public.auto_match_bank(), public.set_bank_txn_ignored(uuid,boolean) from public, anon;
grant execute on function public.record_payment(jsonb), public.delete_payment(uuid), public.save_expense(jsonb), public.set_reimbursed(uuid,boolean), public.delete_expense(uuid),
  public.bulk_import_expenses(jsonb), public.bulk_import_payments(jsonb), public.import_bank_txns(text,jsonb), public.auto_match_bank(), public.set_bank_txn_ignored(uuid,boolean),
  public.acct_ok(), public.batch_rm_cost(uuid), public.pack_cost(uuid,text,numeric), public.rm_rate_value(uuid,numeric,text), public.safe_conv(numeric,text,text) to authenticated;
