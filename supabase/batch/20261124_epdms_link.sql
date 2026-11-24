-- Batch Management project (hgdltduqwayfepzuurke). Additive only: nothing existing is altered except two new nullable columns on customer_payments.
-- Receives orders, final invoices and payments from EPDMS so Batch accounting shows them next to direct sales.

create table if not exists public.epdms_link (id int primary key check (id = 1), secret_hash text not null);
create table if not exists public.epdms_inbox (queue_id bigint primary key, kind text not null, received_at timestamptz not null default now(), result jsonb not null);
alter table public.epdms_link enable row level security; alter table public.epdms_inbox enable row level security;
revoke all on public.epdms_link, public.epdms_inbox from public, anon, authenticated;

alter table public.customer_payments add column if not exists epdms_order_id text;
alter table public.customer_payments add column if not exists epdms_ref text;
create unique index if not exists customer_payments_epdms_ref_uq on public.customer_payments (epdms_ref) where epdms_ref is not null;

create or replace function public._epdms_customer(pr jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_state text; v_gst text; v_name text;
begin
  if pr is null or nullif(pr ->> 'id', '') is null then raise exception 'The partner details are missing'; end if;
  v_state := nullif(trim(coalesce(pr ->> 'state', '')), ''); v_gst := upper(nullif(trim(coalesce(pr ->> 'gstin', '')), ''));
  if v_gst is not null and v_gst !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then v_gst := null; end if;
  select id into v_cust from customers where epdms_partner_id = pr ->> 'id';
  if v_cust is null then select id into v_cust from customers where lower(trim(name)) = lower(trim(pr ->> 'name')) and epdms_partner_id is null; end if;
  if v_cust is null then
    v_name := trim(pr ->> 'name'); if exists (select 1 from customers where name = v_name) then v_name := v_name || ' (' || (pr ->> 'id') || ')'; end if;
    insert into customers(name, location, customer_type, gstin, state, state_code, address, contact_name, phone, email, epdms_partner_id)
    values (v_name, coalesce(nullif(trim(coalesce(pr ->> 'district', '')), ''), v_state), case when pr ->> 'type_code' ilike 'DLR%' then 'dealer' else 'distributor' end, v_gst, v_state,
            coalesce(case when v_gst is not null then substr(v_gst, 1, 2) end, gst_state_code(v_state)), nullif(trim(coalesce(pr ->> 'address', '')), ''), nullif(trim(coalesce(pr ->> 'contact_name', '')), ''),
            nullif(trim(coalesce(pr ->> 'phone', '')), ''), nullif(trim(coalesce(pr ->> 'email', '')), ''), pr ->> 'id') returning id into v_cust;
  else
    update customers set epdms_partner_id = pr ->> 'id', gstin = coalesce(gstin, v_gst), state = coalesce(state, v_state),
      state_code = coalesce(state_code, case when v_gst is not null then substr(v_gst, 1, 2) end, gst_state_code(v_state)),
      address = coalesce(address, nullif(trim(coalesce(pr ->> 'address', '')), '')), phone = coalesce(phone, nullif(trim(coalesce(pr ->> 'phone', '')), '')),
      email = coalesce(email, nullif(trim(coalesce(pr ->> 'email', '')), '')), contact_name = coalesce(contact_name, nullif(trim(coalesce(pr ->> 'contact_name', '')), ''))
    where id = v_cust;
  end if;
  return v_cust;
end $$;

create or replace function public._epdms_order(od jsonb, v_cust uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ord uuid; ln jsonb; v_i int := 0; v_pct numeric;
begin
  select id into v_ord from sales_orders where epdms_order_id = od ->> 'id';
  if v_ord is not null then update sales_orders set epdms_status = od ->> 'status' where id = v_ord; return v_ord; end if;
  v_pct := case when coalesce((od ->> 'net')::numeric, 0) > 0 then round((od ->> 'gst')::numeric / (od ->> 'net')::numeric * 100) else 18 end;
  insert into sales_orders(customer_id, source, epdms_order_id, epdms_status, customer_po_no, order_date, needs_proforma, notes)
  values (v_cust, 'epdms', od ->> 'id', od ->> 'status', od ->> 'id', coalesce(nullif(od ->> 'created_at', '')::timestamptz::date, current_date), false, 'Received from EPDMS when payment was confirmed')
  returning id into v_ord;
  for ln in select * from jsonb_array_elements(coalesce(od -> 'lines', '[]'::jsonb)) loop
    if coalesce((ln ->> 'units')::numeric, 0) <= 0 then continue; end if;
    v_i := v_i + 1;
    insert into sales_order_lines(order_id, line_no, description, epdms_sku, hsn, gst_pct, qty, rate)
    values (v_ord, v_i, coalesce(nullif(ln ->> 'name', ''), ln ->> 'sku'), ln ->> 'sku', '340130', case when v_pct between 0 and 40 then v_pct else 18 end, (ln ->> 'units')::numeric, coalesce((ln ->> 'unit_price')::numeric, 0));
  end loop;
  if v_i = 0 then raise exception 'The order has no lines'; end if;
  return v_ord;
end $$;

create or replace function public._epdms_pay(v_cust uuid, v_inv uuid, v_utr text, v_amt numeric, v_paid date, v_mode text, v_bank text, v_note text, v_order text) returns void language plpgsql security definer set search_path = public as $$
declare m text;
begin
  if v_amt is null or v_amt <= 0 then raise exception 'The payment amount is missing'; end if;
  if length(trim(coalesce(v_utr, ''))) < 3 then raise exception 'The payment reference is missing'; end if;
  m := case when v_mode ilike 'bank%' then 'bank' when v_mode ilike 'upi%' then 'upi' when v_mode ilike 'cheque%' then 'cheque' else 'other' end;
  insert into customer_payments(customer_id, invoice_id, paid_on, amount, mode, ref, notes, epdms_order_id, epdms_ref, created_by)
  values (v_cust, v_inv, coalesce(v_paid, current_date), v_amt, m, trim(v_utr), nullif(trim('From EPDMS' || coalesce(' · ' || nullif(v_bank, ''), '') || coalesce(' · ' || nullif(v_note, ''), '')), ''), v_order, lower(trim(v_utr)), null)
  on conflict (epdms_ref) where epdms_ref is not null do nothing;
end $$;

/** The single door EPDMS knocks on. Authorised by a shared secret (only its hash is kept here). Idempotent per queue id; answers {"ok":true} or {"ok":false,"error":...} so EPDMS can retry. */
create or replace function public.epdms_receive(p_secret text, p_event jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := p_event ->> 'kind'; d jsonb := p_event -> 'data'; qid bigint := nullif(p_event ->> 'queue_id', '')::bigint; v_cust uuid; s sales_orders; c customers; v_ch uuid; v_inv uuid; pl jsonb; inv jsonb; st jsonb;
  res jsonb; gross numeric; tx numeric; tot_tax numeric; pct numeric; acc_tx numeric := 0; acc_tax numeric := 0; n int := 0; cnt int; l jsonb; ltx numeric; lg numeric; lcg numeric; lsg numeric; lig numeric; lines jsonb := '[]'::jsonb; inter boolean; dno text; ino text;
begin
  if p_secret is null or not exists (select 1 from epdms_link where id = 1 and secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')) then return jsonb_build_object('ok', false, 'error', 'Not authorised'); end if;
  if qid is not null then select result into res from epdms_inbox where queue_id = qid and (result ->> 'ok') = 'true'; if res is not null then return res; end if; end if;
  begin
    if k = 'order' then
      v_cust := public._epdms_customer(d -> 'partner');
      perform public._epdms_order(d -> 'order', v_cust);
      for pl in select * from jsonb_array_elements(coalesce(d -> 'payments', '[]'::jsonb)) loop
        perform public._epdms_pay(v_cust, null, pl ->> 'utr', (pl ->> 'amount')::numeric, nullif(pl ->> 'paid_on', '')::date, 'bank', null, 'Order payment', d -> 'order' ->> 'id');
      end loop;
      res := jsonb_build_object('ok', true, 'customer', v_cust);
    elsif k = 'invoice' then
      select * into s from sales_orders where epdms_order_id = d ->> 'order_id';
      if s.id is null then raise exception 'waiting: the order has not reached Batch yet'; end if;
      select * into c from customers where id = s.customer_id;
      inv := d -> 'invoice'; ino := inv ->> 'number'; dno := d -> 'challan' ->> 'number';
      select id into v_ch from challans where dc_no = dno;
      if v_ch is null then
        insert into challans(order_id, dc_no, dc_date, vehicle, transporter, lr_no, remarks, data)
        values (s.id, dno, coalesce(nullif(d -> 'challan' ->> 'date', '')::date, current_date), nullif(d -> 'challan' ->> 'vehicle', ''), null, nullif(d -> 'challan' ->> 'lr_no', ''), 'Dispatched from EPDMS',
                jsonb_build_object('source', 'epdms', 'epdms_order_id', s.epdms_order_id, 'batch_ref', d -> 'challan' ->> 'batch_ref')) returning id into v_ch;
      end if;
      select id into v_inv from tax_invoices where invoice_no = ino;
      if v_inv is null then
        select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into st from app_settings where left(key, 3) = 'co_';
        tx := (inv ->> 'taxable')::numeric; tot_tax := (inv ->> 'cgst')::numeric + (inv ->> 'sgst')::numeric + (inv ->> 'igst')::numeric;
        select sum((x ->> 'amount')::numeric), count(*) into gross, cnt from jsonb_array_elements(inv -> 'lines') x;
        if cnt = 0 or coalesce(gross, 0) <= 0 then raise exception 'The invoice has no lines'; end if;
        pct := case when tx > 0 then round(tot_tax / tx * 100) else 18 end; inter := (inv ->> 'igst')::numeric > 0;
        for l in select * from jsonb_array_elements(inv -> 'lines') loop
          n := n + 1;
          if n = cnt then ltx := tx - acc_tx; lg := tot_tax - acc_tax; else ltx := round((l ->> 'amount')::numeric * tx / gross, 2); lg := round(ltx * pct / 100, 2); end if;
          acc_tx := acc_tx + ltx; acc_tax := acc_tax + lg;
          if inter then lig := lg; lcg := 0; lsg := 0; else lcg := round(lg / 2, 2); lsg := lg - lcg; lig := 0; end if;
          lines := lines || jsonb_build_object('n', n, 'desc', l ->> 'name', 'hsn', coalesce(l ->> 'hsn', '340130'), 'gst_pct', pct, 'qty', (l ->> 'units')::numeric, 'rate', (l ->> 'unit_price')::numeric,
                     'taxable', ltx, 'cgst', lcg, 'sgst', lsg, 'igst', lig, 'total', ltx + lg);
        end loop;
        insert into tax_invoices(invoice_no, order_id, challan_id, invoice_date, data, taxable, tax, total)
        values (ino, s.id, v_ch, coalesce(nullif(inv ->> 'date', '')::date, current_date),
          jsonb_build_object('source', 'epdms',
            'seller', jsonb_build_object('name', st ->> 'co_legal_name', 'address', st ->> 'co_address', 'gstin', st ->> 'co_gstin', 'pan', st ->> 'co_pan', 'state', st ->> 'co_state', 'state_code', coalesce(st ->> 'co_state_code', '24'), 'email', st ->> 'co_email'),
            'buyer', jsonb_build_object('name', c.name, 'address', coalesce(c.address, c.location), 'gstin', c.gstin, 'state', c.state, 'state_code', coalesce(c.state_code, gst_state_code(c.state)), 'ship_to', coalesce(c.ship_to_address, c.address, c.location), 'contact', c.contact_name, 'phone', c.phone, 'email', c.email),
            'place_of_supply', jsonb_build_object('state', coalesce(inv ->> 'supply_state', c.state), 'code', coalesce(c.state_code, gst_state_code(c.state))),
            'inter_state', inter, 'po_no', s.epdms_order_id, 'order_no', s.order_no, 'order_date', s.order_date, 'lines', lines,
            'totals', jsonb_build_object('taxable', tx, 'cgst', (inv ->> 'cgst')::numeric, 'sgst', (inv ->> 'sgst')::numeric, 'igst', (inv ->> 'igst')::numeric, 'total', (inv ->> 'total')::numeric),
            'bank', jsonb_build_object('account_name', st ->> 'co_bank_account_name', 'bank', st ->> 'co_bank_name', 'account_no', st ->> 'co_bank_account_no', 'ifsc', st ->> 'co_bank_ifsc'),
            'terms_extra', st ->> 'co_terms', 'challan_ref', jsonb_build_object('no', dno, 'date', d -> 'challan' ->> 'date'), 'epdms_invoice', true),
          tx, tot_tax, (inv ->> 'total')::numeric) returning id into v_inv;
      end if;
      update sales_orders set epdms_invoice_no = ino, epdms_status = 'Dispatched', status = 'delivered' where id = s.id;
      update customer_payments set invoice_id = v_inv where epdms_order_id = s.epdms_order_id and invoice_id is null;
      res := jsonb_build_object('ok', true, 'invoice', ino, 'challan', dno);
    elsif k = 'payment' then
      if nullif(d ->> 'order_id', '') is not null then
        select * into s from sales_orders where epdms_order_id = d ->> 'order_id';
        if s.id is null then raise exception 'waiting: the order has not reached Batch yet'; end if;
        v_cust := s.customer_id;
      else
        v_cust := public._epdms_customer(d -> 'partner');
      end if;
      v_inv := null;
      if nullif(d ->> 'invoice_no', '') is not null then
        select id into v_inv from tax_invoices where invoice_no = d ->> 'invoice_no';
        if v_inv is null then raise exception 'waiting: the invoice has not reached Batch yet'; end if;
      end if;
      perform public._epdms_pay(v_cust, v_inv, d ->> 'utr', (d ->> 'amount')::numeric, nullif(d ->> 'paid_on', '')::date, d ->> 'mode', d ->> 'bank', d ->> 'note', d ->> 'order_id');
      res := jsonb_build_object('ok', true);
    else raise exception 'Unknown event %', k; end if;
  exception when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  if qid is not null then insert into epdms_inbox(queue_id, kind, result) values (qid, k, res) on conflict (queue_id) do update set result = excluded.result, received_at = now(); end if;
  return res;
end $$;

revoke all on function public._epdms_customer(jsonb), public._epdms_order(jsonb, uuid), public._epdms_pay(uuid, uuid, text, numeric, date, text, text, text, text) from public, anon, authenticated;
revoke all on function public.epdms_receive(text, jsonb) from public;
grant execute on function public.epdms_receive(text, jsonb) to anon, authenticated;
