-- Build 15: one numbered series per document type, the order -> challan -> final invoice lifecycle,
-- invoice-level payments, vendor documents, public document verification and the queue that mirrors
-- orders, invoices and payments into the Batch Management system.

-- ---------------------------------------------------------------- numbering
create table if not exists public.doc_series (kind text not null, fy text not null, last int not null default 0, primary key (kind, fy));
create table if not exists public.doc_numbers (kind text not null, ref_id text not null, number text not null unique, issued_on date not null default current_date, primary key (kind, ref_id));
alter table public.doc_series enable row level security; alter table public.doc_numbers enable row level security;
revoke all on public.doc_series, public.doc_numbers from public, anon, authenticated;

/** Indian financial year label, e.g. 26-27 for any date from 1 Apr 2026 to 31 Mar 2027. */
create or replace function public.fy_label(d date default current_date) returns text language sql immutable as $$
  select case when extract(month from d) >= 4 then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY') else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end $$;

/** Next number in a series: ELI/26-27/0001. Counted inside the caller's transaction, so a rolled-back document leaves no gap. */
create or replace function public.next_doc_no(k text, d date default current_date) returns text language plpgsql security definer set search_path = public as $$
declare pre text; fyl text := public.fy_label(d); n int;
begin
  pre := case k when 'invoice' then 'ELI' when 'proforma' then 'ELPI' when 'challan' then 'ELDC' when 'vdn' then 'ELVD' else null end;
  if pre is null then raise exception 'Unknown document series %', k; end if;
  insert into public.doc_series(kind, fy, last) values (k, fyl, 1) on conflict (kind, fy) do update set last = public.doc_series.last + 1 returning last into n;
  return pre || '/' || fyl || '/' || lpad(n::text, 4, '0');
end $$;

/** The number a document already holds, or a new one from its series. A proforma, challan or dispatch note keeps its number for good. */
create or replace function public.doc_number(k text, ref text, d date default current_date) returns text language plpgsql security definer set search_path = public as $$
declare num text;
begin
  select number into num from public.doc_numbers where kind = k and ref_id = ref;
  if num is not null then return num; end if;
  num := public.next_doc_no(k, d);
  insert into public.doc_numbers(kind, ref_id, number, issued_on) values (k, ref, num, d) on conflict (kind, ref_id) do nothing;
  return (select number from public.doc_numbers where kind = k and ref_id = ref);
end $$;
revoke all on function public.fy_label(date), public.next_doc_no(text, date), public.doc_number(text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- invoice payments
create table if not exists public.invoice_payments (
  id bigserial primary key, invoice_id text not null references public.invoices(id), utr text not null, amount numeric(14,2) not null check (amount > 0),
  mode text not null, paid_on date not null, bank text, note text, recorded_by uuid default auth.uid(), recorded_at timestamptz not null default now());
create unique index if not exists invoice_payments_utr_uq on public.invoice_payments (lower(trim(utr)));
alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from public, anon, authenticated;

/** Money still due on an invoice: total less order payments, invoice payments and credit notes. */
create or replace function public.invoice_paid(iid text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(p.amount) from public.order_payments p join public.invoices i on i.order_id = p.order_id where i.id = iid), 0)
       + coalesce((select sum(amount) from public.invoice_payments where invoice_id = iid), 0) $$;
create or replace function public.invoice_balances() returns table (id text, paid numeric, credited numeric, balance numeric) language sql stable security definer set search_path = public as $$
  select i.id, public.invoice_paid(i.id), coalesce((select sum(c.amount) from public.credit_notes c where c.invoice_id = i.id), 0),
         greatest(i.total - public.invoice_paid(i.id) - coalesce((select sum(c.amount) from public.credit_notes c where c.invoice_id = i.id), 0), 0)
  from public.invoices i where public.is_staff() or i.partner_id = public.my_partner() $$;
revoke all on function public.invoice_paid(text), public.invoice_balances() from public, anon;
grant execute on function public.invoice_balances() to authenticated;

-- ---------------------------------------------------------------- Batch sync queue
create table if not exists public.batch_link (id int primary key check (id = 1), url text not null, anon_key text not null, secret text not null);
create table if not exists public.batch_sync_queue (
  id bigserial primary key, kind text not null check (kind in ('order','invoice','payment')), ref text not null, payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','in_flight','sent','failed')), tries int not null default 0, last_error text,
  request_id bigint, flown_at timestamptz, created_at timestamptz not null default now(), sent_at timestamptz);
create index if not exists batch_sync_queue_open on public.batch_sync_queue (status, id);
alter table public.batch_link enable row level security; alter table public.batch_sync_queue enable row level security;
revoke all on public.batch_link, public.batch_sync_queue from public, anon, authenticated;

/** Builds the event the Batch system understands and queues it. kind: order (payment confirmed), invoice (final invoice + challan), payment (money received). */
create or replace function public.enqueue_batch_sync(k text, ref text, extra jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; p public.partners; i public.invoices; dn public.dispatch_notes; pl jsonb; body jsonb; pid text;
begin
  if k = 'order' then
    select * into o from public.orders where id = ref; select * into p from public.partners where id = o.partner_id;
    body := jsonb_build_object('partner', jsonb_build_object('id', p.id, 'name', p.name, 'type_code', p.type_code, 'state', p.state, 'district', p.district, 'gstin', p.gstin, 'address', p.address, 'contact_name', p.contact_name, 'phone', p.phone, 'email', p.email),
      'order', jsonb_build_object('id', o.id, 'partner_id', o.partner_id, 'status', o.status, 'net', o.net, 'gst', o.gst, 'total', o.total, 'created_at', o.created_at,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', s.name, 'units', l.units, 'unit_price', l.unit_price) order by l.sku), '[]') from public.order_lines l join public.skus s on s.sku = l.sku where l.order_id = o.id)),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object('utr', x.utr, 'amount', x.amount, 'paid_on', x.confirmed_at::date) order by x.id), '[]') from public.order_payments x where x.order_id = o.id));
    pid := o.id;
  elsif k = 'invoice' then
    select * into i from public.invoices where id = ref; select * into o from public.orders where id = i.order_id; select * into p from public.partners where id = i.partner_id;
    select * into dn from public.dispatch_notes where order_id = i.order_id order by dispatched_at desc limit 1;
    pl := (select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', l.name, 'hsn', coalesce(s.hsn, '340130'), 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]')
           from public.invoice_lines l left join public.skus s on s.sku = l.sku where l.invoice_id = i.id);
    body := jsonb_build_object('order_id', i.order_id, 'partner_id', i.partner_id,
      'invoice', jsonb_build_object('number', i.id, 'date', i.issued_on, 'supply_state', i.supply_state, 'taxable', i.taxable, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst, 'total', i.total, 'lines', pl),
      'challan', jsonb_build_object('number', public.doc_number('challan', i.order_id), 'date', coalesce(dn.dispatched_at::date, i.issued_on), 'vehicle', dn.vehicle, 'lr_no', dn.lr_no, 'batch_ref', dn.batch_ref));
    pid := i.order_id;
  elsif k = 'payment' then
    body := extra; pid := coalesce(extra ->> 'order_id', extra ->> 'partner_id');
    select * into p from public.partners where id = extra ->> 'partner_id';
    if p.id is not null then
      body := body || jsonb_build_object('partner', jsonb_build_object('id', p.id, 'name', p.name, 'type_code', p.type_code, 'state', p.state, 'district', p.district, 'gstin', p.gstin, 'address', p.address, 'contact_name', p.contact_name, 'phone', p.phone, 'email', p.email));
    end if;
  else raise exception 'Unknown sync event %', k; end if;
  insert into public.batch_sync_queue(kind, ref, payload) values (k, pid, body);
end $$;
revoke all on function public.enqueue_batch_sync(text, text, jsonb) from public, anon, authenticated;

/** Sends queued events to the Batch system and reads back the answers. Runs every minute from pg_cron. Events of one order go strictly in order. */
create or replace function public.batch_sync_flush() returns int language plpgsql security definer set search_path = public as $$
declare l public.batch_link; r record; h record; rid bigint; res jsonb; n int := 0;
begin
  select * into l from public.batch_link where id = 1; if not found then return 0; end if;
  for r in select * from public.batch_sync_queue where status = 'in_flight' loop
    select status_code, content, error_msg into h from net._http_response where id = r.request_id;
    if found then
      begin res := h.content::jsonb; exception when others then res := null; end;
      if h.status_code = 200 and coalesce(res ->> 'ok', '') = 'true' then update public.batch_sync_queue set status = 'sent', sent_at = now(), last_error = null where id = r.id;
      else update public.batch_sync_queue set status = case when tries >= 12 then 'failed' else 'queued' end, last_error = left(coalesce(res ->> 'error', res ->> 'message', h.error_msg, 'HTTP ' || h.status_code), 300) where id = r.id; end if;
    elsif r.flown_at < now() - interval '15 minutes' then update public.batch_sync_queue set status = 'queued', last_error = 'No answer from the Batch system' where id = r.id; end if;
  end loop;
  for r in select q.* from public.batch_sync_queue q where q.status = 'queued' and not exists (select 1 from public.batch_sync_queue e where e.ref = q.ref and e.id < q.id and e.status <> 'sent') order by q.id limit 25 loop
    rid := net.http_post(url := l.url || '/rest/v1/rpc/epdms_receive',
      body := jsonb_build_object('p_secret', l.secret, 'p_event', jsonb_build_object('kind', r.kind, 'queue_id', r.id, 'data', r.payload)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', l.anon_key, 'Authorization', 'Bearer ' || l.anon_key), timeout_milliseconds := 8000);
    update public.batch_sync_queue set status = 'in_flight', request_id = rid, flown_at = now(), tries = tries + 1 where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.batch_sync_flush() from public, anon, authenticated;

/** Super Admin view of the link to Batch accounting. */
create or replace function public.batch_sync_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can see the Batch sync'; end if;
  return jsonb_build_object('linked', exists (select 1 from public.batch_link), 'queued', (select count(*) from public.batch_sync_queue where status in ('queued','in_flight')),
    'sent', (select count(*) from public.batch_sync_queue where status = 'sent'), 'failed', (select count(*) from public.batch_sync_queue where status = 'failed'),
    'last_sent', (select max(sent_at) from public.batch_sync_queue), 'errors', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'ref', ref, 'error', last_error) order by id desc), '[]') from (select * from public.batch_sync_queue where last_error is not null and status <> 'sent' order by id desc limit 5) e));
end $$;
create or replace function public.batch_sync_retry() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can retry the Batch sync'; end if;
  update public.batch_sync_queue set status = 'queued', tries = 0 where status = 'failed'; get diagnostics n = row_count; return n;
end $$;
revoke all on function public.batch_sync_status(), public.batch_sync_retry() from public, anon;
grant execute on function public.batch_sync_status(), public.batch_sync_retry() to authenticated;

-- ---------------------------------------------------------------- invoice issue (final invoice, numbered series)
create or replace function public._issue_invoice(oid text) returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; p public.partners; home text; iid text; half numeric; c numeric := 0; s numeric := 0; i numeric := 0; dn public.dispatch_notes;
begin
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if exists (select 1 from public.invoices where order_id = oid) then raise exception 'This order already has an invoice'; end if;
  select * into p from public.partners where id = o.partner_id;
  select value #>> '{state}' into home from public.settings where key = 'company';
  if lower(coalesce(p.state, '')) = lower(coalesce(home, 'Gujarat')) then half := round(o.gst / 2, 2); c := half; s := o.gst - half; else i := o.gst; end if;
  iid := public.next_doc_no('invoice');
  insert into public.invoices(id, order_id, partner_id, supply_state, taxable, cgst, sgst, igst, total) values (iid, oid, o.partner_id, p.state, o.net, c, s, i, o.net + o.gst);
  insert into public.invoice_lines(invoice_id, sku, name, units, unit_price, amount)
    select iid, l.sku, k.name, l.units, l.unit_price, l.amount from public.order_lines l join public.skus k on k.sku = l.sku where l.order_id = oid;
  perform public.post_ledger(o.partner_id, 'invoice', iid, null, o.net + o.gst, 0, 'Invoice for ' || oid);
  select * into dn from public.dispatch_notes where order_id = oid order by dispatched_at desc limit 1;
  perform public.notify_partner(o.partner_id, 'Invoice ' || iid || ' issued',
    'Tax invoice ' || iid || ' for order ' || oid || ' dated ' || to_char(current_date, 'DD Mon YYYY') || ': taxable Rs ' || to_char(o.net, 'FM9,99,99,990.00') || ', GST Rs ' || to_char(o.gst, 'FM9,99,99,990.00') || ', total Rs ' || to_char(o.net + o.gst, 'FM9,99,99,990.00') || '.'
    || case when dn.id is not null then ' Delivery challan ' || public.doc_number('challan', oid) || coalesce(', vehicle ' || nullif(dn.vehicle, ''), '') || ' accompanies the goods.' else '' end
    || ' Open it from your invoices to view or print.', '/invoices/');
  perform public.enqueue_batch_sync('invoice', iid);
  return iid;
end $$;
revoke all on function public._issue_invoice(text) from public, anon, authenticated;

/** Accounts catch-up for an order that was dispatched before invoices became automatic. Normal orders are invoiced by dispatch itself. */
create or replace function public.issue_invoice(oid text) returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can issue invoices'; end if;
  select * into o from public.orders where id = oid;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('Dispatched','Delivered') then raise exception 'The final invoice is issued automatically when the order is dispatched (this order is %)', o.status; end if;
  return public._issue_invoice(oid);
end $$;

/** Dispatch records the challan, issues the final invoice and mails it to the partner. */
create or replace function public.dispatch_order(oid text, vehicle text, lr text, batch text) returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; pc jsonb; credit_ok boolean := false; lvl int; av int;
begin
  if public.my_role() not in ('super_admin','warehouse') then raise exception 'Only Warehouse or Super Admin can dispatch'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  select value into pc from public.settings where key = 'pay_and_carry';
  select credit_level into lvl from public.partners where id = o.partner_id;
  credit_ok := o.status = 'Approved' and not coalesce((pc->>'enabled')::boolean, true) and coalesce(lvl,0) > 0;
  if o.status <> 'Payment Confirmed' and not credit_ok then
    raise exception 'Payment is not confirmed. An order ships only after Accounts confirms payment';
  end if;
  if coalesce((select (value)::text = 'true' from public.settings where key = 'batch_ref_required'), false) and length(trim(coalesce(batch,''))) = 0 then
    raise exception 'Enter the QC-approved batch reference';
  end if;
  for r in select sku, cartons, reserved_cartons from public.order_lines where order_id = oid loop
    select available into av from public.stock where sku = r.sku for update;
    if coalesce(av,0) < r.cartons then raise exception 'Not enough stock of % to dispatch (have %, need %)', r.sku, coalesce(av,0), r.cartons; end if;
    update public.stock set available = available - r.cartons, reserved = greatest(reserved - r.reserved_cartons, 0) where sku = r.sku;
    insert into public.stock_moves(sku, delta, reason, order_id) values (r.sku, -r.cartons, 'Dispatch', oid);
  end loop;
  perform set_config('epdms.dispatching','on',true);
  update public.orders set status = 'Dispatched' where id = oid;
  insert into public.dispatch_notes(order_id, vehicle, lr_no, batch_ref) values (oid, nullif(trim(vehicle),''), nullif(trim(lr),''), nullif(trim(batch),''));
  perform public.order_event(oid, 'Dispatched', coalesce('Vehicle ' || nullif(trim(vehicle),''), 'Dispatched') || ' · challan ' || public.doc_number('challan', oid));
  perform public.notify_partner(o.partner_id, 'Order ' || oid || ' dispatched', 'Your order is on its way. Delivery challan ' || public.doc_number('challan', oid) || '.', '/orders/');
  if not exists (select 1 from public.invoices where order_id = oid) then perform public._issue_invoice(oid); end if;
end $$;

/** Payment confirmed: the order is handed to the Batch system (with every payment so far). */
create or replace function public.confirm_order_payment(oid text, utr text, amt numeric) returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; paid numeric; lt jsonb; newst text;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can confirm payments'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'Approved' then raise exception 'Payment can be confirmed only for an approved order (this one is %)', o.status; end if;
  begin
    insert into public.order_payments(order_id, utr, amount) values (oid, trim(utr), amt);
  exception when unique_violation then raise exception 'This UTR is already recorded against a payment';
  end;
  select coalesce(sum(amount),0) into paid from public.order_payments where order_id = oid;
  if paid >= o.total then
    select value into lt from public.settings where key = 'lead_time';
    update public.orders set status = 'Payment Confirmed', eta_from = current_date + coalesce(lead_days, 0), eta_to = current_date + coalesce(lead_days, 0) + 2 where id = oid;
    perform public.order_event(oid, 'Payment Confirmed', 'Payment of ' || paid || ' confirmed (UTR ' || trim(utr) || ')');
    perform public.notify_partner(o.partner_id, 'Payment confirmed for ' || oid, 'Your order will be dispatched shortly.', '/orders/');
    perform public.enqueue_batch_sync('order', oid);
    newst := 'Payment Confirmed';
  else
    perform public.order_event(oid, 'Approved', 'Part payment ' || amt || ' confirmed. Balance ' || (o.total - paid));
    newst := 'Approved';
  end if;
  return newst;
end $$;

/** Walkthrough "Add payment details" on an invoice: Accounts records how an invoice was paid. */
create or replace function public.record_invoice_payment(iid text, utr text, amt numeric, how text default 'Bank transfer (NEFT / RTGS / IMPS)', paid date default null, pay_bank text default null, note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare i public.invoices; bal numeric; d date := coalesce(paid, current_date); t text := trim(coalesce(utr, ''));
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can record payments'; end if;
  select * into i from public.invoices where id = iid for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if how not in ('Bank transfer (NEFT / RTGS / IMPS)','UPI','Cheque / demand draft','Gateway') then raise exception 'Choose how the payment was made'; end if;
  if length(t) < 6 then raise exception 'Enter the UTR or reference number (at least 6 characters)'; end if;
  if d > current_date then raise exception 'The payment date cannot be in the future'; end if;
  if d < current_date - 180 then raise exception 'The payment date is more than 180 days old'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  select balance into bal from public.invoice_balances() where id = iid;
  if amt > bal + 0.005 then raise exception 'The amount is more than the balance due on % (Rs %)', iid, to_char(bal, 'FM9,99,99,990.00'); end if;
  if exists (select 1 from public.order_payments where lower(trim(order_payments.utr)) = lower(t)) then raise exception 'This UTR is already recorded against a payment'; end if;
  begin
    insert into public.invoice_payments(invoice_id, utr, amount, mode, paid_on, bank, note) values (iid, t, amt, how, d, nullif(trim(coalesce(pay_bank, '')), ''), nullif(trim(coalesce(note, '')), ''));
  exception when unique_violation then raise exception 'This UTR is already recorded against a payment';
  end;
  perform public.post_ledger(i.partner_id, 'payment', iid, t, 0, amt, 'Payment against ' || iid || ' · ' || how);
  perform public.notify_partner(i.partner_id, 'Payment received for ' || iid, 'Rs ' || to_char(amt, 'FM9,99,99,990.00') || ' received against invoice ' || iid || ' (reference ' || t || ').', '/invoices/');
  perform public.enqueue_batch_sync('payment', i.order_id, jsonb_build_object('order_id', i.order_id, 'invoice_no', iid, 'partner_id', i.partner_id, 'utr', t, 'amount', amt, 'paid_on', d, 'mode', how, 'bank', nullif(trim(coalesce(pay_bank, '')), ''), 'note', nullif(trim(coalesce(note, '')), '')));
  return case when amt >= bal - 0.005 then 'Paid in full' else 'Part paid, balance Rs ' || to_char(bal - amt, 'FM9,99,99,990.00') end;
end $$;
revoke all on function public.record_invoice_payment(text, text, numeric, text, date, text, text) from public, anon;
grant execute on function public.record_invoice_payment(text, text, numeric, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------- printable documents
/** Everything a printable document needs. Kinds: invoice, proforma, challan, po (partner order) and, for vendors, rpo (EarthLabs purchase order) and vdn (vendor dispatch note). */
create or replace function public.trade_doc(k text, doc_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid text; d jsonb; ls jsonb; o public.orders; i public.invoices; ro public.release_orders; v public.vendors; rm public.raw_materials; co jsonb; pa jsonb; credit_days int; br jsonb; cbr jsonb; dn public.dispatch_notes; qc jsonb; num text; vendorish boolean := k in ('rpo','vdn'); paid numeric; ev timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if k = 'invoice' then
    select * into i from public.invoices where id = doc_id;
    if i.id is null then raise exception 'Document not found'; end if;
    pid := i.partner_id; select * into o from public.orders where id = i.order_id; num := i.id;
    paid := public.invoice_paid(i.id) + coalesce((select sum(c.amount) from public.credit_notes c where c.invoice_id = i.id), 0);
    select * into dn from public.dispatch_notes where order_id = i.order_id order by dispatched_at desc limit 1;
    d := jsonb_build_object('date', i.issued_on, 'order_id', i.order_id, 'supply_state', i.supply_state, 'taxable', i.taxable, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst, 'total', i.total, 'discount', o.discount, 'ref', o.id,
      'paid', least(paid, i.total), 'balance', greatest(i.total - paid, 0), 'vehicle', dn.vehicle, 'lr_no', dn.lr_no);
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', l.name, 'hsn', coalesce(s.hsn,'340130'), 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls
      from public.invoice_lines l left join public.skus s on s.sku = l.sku where l.invoice_id = i.id;
  elsif k in ('po','proforma','challan') then
    select * into o from public.orders where id = doc_id;
    if o.id is null then raise exception 'Document not found'; end if;
    pid := o.partner_id;
    d := jsonb_build_object('date', o.created_at::date, 'status', o.status, 'taxable', o.taxable, 'discount', o.discount, 'net', o.net, 'gst', o.gst, 'total', o.total, 'eta_from', o.eta_from, 'eta_to', o.eta_to, 'applied', coalesce(o.applied, '[]'::jsonb), 'order_id', o.id);
    if k = 'challan' then
      select * into dn from public.dispatch_notes where order_id = o.id order by dispatched_at desc limit 1;
      if dn.id is null then raise exception 'This order has not been dispatched yet'; end if;
      d := d || jsonb_build_object('date', dn.dispatched_at::date, 'vehicle', dn.vehicle, 'lr_no', dn.lr_no, 'batch_ref', dn.batch_ref);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', s.name, 'hsn', coalesce(s.hsn,'340130'), 'cartons', l.cartons, 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls
      from public.order_lines l join public.skus s on s.sku = l.sku where l.order_id = o.id;
  elsif vendorish then
    select * into ro from public.release_orders where id = doc_id;
    if ro.id is null then raise exception 'Document not found'; end if;
    pid := ro.vendor_id; select * into v from public.vendors where id = ro.vendor_id; select * into rm from public.raw_materials where id = ro.rm_id;
    select max(at) into ev from public.ro_events where ro_id = ro.id and status = 'Dispatched';
    if k = 'vdn' and ro.status not in ('Dispatched','Received') then raise exception 'This release order has not been dispatched yet'; end if;
    d := jsonb_build_object('date', case when k = 'vdn' then coalesce(ev::date, ro.created_at::date) else ro.created_at::date end, 'status', ro.status, 'taxable', ro.total, 'discount', 0, 'net', ro.total, 'gst', 0, 'total', ro.total,
      'eta_from', ro.eta, 'eta_to', ro.eta, 'order_id', ro.id, 'ref', ro.id);
    ls := jsonb_build_array(jsonb_build_object('sku', ro.rm_id, 'name', coalesce(rm.name, ro.rm_id), 'hsn', '', 'unit', rm.unit, 'units', ro.qty, 'cartons', ro.qty, 'unit_price', ro.rate, 'amount', ro.total));
  else raise exception 'Unknown document'; end if;
  if not (public.is_staff() or pid = coalesce(public.my_partner(), '') or pid = coalesce(public.my_vendor(), '')) then raise exception 'Document not found'; end if;
  if num is null then
    num := case k when 'proforma' then public.doc_number('proforma', doc_id) when 'challan' then public.doc_number('challan', doc_id) when 'vdn' then public.doc_number('vdn', doc_id) else doc_id end;
  end if;
  d := d || jsonb_build_object('number', num);
  select jsonb_object_agg(key, value) into co from public.company_profile;
  select to_jsonb(b) into cbr from public.issuer_branding b where owner_id = 'COMPANY';
  select to_jsonb(b) into br from public.issuer_branding b where owner_id = pid;
  if vendorish then
    pa := jsonb_build_object('id', v.id, 'type', 'vendor', 'name', coalesce(br ->> 'legal_name', v.name), 'contact', v.person, 'phone', v.phone, 'email', coalesce(br ->> 'email', v.email), 'gstin', br ->> 'gstin', 'address', br ->> 'address', 'state', br ->> 'state', 'district', v.district);
  else
    select jsonb_build_object('id', p.id, 'type', p.type_code, 'name', p.name, 'contact', p.contact_name, 'phone', p.phone, 'email', p.email, 'gstin', p.gstin, 'address', p.address, 'state', p.state, 'district', p.district) into pa from public.partners p where p.id = pid;
    select coalesce((e ->> 'days')::int, 0) into credit_days from public.partners p, lateral (select value -> p.credit_level as e from public.settings where key = 'credit_ladder') x where p.id = pid;
  end if;
  if (d ->> 'batch_ref') is not null then select to_jsonb(q) into qc from public.batch_qc_cache q where q.batch_ref = d ->> 'batch_ref'; end if;
  return jsonb_build_object('kind', k, 'company', coalesce(co, '{}'::jsonb) || coalesce(cbr, '{}'::jsonb), 'partner', pa, 'doc', d, 'lines', ls, 'credit_days', coalesce(credit_days, 0),
    'partner_brand', coalesce(br, '{}'::jsonb), 'qc', coalesce(qc, 'null'::jsonb));
end $$;
revoke all on function public.trade_doc(text, text) from public, anon;
grant execute on function public.trade_doc(text, text) to authenticated;

/** Public check behind the QR code on every invoice, proforma and challan: is this number genuine, and for what amount. No party names are shown. */
create or replace function public.verify_document(num text) returns table (valid boolean, kind text, number text, issued_on date, amount numeric, issuer text)
language sql stable security definer set search_path = public as $$
  select true, 'Tax invoice', i.id, i.issued_on, i.total, (select value from public.company_profile where key = 'legal_name') from public.invoices i where upper(i.id) = upper(trim(num))
  union all
  select true, case n.kind when 'proforma' then 'Proforma invoice' when 'challan' then 'Delivery challan' else 'Dispatch note' end, n.number, n.issued_on,
         case n.kind when 'proforma' then (select o.total from public.orders o where o.id = n.ref_id) else null end, (select value from public.company_profile where key = 'legal_name')
  from public.doc_numbers n where upper(n.number) = upper(trim(num)) and n.kind in ('proforma','challan') $$;
revoke all on function public.verify_document(text) from public;
grant execute on function public.verify_document(text) to anon, authenticated;

/** Manual payment entry (an advance, or money outside an order) also goes to Batch accounting. */
create or replace function public.record_payment(pid text, utr text, amt numeric, mode text, note text) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can record payments'; end if;
  if length(trim(coalesce(utr,''))) < 6 then raise exception 'Enter the UTR or reference number (at least 6 characters)'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  if not exists (select 1 from public.partners where id = pid) then raise exception 'Partner not found'; end if;
  if exists (select 1 from public.order_payments where lower(trim(order_payments.utr)) = lower(trim(record_payment.utr))) or exists (select 1 from public.invoice_payments where lower(trim(invoice_payments.utr)) = lower(trim(record_payment.utr))) then raise exception 'This UTR is already recorded against a payment'; end if;
  begin
    perform public.post_ledger(pid, 'payment', 'MANUAL', utr, 0, amt, coalesce(nullif(trim(mode),''),'Bank transfer') || coalesce(' · ' || nullif(trim(note),''), ''));
  exception when unique_violation then raise exception 'This UTR is already recorded against a payment';
  end;
  perform public.enqueue_batch_sync('payment', pid, jsonb_build_object('partner_id', pid, 'utr', trim(utr), 'amount', amt, 'paid_on', current_date, 'mode', coalesce(nullif(trim(mode),''),'Bank transfer'), 'note', nullif(trim(coalesce(note,'')), '')));
end $$;
