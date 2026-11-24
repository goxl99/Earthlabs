\set ON_ERROR_STOP on
-- Build 15 tests: numbered document series, order -> challan -> final invoice, invoice-level payments, vendor documents, QR verification, Batch sync queue.
-- Users as before: ...01 super, ...02 sales, ...03 dealer1 (ELP-DLR-0001), ...04 dealer2, ...05 accounts, ...06 warehouse, ...0b vendor VND-0001.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin execute q; raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
reset role;

-- ===== numbering: one series per kind and financial year, no gaps, stable once given =====
do $$ declare a text; b text; c text; begin
  assert public.fy_label(date '2026-04-01') = '26-27' and public.fy_label(date '2027-03-31') = '26-27' and public.fy_label(date '2027-04-01') = '27-28', 'financial year runs April to March';
  a := public.next_doc_no('invoice', date '2031-05-01'); b := public.next_doc_no('invoice', date '2031-05-02'); c := public.next_doc_no('invoice', date '2032-01-02');
  assert a = 'ELI/31-32/0001' and b = 'ELI/31-32/0002' and c = 'ELI/31-32/0003', 'invoice numbers count up inside a financial year: ' || a || b || c;
  assert public.next_doc_no('invoice', date '2032-04-01') = 'ELI/32-33/0001', 'a new financial year restarts at 0001';
  assert public.doc_number('proforma', 'REF-X') = public.doc_number('proforma', 'REF-X'), 'a proforma keeps its number';
  assert public.doc_number('proforma', 'REF-X') like 'ELPI/%' and public.doc_number('challan', 'REF-X') like 'ELDC/%', 'proforma and challan have their own series';
end $$;
select pg_temp.fails($q$select public.next_doc_no('nonsense')$q$, 'Unknown document series');
set role authenticated; select pg_temp.fails($q$select public.next_doc_no('invoice')$q$, 'permission denied'); reset role;

-- ===== order lifecycle =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated; select adjust_stock('N1', 100, 'build15 stock'); reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":5}]') as o15 \gset
reset role;
select set_config('t.o15', :'o15', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated; select approve_order(:'o15'); reset role;
-- proforma is numbered and stable before any payment
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare t1 jsonb; t2 jsonb; begin
  t1 := trade_doc('proforma', current_setting('t.o15')); t2 := trade_doc('proforma', current_setting('t.o15'));
  assert t1 -> 'doc' ->> 'number' ~ '^ELPI/[0-9]{2}-[0-9]{2}/[0-9]{4}$' and t1 -> 'doc' ->> 'number' = t2 -> 'doc' ->> 'number', 'proforma number is from the series and does not change';
end $$;
reset role;
select count(*) as q0 from batch_sync_queue \gset
-- payment confirmed -> the order goes to Batch with its payments
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select confirm_order_payment(:'o15', 'B15UTR001', (select total from orders where id = :'o15'));
reset role;
do $$ declare e public.batch_sync_queue; begin
  select * into e from public.batch_sync_queue where kind = 'order' and ref = current_setting('t.o15') order by id desc limit 1;
  assert e.id is not null and e.status = 'queued', 'confirmed payment queues the order for Batch';
  assert e.payload -> 'partner' ->> 'id' = 'ELP-DLR-0001' and e.payload -> 'order' ->> 'id' = current_setting('t.o15'), 'event carries the partner and order';
  assert jsonb_array_length(e.payload -> 'order' -> 'lines') >= 1 and jsonb_array_length(e.payload -> 'payments') = 1, 'event carries the lines and the payment';
  assert not exists (select 1 from invoices where order_id = current_setting('t.o15')), 'no invoice before dispatch';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, :'o15'), 'issued automatically when the order is dispatched');
reset role;
-- dispatch -> challan number, final invoice, mail, Batch events
select count(*) as m0 from email_outbox \gset
select set_config('t.m0', :'m0', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select dispatch_order(:'o15', 'GJ06 AB 1234', 'LR-15', 'B15-BATCH');
reset role;
do $$ declare i invoices; e public.batch_sync_queue; begin
  select * into i from public.invoices where order_id = current_setting('t.o15');
  assert i.id ~ '^ELI/[0-9]{2}-[0-9]{2}/[0-9]{4}$', 'final invoice issued at dispatch with a series number: ' || coalesce(i.id, 'none');
  assert (select count(*) from public.invoice_lines where invoice_id = i.id) >= 1, 'invoice has lines';
  assert exists (select 1 from public.doc_numbers where kind = 'challan' and ref_id = current_setting('t.o15') and number like 'ELDC/%'), 'challan numbered at dispatch';
  assert (select count(*) from public.email_outbox) > current_setting('t.m0')::int and exists (select 1 from public.email_outbox where body like '%' || i.id || '%' and to_email = 'a@a.com'), 'the partner is mailed the invoice';
  select * into e from public.batch_sync_queue where kind = 'invoice' and ref = current_setting('t.o15');
  assert e.id is not null and e.payload -> 'invoice' ->> 'number' = i.id and e.payload -> 'challan' ->> 'batch_ref' = 'B15-BATCH' and e.payload -> 'challan' ->> 'vehicle' = 'GJ06 AB 1234', 'invoice event carries invoice and challan';
  assert jsonb_array_length(e.payload -> 'invoice' -> 'lines') >= 1, 'invoice event carries lines';
  perform set_config('t.inv15', i.id, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare t jsonb; c jsonb; begin
  t := trade_doc('invoice', current_setting('t.inv15'));
  assert (t -> 'doc' ->> 'paid')::numeric = (t -> 'doc' ->> 'total')::numeric and (t -> 'doc' ->> 'balance')::numeric = 0, 'a pay-and-carry order shows as paid on its invoice';
  assert t -> 'doc' ->> 'vehicle' = 'GJ06 AB 1234', 'invoice shows the vehicle';
  c := trade_doc('challan', current_setting('t.o15'));
  assert c -> 'doc' ->> 'number' ~ '^ELDC/' and c -> 'doc' ->> 'batch_ref' = 'B15-BATCH', 'challan carries its number and batch';
end $$;
reset role;
-- a second dispatch of another order takes the next invoice number
do $$ declare n1 int := (regexp_match(current_setting('t.inv15'), '/([0-9]{4})$'))[1]::int; n2 int; begin
  n2 := (regexp_match(public.next_doc_no('invoice'), '/([0-9]{4})$'))[1]::int;
  assert n2 = n1 + 1, 'the next invoice number follows without a gap';
  raise exception 'ROLLBACK_PROBE' using errcode = 'P0001';
exception when others then if sqlerrm <> 'ROLLBACK_PROBE' then raise; end if;
end $$;

-- ===== invoice-level payment details =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select id as ib, balance as bb from invoice_balances() where balance > 100 order by id limit 1 \gset
select set_config('t.ib', :'ib', false);
do $$ begin assert (select count(*) from invoice_balances()) >= 2, 'accounts sees every invoice balance'; end $$;
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15PAY001',1,'Cash',null,null,null)$q$, :'ib'), 'Choose how');
select pg_temp.fails(format($q$select record_invoice_payment(%L,'12',1,'UPI',null,null,null)$q$, :'ib'), 'at least 6');
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15PAY001',1,'UPI',current_date+2,null,null)$q$, :'ib'), 'future');
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15PAY001',1,'UPI',current_date-300,null,null)$q$, :'ib'), '180 days');
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15PAY001',%s,'UPI',null,null,null)$q$, :'ib', :'bb'::numeric + 1), 'more than the balance');
select pg_temp.fails($q$select record_invoice_payment('ELI/NOPE','B15PAY001',1,'UPI',null,null,null)$q$, 'Invoice not found');
select record_invoice_payment(:'ib', 'B15PAY001', 100, 'UPI', current_date, 'HDFC Bank', 'part') as r1 \gset
reset role;
do $$ begin
  assert (select paid from invoice_balances() where id = (select invoice_id from invoice_payments where utr = 'B15PAY001')) >= 100, 'payment counted';
  assert (select mode from invoice_payments where utr = 'B15PAY001') = 'UPI' and (select bank from invoice_payments where utr = 'B15PAY001') = 'HDFC Bank', 'mode and bank stored';
end $$;
set role authenticated;
select pg_temp.fails(format($q$select record_invoice_payment(%L,'b15pay001 ',1,'UPI',null,null,null)$q$, :'ib'), 'already recorded');
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15UTR001',1,'UPI',null,null,null)$q$, :'ib'), 'already recorded');
reset role;
do $$ declare ib text := (select invoice_id from public.invoice_payments where utr = 'B15PAY001'); begin
  assert exists (select 1 from public.ledger_entries where ref = ib and kind = 'payment' and credit = 100 and utr = 'B15PAY001'), 'payment credited in the partner ledger';
  assert exists (select 1 from public.batch_sync_queue where kind = 'payment' and payload ->> 'invoice_no' = ib and (payload ->> 'amount')::numeric = 100 and payload ->> 'utr' = 'B15PAY001'), 'payment queued for Batch accounting';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select record_invoice_payment(:'ib', 'B15PAY002', (select balance from invoice_balances() where id = :'ib'), 'Bank transfer (NEFT / RTGS / IMPS)', null, null, null) as r2 \gset
do $$ begin assert (select balance from invoice_balances() where id = current_setting('t.ib')) = 0, 'the invoice is settled'; end $$;
reset role;
do $$ begin assert (select count(*) from public.batch_sync_queue where kind = 'payment' and payload ->> 'invoice_no' = current_setting('t.ib')) = 2, 'both invoice payments queued';
  assert exists (select 1 from public.batch_sync_queue where kind = 'payment' and payload ->> 'invoice_no' is null and payload -> 'partner' ->> 'id' is not null), 'a manual advance is queued with the partner details'; end $$;
-- who may record, who may see
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails(format($q$select record_invoice_payment(%L,'B15PAY009',1,'UPI',null,null,null)$q$, :'ib'), 'Only Accounts');
do $$ begin assert (select count(*) from invoice_balances()) >= 1 and (select count(*) from invoice_balances() b join invoices i on i.id = b.id where i.partner_id <> 'ELP-DLR-0001') = 0, 'a partner sees balances of own invoices only'; end $$;
select pg_temp.fails($q$select * from batch_sync_status()$q$, 'Only Accounts');
select pg_temp.fails($q$select count(*) from batch_sync_queue$q$, 'permission denied');
select pg_temp.fails($q$select count(*) from invoice_payments$q$, 'permission denied');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from invoice_balances()) = (select count(*) from invoices where partner_id = 'ELP-DLR-0002'), 'dealer 2 sees only own balances'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
do $$ declare s jsonb; begin s := batch_sync_status(); assert (s ->> 'linked')::boolean = false and (s ->> 'queued')::int >= 3, 'status shows unlinked with queued events'; end $$;
reset role;
do $$ begin assert public.batch_sync_flush() = 0, 'nothing is sent while the Batch link is not configured'; end $$;
set role authenticated; select pg_temp.fails($q$select public.batch_sync_flush()$q$, 'permission denied'); reset role;

-- ===== QR verification (public) =====
set role anon;
do $$ begin assert (select count(*) from verify_document(current_setting('t.inv15'))) = 1, 'anyone holding the QR can verify the number'; end $$;
reset role;
do $$ declare v record; begin
  select * into v from public.verify_document(current_setting('t.inv15'));
  assert v.valid and v.kind = 'Tax invoice' and v.amount = (select total from public.invoices where id = current_setting('t.inv15')), 'an invoice number verifies with its amount';
  assert (select count(*) from public.verify_document(lower(current_setting('t.inv15')))) = 1, 'verification ignores case';
  assert (select count(*) from public.verify_document('ELI/99-00/9999')) = 0, 'an unknown number does not verify';
  assert exists (select 1 from public.verify_document((select number from public.doc_numbers where kind = 'challan' limit 1)) where kind = 'Delivery challan'), 'a challan number verifies';
end $$;

-- ===== vendor documents =====
select id as ro_other from release_orders where vendor_id <> 'VND-0001' order by id limit 1 \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ declare t jsonb; ro text; begin
  select id into ro from release_orders where vendor_id = 'VND-0001' order by id limit 1;
  t := trade_doc('rpo', ro);
  assert t -> 'doc' ->> 'number' = ro and t -> 'partner' ->> 'id' = 'VND-0001' and t -> 'partner' ->> 'type' = 'vendor', 'purchase order for a release order, vendor as the other party';
  assert jsonb_array_length(t -> 'lines') = 1 and (t -> 'lines' -> 0 ->> 'amount')::numeric = (select total from release_orders where id = ro), 'one line with the order amount';
end $$;
do $$ declare t jsonb; ro text; begin
  select id into ro from release_orders where vendor_id = 'VND-0001' and status = 'Received' limit 1;
  if ro is not null then
    t := trade_doc('vdn', ro);
    assert t -> 'doc' ->> 'number' ~ '^ELVD/[0-9]{2}-[0-9]{2}/[0-9]{4}$' and t -> 'doc' ->> 'number' = trade_doc('vdn', ro) -> 'doc' ->> 'number', 'vendor dispatch note is numbered and stable';
  end if;
  select id into ro from release_orders where vendor_id = 'VND-0001' and status = 'Approved' limit 1;
  if ro is not null then perform pg_temp.fails(format($q$select trade_doc('vdn', %L)$q$, ro), 'not been dispatched'); end if;
end $$;
select pg_temp.fails(format($q$select trade_doc('rpo', %L)$q$, :'ro_other'), 'not found');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select pg_temp.fails(format($q$select trade_doc('rpo', %L)$q$, :'ro_other'), 'not found');
reset role;
select 'build15 OK' as result;
