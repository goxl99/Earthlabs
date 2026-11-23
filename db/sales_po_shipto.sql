-- Ship-to address on customers; purchase-order file on orders (read automatically by the read-po function).
alter table public.customers add column if not exists ship_to_address text;
alter table public.sales_orders add column if not exists po_file_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-pos', 'customer-pos', false, 15728640, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists customer_pos_read on storage.objects;
create policy customer_pos_read on storage.objects for select to authenticated
  using (bucket_id = 'customer-pos' and (select public.app_role())::text in ('admin','qc_officer'));
drop policy if exists customer_pos_write on storage.objects;
create policy customer_pos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-pos' and (select public.app_role())::text in ('admin','qc_officer'));

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
        'ship_to', coalesce(c.ship_to_address, c.address, c.location), 'contact', c.contact_name, 'phone', c.phone, 'email', c.email),
    'place_of_supply', jsonb_build_object('state', c.state, 'code', bc),
    'inter_state', inter, 'po_no', o.customer_po_no, 'order_no', o.order_no, 'order_date', o.order_date,
    'lines', lines,
    'totals', jsonb_build_object('taxable', ttx, 'cgst', tcg, 'sgst', tsg, 'igst', tig, 'total', ttx + tcg + tsg + tig),
    'bank', jsonb_build_object('account_name', s->>'co_bank_account_name', 'bank', s->>'co_bank_name', 'account_no', s->>'co_bank_account_no', 'ifsc', s->>'co_bank_ifsc'),
    'terms_extra', s->>'co_terms');
end $$;

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
    insert into customers(name, location, customer_type, gstin, state, state_code, address, ship_to_address, contact_name, phone, email)
    values (v_name, coalesce(nullif(trim(coalesce(p->>'location','')), ''), v_state), v_type, v_gst, v_state, v_code,
            nullif(trim(coalesce(p->>'address','')), ''), nullif(trim(coalesce(p->>'ship_to_address','')), ''), nullif(trim(coalesce(p->>'contact_name','')), ''),
            nullif(trim(coalesce(p->>'phone','')), ''), nullif(trim(coalesce(p->>'email','')), ''))
    returning id into v_id;
  else
    update customers set name = v_name, location = coalesce(nullif(trim(coalesce(p->>'location','')), ''), v_state, location), customer_type = v_type,
      gstin = v_gst, state = v_state, state_code = v_code, address = nullif(trim(coalesce(p->>'address','')), ''), ship_to_address = nullif(trim(coalesce(p->>'ship_to_address','')), ''),
      contact_name = nullif(trim(coalesce(p->>'contact_name','')), ''), phone = nullif(trim(coalesce(p->>'phone','')), ''),
      email = nullif(trim(coalesce(p->>'email','')), '') where id = v_id;
    if not found then raise exception 'Customer not found'; end if;
  end if;
  return v_id;
end $$;

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
  insert into sales_orders(customer_id, source, customer_po_no, order_date, needs_proforma, notes, po_file_path)
  values (v_cust.id, 'manual', nullif(trim(coalesce(p_header->>'customer_po_no', '')), ''),
          coalesce(nullif(p_header->>'order_date', '')::date, current_date),
          coalesce((p_header->>'needs_proforma')::boolean, v_cust.epdms_partner_id is null),
          nullif(trim(coalesce(p_header->>'notes', '')), ''), nullif(p_header->>'po_file_path', ''))
  returning id into v_id;
  insert into sales_order_lines(order_id, line_no, description, hsn, gst_pct, qty, rate)
    select v_id, row_number() over (), trim(x.description), coalesce(nullif(trim(x.hsn), ''), '340130'), coalesce(x.gst_pct, 18), x.qty, x.rate
    from jsonb_to_recordset(p_lines) as x(description text, hsn text, gst_pct numeric, qty numeric, rate numeric);
  return v_id;
end $$;

revoke all on function public.sales_doc_data(uuid,jsonb), public.save_customer(jsonb), public.create_sales_order(jsonb,jsonb) from public, anon;
grant execute on function public.save_customer(jsonb), public.create_sales_order(jsonb,jsonb) to authenticated;
