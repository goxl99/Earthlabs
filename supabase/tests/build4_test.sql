\set ON_ERROR_STOP on
-- Build 5 tests (money): invoices with GST split, credit notes, append-only ledger, manual payments, payment proofs and the confirmation gate.
-- Runs after build3_test.sql on the same database (users ...01 boss, ...02 sales, ...03 dealer1 ELP-DLR-0001, ...04 dealer2 ELP-DLR-0002, ...05 accounts, ...06 warehouse).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;

-- fixtures: dealer1's dispatched order from build 3 (paid by UTR000111 + UTR000222), a fresh approved order for the proof flow, dealer2 outside Gujarat
select id as o_paid from orders where partner_id='ELP-DLR-0001' and status in ('Dispatched','Delivered') and exists (select 1 from order_payments p where p.order_id = orders.id) order by id desc limit 1 \gset
select set_config('t.o_paid', :'o_paid', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":20}]') as o_new \gset
select set_config('t.o_new', :'o_new', false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select approve_order(:'o_new');
reset role;

-- ===== Ledger: payments from the order workflow are already in the ledger; nobody writes it directly =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
do $$ begin assert (select coalesce(sum(credit),0) from ledger_entries where ref=current_setting('t.o_paid') and kind='payment') = (select total from orders where id=current_setting('t.o_paid')), 'confirmed order payments are credited in the ledger'; end $$;
select pg_temp.fails($q$insert into ledger_entries(partner_id,kind,ref,debit) values ('ELP-DLR-0001','adjustment','x',5)$q$, 'permission denied');
select pg_temp.fails($q$update ledger_entries set credit=0$q$, 'permission denied');
reset role;
select pg_temp.fails($q$update ledger_entries set narration='edited'$q$, 'cannot be changed');
select pg_temp.fails($q$delete from ledger_entries$q$, 'cannot be changed');

-- ===== Invoices: roles, gate, GST split, amounts only from the order =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, current_setting('t.o_paid')), 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, current_setting('t.o_paid')), 'Only Accounts');
select pg_temp.fails($q$insert into invoices(order_id,partner_id,supply_state,taxable,total) values ('x','ELP-DLR-0001','Gujarat',1,1)$q$, 'permission denied');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, current_setting('t.o_new')), 'after payment is confirmed');
select ledger_balance('ELP-DLR-0001') as b0 \gset
select set_config('t.b0', :'b0', false);
select issue_invoice(current_setting('t.o_paid')) as inv1 \gset
select set_config('t.inv1', :'inv1', false);
do $$ declare i invoices; o orders; begin
  select * into i from invoices where id=current_setting('t.inv1'); select * into o from orders where id=current_setting('t.o_paid');
  assert i.total = o.total and i.taxable = o.net, 'invoice amounts are copied from the database-priced order';
  assert i.igst = 0 and i.cgst + i.sgst = o.gst and abs(i.cgst - i.sgst) <= 0.01, 'inside Gujarat the GST is split CGST and SGST';
  assert (select count(*) from invoice_lines where invoice_id = i.id) = (select count(*) from order_lines where order_id = o.id), 'every order line is on the invoice';
  assert (select sum(amount) from invoice_lines where invoice_id = i.id) = o.taxable, 'invoice lines add up to the order goods value';
end $$;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, current_setting('t.o_paid')), 'already has an invoice');
do $$ begin assert (select ledger_balance('ELP-DLR-0001')) = current_setting('t.b0')::numeric + (select total from invoices where id=current_setting('t.inv1')), 'the invoice is debited to the partner ledger'; end $$;
reset role;
select pg_temp.fails($q$update invoices set total=1$q$, 'cannot be changed');
select pg_temp.fails($q$delete from invoice_lines$q$, 'cannot be changed');

-- ===== Partner sees only own money =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from invoices)=1 and (select count(*) from ledger_entries where partner_id <> 'ELP-DLR-0001')=0, 'dealer 1 sees only own invoices and ledger'; end $$;
do $$ begin assert (dashboard_stats()->>'ledger_balance')::numeric = (select ledger_balance('ELP-DLR-0001')), 'partner dashboard shows own ledger balance'; end $$;
select pg_temp.fails($q$select ledger_balance('ELP-DLR-0002')$q$, 'Not allowed');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from invoices)=0 and (select count(*) from ledger_entries)=0 and (select count(*) from credit_notes)=0, 'dealer 2 sees nothing of dealer 1'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin assert (select count(*) from ledger_entries)=0 and (select count(*) from invoices)=0, 'warehouse cannot read the ledger or invoices'; end $$;
reset role;

-- ===== Credit notes =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select issue_credit_note(%L,100,'Damaged goods returned')$q$, current_setting('t.inv1')), 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select issue_credit_note(%L,100,'no')$q$, current_setting('t.inv1')), 'reason is required');
select pg_temp.fails(format($q$select issue_credit_note(%L,0,'Damaged goods returned')$q$, current_setting('t.inv1')), 'above zero');
select pg_temp.fails(format($q$select issue_credit_note(%L,(select total + 1 from invoices where id=%L),'Damaged goods returned')$q$, current_setting('t.inv1'), current_setting('t.inv1')), 'cannot exceed');
select issue_credit_note(current_setting('t.inv1'), 118, 'Damaged goods returned') as cn1 \gset
do $$ declare c credit_notes; begin
  select * into c from credit_notes where invoice_id = current_setting('t.inv1');
  assert c.amount = 118 and c.taxable + c.cgst + c.sgst + c.igst = 118 and c.igst = 0, 'credit note GST split follows the invoice';
  assert (select ledger_balance('ELP-DLR-0001')) = current_setting('t.b0')::numeric + (select total from invoices where id=current_setting('t.inv1')) - 118, 'credit note reduces what the partner owes';
end $$;
select pg_temp.fails(format($q$select issue_credit_note(%L,(select total from invoices where id=%L),'Second credit too large')$q$, current_setting('t.inv1'), current_setting('t.inv1')), 'cannot exceed');
reset role;
select pg_temp.fails($q$delete from credit_notes$q$, 'cannot be changed');

-- an invoiced order cannot be cancelled until the invoice is fully credited (dispatched orders cannot be cancelled at all; test the guard directly)
select pg_temp.fails(format($q$update orders set status='Cancelled' where id=%L$q$, current_setting('t.o_paid')), 'An order cannot move from Dispatched to Cancelled|credit notes');

-- ===== Manual payment entry =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select record_payment('ELP-DLR-0002','ADV000001',5000,'Bank transfer','advance')$q$, 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails($q$select record_payment('ELP-DLR-0002','123',5000,'Bank transfer','advance')$q$, 'at least 6');
select pg_temp.fails($q$select record_payment('ELP-DLR-0002','ADV000001',-1,'Bank transfer','advance')$q$, 'above zero');
select pg_temp.fails($q$select record_payment('ELP-NOPE-0009','ADV000001',5000,'Bank transfer','advance')$q$, 'Partner not found');
select pg_temp.fails($q$select record_payment('ELP-DLR-0002','utr000111',5000,'Bank transfer','advance')$q$, 'already recorded');   -- an order payment used this UTR
select record_payment('ELP-DLR-0002','ADV000001',5000,'Bank transfer','advance');
select pg_temp.fails($q$select record_payment('ELP-DLR-0001',' adv000001 ',5000,'Bank transfer','again')$q$, 'already recorded');
do $$ begin assert (select ledger_balance('ELP-DLR-0002')) = -5000, 'manual advance credited to the partner'; end $$;
reset role;

-- ===== Partner payment proof and the confirmation gate =====
select (select total from orders where id=current_setting('t.o_new')) as tot_new \gset
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR900001',100,null,null)$q$, current_setting('t.o_new')), 'Order not found');   -- another partner's order
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR900001',100,null,null)$q$, current_setting('t.o_paid')), 'approved order');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'12',100,null,null)$q$, current_setting('t.o_new')), 'at least 6');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR900001',0,null,null)$q$, current_setting('t.o_new')), 'amount you paid');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR900001',100,'ELP-DLR-0002/advice.pdf',null)$q$, current_setting('t.o_new')), 'own folder');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR900001',100,'ELP-DLR-0001/../x.pdf',null)$q$, current_setting('t.o_new')), 'own folder');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'UTR000111',100,null,null)$q$, current_setting('t.o_new')), 'already been used');   -- UTR of an earlier confirmed payment
select pg_temp.fails(format($q$select submit_payment_proof(%L,'ADV000001',100,null,null)$q$, current_setting('t.o_new')), 'already been used');    -- UTR of a manual payment
select pg_temp.fails($q$insert into payment_proofs(partner_id,order_id,utr,amount) values ('ELP-DLR-0001','x','UTR900001',1)$q$, 'permission denied');
select submit_payment_proof(current_setting('t.o_new'), 'UTR900001', :tot_new, 'ELP-DLR-0001/advice1.pdf', 'paid by NEFT') as pf1 \gset
select pg_temp.fails(format($q$select submit_payment_proof(%L,' utr900001 ',100,null,null)$q$, current_setting('t.o_new')), 'already been used');   -- same UTR twice
do $$ begin assert (select count(*) from payment_proofs)=1, 'partner sees own proof'; end $$;
select pg_temp.fails(format($q$select confirm_payment_proof(%s)$q$, :pf1), 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from payment_proofs)=0, 'other partner cannot see the proof'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin assert (select count(*) from payment_proofs)=0, 'warehouse cannot see payment proofs'; end $$;
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.o_new'))='Approved', 'submitting proof alone does not release the order'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
do $$ begin assert (dashboard_stats()->>'proofs_to_check')::int = 1 and (dashboard_stats()->>'orders_to_invoice')::int >= 0, 'accounts dashboard shows the proof queue'; end $$;
select pg_temp.fails(format($q$select reject_payment_proof(%s,'no')$q$, :pf1), 'reason is required');
select confirm_payment_proof(:pf1) as res \gset
do $$ begin assert (select status from orders where id=current_setting('t.o_new'))='Payment Confirmed', 'Accounts confirmation moves the order on';
            assert (select status from payment_proofs where reviewed_by is not null limit 1)='Confirmed', 'proof marked confirmed'; end $$;
select pg_temp.fails(format($q$select confirm_payment_proof(%s)$q$, :pf1), 'already confirmed');
select pg_temp.fails(format($q$select reject_payment_proof(%s,'Not matching the bank')$q$, :pf1), 'already confirmed');
-- invoice the second order too, then partner balance
select issue_invoice(current_setting('t.o_new'));
do $$ begin assert (select ledger_balance('ELP-DLR-0001')) = current_setting('t.b0')::numeric + (select total from invoices where id=current_setting('t.inv1')) - 118, 'a paid and invoiced order leaves the balance unchanged'; end $$;
reset role;

-- rejection path: a rejected proof frees the UTR and the partner may resubmit
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":20}]') as o_rej \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_order(:'o_rej');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select submit_payment_proof(:'o_rej', 'UTR900002', 10, null, null) as pf2 \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select reject_payment_proof(:pf2, 'Amount does not match the bank statement');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from notifications where title like 'Payment proof not accepted%')=1, 'partner is told why the proof was rejected'; end $$;
select submit_payment_proof(:'o_rej', 'UTR900002', 20, null, null);
reset role;

-- ===== IGST outside the company state =====
update partners set state='Maharashtra' where id='ELP-DLR-0002';
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select place_order('[{"sku":"N1","cartons":20}]') as o_mh \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_order(:'o_mh');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select (select total from orders where id=:'o_mh') as tot_mh \gset
select confirm_order_payment(:'o_mh', 'UTR900003', :tot_mh);
select issue_invoice(:'o_mh') as inv_mh \gset
do $$ declare i invoices; begin select * into i from invoices where order_id = (select id from orders where partner_id='ELP-DLR-0002' and status='Payment Confirmed' limit 1);
  assert i.igst > 0 and i.cgst = 0 and i.sgst = 0, 'outside Gujarat the GST is IGST'; end $$;
select issue_credit_note(:'inv_mh', 59, 'Short supply adjustment') as cn_mh \gset
do $$ declare c credit_notes; begin select * into c from credit_notes where partner_id='ELP-DLR-0002'; assert c.igst > 0 and c.cgst = 0, 'credit note on an IGST invoice is IGST'; end $$;
-- cancel only after the full invoice is credited
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select cancel_order(%L,'Partner asked to cancel')$q$, :'o_mh'), 'credit notes for the full invoice');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select issue_credit_note(:'inv_mh', (select total - 59 from invoices where id=:'inv_mh'), 'Order cancelled, full refund');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select cancel_order(:'o_mh', 'Partner asked to cancel');
reset role;
do $$ begin assert (select status from orders where partner_id='ELP-DLR-0002' and cancel_reason is not null)='Cancelled', 'fully credited invoice allows cancellation'; end $$;

-- ===== Audit =====
do $$ begin
  assert (select count(*) from audit_log where table_name='invoices')=3, 'invoices audited';
  assert (select count(*) from audit_log where table_name='credit_notes')=3, 'credit notes audited';
  assert (select count(*) from audit_log where table_name='payment_proofs')>=5, 'payment proofs audited';
  assert (select count(*) from audit_log where table_name='ledger_entries')>=8, 'ledger postings audited';
end $$;
\echo BUILD 4 (money) TESTS PASSED

-- ===== E-sign (Leegality) database side =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$select esign_started(gen_random_uuid(),'DOC1','https://x')$q$, 'permission denied');
select pg_temp.fails($q$select esign_completed('DOC1','ELP-DLR-0005/a.pdf')$q$, 'permission denied');
reset role;
insert into partners(id,type_code,name,district,state) values ('ELP-DLR-0006','DLR','E-sign Test','Surat','Gujarat');
insert into mou_templates(name,storage_path) values ('Plain MOU','_templates/plain.pdf');
select create_agreement('ELP-DLR-0006', (select id from mou_templates where name='Plain MOU')) as ag \gset
select esign_started(:'ag', 'LGDOC-1', 'https://sandbox.example/sign/abc');
do $$ begin assert (select status from agreements where esign_document_id='LGDOC-1')='Sent' and (select esign_provider from agreements where esign_document_id='LGDOC-1')='leegality', 'e-sign request marks the agreement Sent'; end $$;
select pg_temp.fails($q$select esign_completed('LGDOC-1','ELP-DLR-0001/signed.pdf')$q$, 'Bad file path');   -- another partner's folder
select pg_temp.fails($q$select esign_completed('UNKNOWN','ELP-DLR-0006/signed.pdf')$q$, 'No agreement');
do $$ begin assert (select status from partners where id='ELP-DLR-0006')='Agreement Pending', 'partner not active before the signature'; end $$;
select esign_completed('LGDOC-1','ELP-DLR-0006/signed.pdf') as code \gset
do $$ begin
  assert (select status from agreements where esign_document_id='LGDOC-1')='Signed', 'verified completion marks the agreement Signed';
  -- Since migration 022 a signature does not activate the partner: Super Admin approves the signed MOU first.
  assert (select status from partners where id='ELP-DLR-0006')='Agreement Pending', 'partner stays Agreement Pending until the signed MOU is approved';
  assert (select count(*) from certificates where partner_id='ELP-DLR-0006')=0, 'no certificate before approval';
  assert esign_completed('LGDOC-1','ELP-DLR-0006/signed.pdf') is null, 'a repeated webhook changes nothing';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select activate_partner('ELP-DLR-0006');
reset role;
do $$ begin
  assert (select status from partners where id='ELP-DLR-0006')='Active', 'partner becomes Active after the signed MOU is approved';
  assert (select count(*) from certificates where partner_id='ELP-DLR-0006')=1, 'certificate issued';
end $$;
select pg_temp.fails($q$select esign_started((select id from agreements where esign_document_id='LGDOC-1'),'DOC9','x')$q$, 'already signed');
\echo E-SIGN DB TESTS PASSED
