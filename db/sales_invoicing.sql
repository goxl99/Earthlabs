-- EarthLabs Batch Management: customers, orders (incl. EPDMS), proforma, delivery challan, GST tax invoice.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke) AFTER the earlier db/*.sql files.
-- Flow: order -> (proforma, optional) -> challan (compulsory, takes finished goods out of stock by batch) -> tax invoice (one per challan).

-- 1) Company details used on documents (editable in the app by admin)
insert into public.app_settings(key, value) values
  ('co_legal_name', 'Earthlabs Innovative Products Pvt. Ltd.'),
  ('co_address', 'Shed No. 4, J D Patel Estate, IPCL Road, Ranoli, Vadodara, Gujarat 391350'),
  ('co_gstin', '24AAJCE7904M1ZB'), ('co_pan', 'AAJCE7904M'),
  ('co_state', 'Gujarat'), ('co_state_code', '24'), ('co_email', 'info@earthlabsproducts.com'),
  ('co_bank_account_name', 'M/S Earthlabs Innovative Products Pvt. Ltd.'), ('co_bank_name', 'ICICI Bank'),
  ('co_bank_account_no', '753405000580'), ('co_bank_ifsc', 'ICIC0007534'),
  ('co_terms', 'Payment terms, delivery timeline and freight as mutually agreed.')
on conflict (key) do nothing;

-- 2) GST state codes
create or replace function public.gst_state_code(p text) returns text language sql immutable as $$
  select v.code from (values
    ('jammu and kashmir','01'),('himachal pradesh','02'),('punjab','03'),('chandigarh','04'),('uttarakhand','05'),('haryana','06'),
    ('delhi','07'),('rajasthan','08'),('uttar pradesh','09'),('bihar','10'),('sikkim','11'),('arunachal pradesh','12'),('nagaland','13'),
    ('manipur','14'),('mizoram','15'),('tripura','16'),('meghalaya','17'),('assam','18'),('west bengal','19'),('jharkhand','20'),
    ('odisha','21'),('chhattisgarh','22'),('madhya pradesh','23'),('gujarat','24'),('dadra and nagar haveli and daman and diu','26'),
    ('maharashtra','27'),('karnataka','29'),('goa','30'),('lakshadweep','31'),('kerala','32'),('tamil nadu','33'),('puducherry','34'),
    ('andaman and nicobar islands','35'),('telangana','36'),('andhra pradesh','37'),('ladakh','38')) v(n, code)
  where v.n = lower(trim(p))
$$;

-- 3) Customers: extra details (existing rows and the Customer & Dispatch page keep working)
alter table public.customers add column if not exists customer_type text not null default 'direct' check (customer_type in ('distributor','dealer','direct'));
alter table public.customers add column if not exists gstin text;
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists state_code text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists contact_name text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists epdms_partner_id text;
create unique index if not exists customers_epdms_uniq on public.customers(epdms_partner_id) where epdms_partner_id is not null;

-- 4) Orders, proformas, challans, tax invoices
create sequence if not exists public.sales_order_seq;
create sequence if not exists public.proforma_seq;
create sequence if not exists public.challan_seq;
create sequence if not exists public.tax_invoice_seq;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('SO-' || lpad(nextval('public.sales_order_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id),
  source text not null default 'manual' check (source in ('manual','epdms')),
  epdms_order_id text unique,
  epdms_status text,
  epdms_invoice_no text,
  customer_po_no text,
  order_date date not null default current_date,
  status text not null default 'open' check (status in ('open','part_delivered','delivered','cancelled')),
  needs_proforma boolean not null default false,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  line_no integer not null default 1,
  description text not null,
  epdms_sku text,
  hsn text not null default '340130',
  gst_pct numeric not null default 18 check (gst_pct >= 0),
  qty numeric not null check (qty > 0),
  rate numeric not null check (rate >= 0)
);
create index if not exists sol_order_idx on public.sales_order_lines(order_id);

create table if not exists public.proformas (
  id uuid primary key default gen_random_uuid(),
  pi_no text not null unique default ('EL-PI-' || lpad(nextval('public.proforma_seq')::text, 3, '0')),
  order_id uuid not null unique references public.sales_orders(id),
  pi_date date not null default current_date,
  data jsonb not null,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.challans (
  id uuid primary key default gen_random_uuid(),
  dc_no text not null unique default ('EL-DC-' || lpad(nextval('public.challan_seq')::text, 3, '0')),
  order_id uuid not null references public.sales_orders(id),
  dispatch_id uuid references public.dispatches(id),
  dc_date date not null default current_date,
  vehicle text, transporter text, lr_no text, remarks text,
  data jsonb not null,
  status text not null default 'issued' check (status in ('issued','cancelled')),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.challan_lines (
  id uuid primary key default gen_random_uuid(),
  challan_id uuid not null references public.challans(id) on delete cascade,
  order_line_id uuid not null references public.sales_order_lines(id),
  batch_id uuid not null references public.batches(id),
  pack_type text not null, size_ml numeric not null,
  qty numeric not null check (qty > 0)
);
create index if not exists cl_challan_idx on public.challan_lines(challan_id);
create index if not exists cl_line_idx on public.challan_lines(order_line_id);
create table if not exists public.tax_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default ('ELI/' || lpad(nextval('public.tax_invoice_seq')::text, 3, '0')),
  order_id uuid not null references public.sales_orders(id),
  challan_id uuid not null unique references public.challans(id),
  proforma_id uuid references public.proformas(id),
  invoice_date date not null default current_date,
  data jsonb not null,
  taxable numeric not null, tax numeric not null, total numeric not null,
  status text not null default 'issued' check (status in ('issued','cancelled')),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

-- read access for admin and QA/QC only; all writes go through the functions below
do $$ declare t text; begin
  foreach t in array array['sales_orders','sales_order_lines','proformas','challans','challan_lines','tax_invoices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_%1$s on public.%1$I', t);
    execute format('create policy read_%1$s on public.%1$I for select using ((select app_role())::text in (''admin'',''qc_officer''))', t);
  end loop; end $$;

create or replace view public.v_sales_order_lines with (security_invoker = true) as
select l.*, coalesce((select sum(cl.qty) from challan_lines cl join challans c on c.id = cl.challan_id
                      where cl.order_line_id = l.id and c.status <> 'cancelled'), 0) as delivered_qty
from sales_order_lines l;

-- 5) Helpers
create or replace function public.sales_role_ok() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select app_role())::text, '') in ('admin','qc_officer') $$;

-- builds the snapshot (parties, tax split, totals) stored on every document
create or replace function public.sales_doc_data(p_order uuid, p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o sales_orders; c customers; s jsonb; inter boolean; sc text; bc text; rec record; lines jsonb := '[]'::jsonb;
  tx numeric; tg numeric; cg numeric; sg numeric; ig numeric; ttx numeric := 0; tcg numeric := 0; tsg numeric := 0; tig numeric := 0; n int := 0;
begin
  select * into o from sales_orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  select * into c from customers where id = o.customer_id;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into s from app_settings where left(key, 3) = 'co_';
  sc := coalesce(s->>'co_state_code', '24');
  bc := coalesce(c.state_code, gst_state_code(c.state));
  if bc is null then raise exception 'Set the customer''s state (or GSTIN) before issuing documents'; end if;
  inter := sc <> bc;
  for rec in select l.*, x.qty as dq from jsonb_to_recordset(p_lines) as x(order_line_id uuid, qty numeric)
             join sales_order_lines l on l.id = x.order_line_id and l.order_id = p_order order by l.line_no, l.id loop
    n := n + 1;
    tx := round(rec.dq * rec.rate, 2); tg := round(tx * rec.gst_pct / 100, 2);
    if inter then ig := tg; cg := 0; sg := 0; else cg := round(tg / 2, 2); sg := tg - cg; ig := 0; end if;
    lines := lines || jsonb_build_object('n', n, 'order_line_id', rec.id, 'desc', rec.description, 'hsn', rec.hsn, 'gst_pct', rec.gst_pct,
      'qty', rec.dq, 'rate', rec.rate, 'taxable', tx, 'cgst', cg, 'sgst', sg, 'igst', ig, 'total', tx + cg + sg + ig);
    ttx := ttx + tx; tcg := tcg + cg; tsg := tsg + sg; tig := tig + ig;
  end loop;
  if n = 0 then raise exception 'No lines to include'; end if;
  return jsonb_build_object(
    'seller', jsonb_build_object('name', s->>'co_legal_name', 'address', s->>'co_address', 'gstin', s->>'co_gstin', 'pan', s->>'co_pan',
        'state', s->>'co_state', 'state_code', sc, 'email', s->>'co_email'),
    'buyer', jsonb_build_object('name', c.name, 'address', coalesce(c.address, c.location), 'gstin', c.gstin, 'state', c.state, 'state_code', bc,
        'contact', c.contact_name, 'phone', c.phone, 'email', c.email),
    'place_of_supply', jsonb_build_object('state', c.state, 'code', bc),
    'inter_state', inter, 'po_no', o.customer_po_no, 'order_no', o.order_no, 'order_date', o.order_date,
    'lines', lines,
    'totals', jsonb_build_object('taxable', ttx, 'cgst', tcg, 'sgst', tsg, 'igst', tig, 'total', ttx + tcg + tsg + tig),
    'bank', jsonb_build_object('account_name', s->>'co_bank_account_name', 'bank', s->>'co_bank_name', 'account_no', s->>'co_bank_account_no', 'ifsc', s->>'co_bank_ifsc'),
    'terms_extra', s->>'co_terms');
end $$;

-- 6) Customers
create or replace function public.save_customer(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_name text := trim(coalesce(p->>'name', '')); v_gst text := upper(nullif(trim(coalesce(p->>'gstin', '')), ''));
  v_state text := nullif(trim(coalesce(p->>'state', '')), ''); v_code text; v_type text := coalesce(nullif(p->>'customer_type', ''), 'direct');
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can manage customers'; end if;
  if v_name = '' then raise exception 'Customer name is required'; end if;
  if v_type not in ('distributor','dealer','direct') then raise exception 'Bad customer type'; end if;
  if v_gst is not null and v_gst !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then raise exception 'GSTIN % does not look valid', v_gst; end if;
  v_code := coalesce(case when v_gst is not null then substr(v_gst, 1, 2) end, gst_state_code(v_state));
  if v_state is null and v_code is null then raise exception 'Select the customer''s state'; end if;
  if v_state is not null and gst_state_code(v_state) is null and v_gst is null then raise exception 'Unknown state %', v_state; end if;
  if v_id is null then
    insert into customers(name, location, customer_type, gstin, state, state_code, address, contact_name, phone, email)
    values (v_name, coalesce(nullif(trim(coalesce(p->>'location','')), ''), v_state), v_type, v_gst, v_state, v_code,
            nullif(trim(coalesce(p->>'address','')), ''), nullif(trim(coalesce(p->>'contact_name','')), ''),
            nullif(trim(coalesce(p->>'phone','')), ''), nullif(trim(coalesce(p->>'email','')), ''))
    returning id into v_id;
  else
    update customers set name = v_name, location = coalesce(nullif(trim(coalesce(p->>'location','')), ''), v_state, location), customer_type = v_type,
      gstin = v_gst, state = v_state, state_code = v_code, address = nullif(trim(coalesce(p->>'address','')), ''),
      contact_name = nullif(trim(coalesce(p->>'contact_name','')), ''), phone = nullif(trim(coalesce(p->>'phone','')), ''),
      email = nullif(trim(coalesce(p->>'email','')), '') where id = v_id;
    if not found then raise exception 'Customer not found'; end if;
  end if;
  return v_id;
end $$;

-- 7) Orders
create or replace function public.create_sales_order(p_header jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cust customers; v_n int;
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can create orders'; end if;
  select * into v_cust from customers where id = nullif(p_header->>'customer_id', '')::uuid;
  if not found then raise exception 'Choose a customer'; end if;
  select count(*) into v_n from jsonb_to_recordset(p_lines) as x(description text, qty numeric, rate numeric)
    where length(trim(coalesce(x.description, ''))) > 0 and x.qty > 0 and x.rate >= 0;
  if v_n = 0 or v_n <> jsonb_array_length(p_lines) then raise exception 'Every line needs a description, a quantity above zero and a rate'; end if;
  insert into sales_orders(customer_id, source, customer_po_no, order_date, needs_proforma, notes)
  values (v_cust.id, 'manual', nullif(trim(coalesce(p_header->>'customer_po_no', '')), ''),
          coalesce(nullif(p_header->>'order_date', '')::date, current_date),
          coalesce((p_header->>'needs_proforma')::boolean, v_cust.epdms_partner_id is null),
          nullif(trim(coalesce(p_header->>'notes', '')), ''))
  returning id into v_id;
  insert into sales_order_lines(order_id, line_no, description, hsn, gst_pct, qty, rate)
    select v_id, row_number() over (), trim(x.description), coalesce(nullif(trim(x.hsn), ''), '340130'), coalesce(x.gst_pct, 18), x.qty, x.rate
    from jsonb_to_recordset(p_lines) as x(description text, hsn text, gst_pct numeric, qty numeric, rate numeric);
  return v_id;
end $$;

create or replace function public.cancel_sales_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can cancel orders'; end if;
  if exists (select 1 from challans where order_id = p_order and status <> 'cancelled') then raise exception 'This order already has a challan'; end if;
  update sales_orders set status = 'cancelled' where id = p_order and status = 'open';
  if not found then raise exception 'Only open orders can be cancelled'; end if;
end $$;

-- 8) Proforma (optional)
create or replace function public.create_proforma(p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; o sales_orders;
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can issue a proforma'; end if;
  select * into o from sales_orders where id = p_order;
  if not found or o.status = 'cancelled' then raise exception 'Order not found or cancelled'; end if;
  if exists (select 1 from proformas where order_id = p_order) then raise exception 'A proforma was already issued for this order'; end if;
  insert into proformas(order_id, data)
  values (p_order, sales_doc_data(p_order, (select jsonb_agg(jsonb_build_object('order_line_id', id, 'qty', qty)) from sales_order_lines where order_id = p_order)))
  returning id into v_id;
  return v_id;
end $$;

-- 9) Delivery challan (compulsory): also records the dispatch, so finished-goods stock is reduced by batch
create or replace function public.create_challan(p_order uuid, p_header jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o sales_orders; v_disp uuid; v_id uuid; v_dc text; x record; v_left numeric; data jsonb; bl jsonb;
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can issue a challan'; end if;
  select * into o from sales_orders where id = p_order for update;
  if not found or o.status = 'cancelled' then raise exception 'Order not found or cancelled'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one batch line'; end if;
  for x in select l.id, l.description, sum(q.qty) as q from jsonb_to_recordset(p_lines) as q(order_line_id uuid, batch_id uuid, pack_type text, size_ml numeric, qty numeric)
           join sales_order_lines l on l.id = q.order_line_id and l.order_id = p_order group by l.id, l.description loop
    select l.qty - coalesce((select sum(cl.qty) from challan_lines cl join challans c on c.id = cl.challan_id where cl.order_line_id = l.id and c.status <> 'cancelled'), 0)
      into v_left from sales_order_lines l where l.id = x.id;
    if x.q > v_left then raise exception 'Only % left to deliver for "%"', v_left, x.description; end if;
  end loop;
  if (select count(*) from jsonb_to_recordset(p_lines) as q(order_line_id uuid, batch_id uuid, qty numeric)
      join sales_order_lines l on l.id = q.order_line_id and l.order_id = p_order where q.qty > 0 and q.batch_id is not null) <> jsonb_array_length(p_lines) then
    raise exception 'Every line needs an order item, a batch and a quantity above zero';
  end if;
  data := sales_doc_data(p_order, (select jsonb_agg(jsonb_build_object('order_line_id', order_line_id, 'qty', q)) from
            (select q.order_line_id, sum(q.qty) q from jsonb_to_recordset(p_lines) as q(order_line_id uuid, qty numeric) group by 1) z));
  select jsonb_agg(jsonb_build_object('order_line_id', q.order_line_id, 'batch_code', b.batch_code, 'pack', q.size_ml || ' mL ' || q.pack_type, 'qty', q.qty))
    into bl from jsonb_to_recordset(p_lines) as q(order_line_id uuid, batch_id uuid, pack_type text, size_ml numeric, qty numeric) join batches b on b.id = q.batch_id;
  insert into challans(order_id, dc_date, vehicle, transporter, lr_no, remarks, data)
  values (p_order, coalesce(nullif(p_header->>'dc_date', '')::date, current_date), nullif(trim(coalesce(p_header->>'vehicle','')), ''),
          nullif(trim(coalesce(p_header->>'transporter','')), ''), nullif(trim(coalesce(p_header->>'lr_no','')), ''),
          nullif(trim(coalesce(p_header->>'remarks','')), ''), data || jsonb_build_object('batches', bl))
  returning id, dc_no into v_id, v_dc;
  insert into dispatches(dispatch_date, customer_id, invoice_no, remarks, created_by)
  values (coalesce(nullif(p_header->>'dc_date', '')::date, current_date), o.customer_id, v_dc, 'Challan for ' || o.order_no, auth.uid()) returning id into v_disp;
  insert into dispatch_lines(dispatch_id, batch_id, pack_type, size_ml, qty)
    select v_disp, q.batch_id, q.pack_type, q.size_ml, q.qty from jsonb_to_recordset(p_lines) as q(batch_id uuid, pack_type text, size_ml numeric, qty numeric);
  insert into challan_lines(challan_id, order_line_id, batch_id, pack_type, size_ml, qty)
    select v_id, q.order_line_id, q.batch_id, q.pack_type, q.size_ml, q.qty from jsonb_to_recordset(p_lines) as q(order_line_id uuid, batch_id uuid, pack_type text, size_ml numeric, qty numeric);
  update challans set dispatch_id = v_disp where id = v_id;
  update sales_orders set status = case when not exists (
      select 1 from v_sales_order_lines v where v.order_id = p_order and v.delivered_qty < v.qty) then 'delivered' else 'part_delivered' end
    where id = p_order;
  return v_id;
end $$;

-- 10) Tax invoice: only from a challan, one per challan
create or replace function public.create_tax_invoice(p_challan uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c challans; v_id uuid; pf proformas; data jsonb;
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can issue a tax invoice'; end if;
  select * into c from challans where id = p_challan for update;
  if not found or c.status <> 'issued' then raise exception 'A valid challan is required before a tax invoice'; end if;
  if exists (select 1 from tax_invoices where challan_id = p_challan) then raise exception 'This challan already has a tax invoice'; end if;
  select * into pf from proformas where order_id = c.order_id;
  data := sales_doc_data(c.order_id, (select jsonb_agg(jsonb_build_object('order_line_id', order_line_id, 'qty', q))
            from (select order_line_id, sum(qty) q from challan_lines where challan_id = p_challan group by 1) z));
  data := data || jsonb_build_object('challan_ref', jsonb_build_object('no', c.dc_no, 'date', c.dc_date),
            'proforma_ref', case when pf.id is not null then jsonb_build_object('no', pf.pi_no, 'date', pf.pi_date) end);
  insert into tax_invoices(order_id, challan_id, proforma_id, invoice_date, data, taxable, tax, total)
  values (c.order_id, p_challan, pf.id, coalesce(p_date, current_date), data, (data->'totals'->>'taxable')::numeric,
          (data->'totals'->>'cgst')::numeric + (data->'totals'->>'sgst')::numeric + (data->'totals'->>'igst')::numeric, (data->'totals'->>'total')::numeric)
  returning id into v_id;
  return v_id;
end $$;

-- 11) EPDMS import (called by the sync-epdms-orders function with the signed-in user's login)
create or replace function public.import_epdms_orders(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr jsonb; od jsonb; ln jsonb; v_cust uuid; v_ord uuid; n_o int := 0; n_s int := 0; n_c int := 0; v_pct numeric; v_state text; v_gst text; v_i int;
begin
  if not sales_role_ok() then raise exception 'Only admin or QA/QC can fetch EPDMS orders'; end if;
  for pr in select * from jsonb_array_elements(coalesce(p_payload->'partners', '[]'::jsonb)) loop
    v_state := nullif(trim(coalesce(pr->>'state', '')), ''); v_gst := upper(nullif(trim(coalesce(pr->>'gstin', '')), ''));
    if v_gst is not null and v_gst !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then v_gst := null; end if;
    select id into v_cust from customers where epdms_partner_id = pr->>'id';
    if v_cust is null then select id into v_cust from customers where lower(trim(name)) = lower(trim(pr->>'name')) and epdms_partner_id is null; end if;
    if v_cust is null then
      insert into customers(name, location, customer_type, gstin, state, state_code, address, contact_name, phone, email, epdms_partner_id)
      values (trim(pr->>'name'), coalesce(nullif(trim(coalesce(pr->>'district','')), ''), v_state),
              case when pr->>'type_code' ilike 'DLR%' then 'dealer' else 'distributor' end, v_gst, v_state,
              coalesce(case when v_gst is not null then substr(v_gst, 1, 2) end, gst_state_code(v_state)),
              nullif(trim(coalesce(pr->>'address','')), ''), nullif(trim(coalesce(pr->>'contact_name','')), ''),
              nullif(trim(coalesce(pr->>'phone','')), ''), nullif(trim(coalesce(pr->>'email','')), ''), pr->>'id');
      n_c := n_c + 1;
    else
      update customers set epdms_partner_id = pr->>'id', gstin = coalesce(gstin, v_gst), state = coalesce(state, v_state),
        state_code = coalesce(state_code, case when v_gst is not null then substr(v_gst, 1, 2) end, gst_state_code(v_state)),
        address = coalesce(address, nullif(trim(coalesce(pr->>'address','')), '')), phone = coalesce(phone, nullif(trim(coalesce(pr->>'phone','')), '')),
        email = coalesce(email, nullif(trim(coalesce(pr->>'email','')), '')), contact_name = coalesce(contact_name, nullif(trim(coalesce(pr->>'contact_name','')), ''))
      where id = v_cust;
    end if;
  end loop;
  for od in select * from jsonb_array_elements(coalesce(p_payload->'orders', '[]'::jsonb)) loop
    if exists (select 1 from sales_orders where epdms_order_id = od->>'id') then n_s := n_s + 1; continue; end if;
    select id into v_cust from customers where epdms_partner_id = od->>'partner_id';
    if v_cust is null then n_s := n_s + 1; continue; end if;
    v_pct := case when coalesce((od->>'net')::numeric, 0) > 0 then round((od->>'gst')::numeric / (od->>'net')::numeric * 100) else 18 end;
    insert into sales_orders(customer_id, source, epdms_order_id, epdms_status, epdms_invoice_no, customer_po_no, order_date, needs_proforma, notes)
    values (v_cust, 'epdms', od->>'id', od->>'status', nullif(od->>'invoice_no', ''), od->>'id',
            coalesce(nullif(od->>'created_at', '')::timestamptz::date, current_date), false, 'Fetched from EPDMS')
    returning id into v_ord;
    v_i := 0;
    for ln in select * from jsonb_array_elements(coalesce(od->'lines', '[]'::jsonb)) loop
      if coalesce((ln->>'units')::numeric, 0) <= 0 then continue; end if;
      v_i := v_i + 1;
      insert into sales_order_lines(order_id, line_no, description, epdms_sku, hsn, gst_pct, qty, rate)
      values (v_ord, v_i, coalesce(nullif(ln->>'name', ''), ln->>'sku'), ln->>'sku', '340130', case when v_pct between 0 and 40 then v_pct else 18 end,
              (ln->>'units')::numeric, coalesce((ln->>'unit_price')::numeric, 0));
    end loop;
    if v_i = 0 then delete from sales_orders where id = v_ord; n_s := n_s + 1; else n_o := n_o + 1; end if;
  end loop;
  return jsonb_build_object('orders_new', n_o, 'orders_skipped', n_s, 'customers_new', n_c);
end $$;

revoke all on function public.sales_role_ok(), public.sales_doc_data(uuid,jsonb), public.save_customer(jsonb), public.create_sales_order(jsonb,jsonb),
  public.cancel_sales_order(uuid), public.create_proforma(uuid), public.create_challan(uuid,jsonb,jsonb), public.create_tax_invoice(uuid,date),
  public.import_epdms_orders(jsonb) from public, anon;
grant execute on function public.save_customer(jsonb), public.create_sales_order(jsonb,jsonb), public.cancel_sales_order(uuid), public.create_proforma(uuid),
  public.create_challan(uuid,jsonb,jsonb), public.create_tax_invoice(uuid,date), public.import_epdms_orders(jsonb) to authenticated;
revoke all on function public.gst_state_code(text) from public, anon;
grant execute on function public.gst_state_code(text) to authenticated;
