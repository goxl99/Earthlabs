\set ON_ERROR_STOP on
-- Build 11 tests (walkthrough completion): Offers & credit for partners, vendor invoices and delivery updates.
-- Runs last, on the same database. Users: ...01 super, ...02 sales, ...03 partner ELP-DLR-0001, ...04 dealer ELP-DLR-0002,
-- ...05 accounts, ...06 warehouse, ...0b vendor VND-0001 (active), ...0c vendor VND-0002 (unverified).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
reset role;

-- ===================== A. OFFERS & CREDIT =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ declare c jsonb; begin
  c := my_credit();
  assert c ->> 'partner_id' = 'ELP-DLR-0002', 'a partner sees only their own credit record';
  assert (c ->> 'level')::int >= 0, 'level is returned';
  assert jsonb_array_length(c -> 'ladder') >= 2, 'the ladder is returned so the partner sees the steps';
  assert (c ->> 'pay_and_carry') in ('true','false'), 'pay-and-carry flag is returned';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select my_credit()$q$, 'partners only');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails($q$select my_credit()$q$, 'partners only');
reset role;
select pg_temp.as_user(null); set role anon;
select pg_temp.fails($q$select my_credit()$q$, 'permission denied');
reset role;
\echo BUILD 11 OFFERS TESTS PASSED

-- ===================== B. VENDOR PORTAL COMPLETION =====================
reset role;
insert into release_orders(id, vendor_id, rm_id, qty, rate, lead_days, status, pay_mode, pay_status, pay_amount) values
  ('RO-T-0001','VND-0001',(select id from raw_materials limit 1),10,100,5,'Approved','Advance','Unpaid',0),
  ('RO-T-0002','VND-0001',(select id from raw_materials limit 1),10,100,5,'Dispatched','Advance','Paid',0),
  ('RO-T-0003','VND-0001',(select id from raw_materials limit 1),10,100,5,'Approved','Advance','Paid',0);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
-- invoices
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0001','INV-1',current_date,1180,null)$q$, 'after you have dispatched');
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0002','',current_date,1180,null)$q$, 'invoice number');
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0002','INV-1',current_date + 3,1180,null)$q$, 'not in the future');
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0002','INV-1',current_date,0,null)$q$, 'invoice amount');
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0002','INV-1',current_date,1180,'VND-0002/x.pdf')$q$, 'Bad file path');
select submit_vendor_invoice('RO-T-0002','INV-1',current_date,1180,'VND-0001/inv1.pdf') as vinv \gset
select set_config('t.vinv', :'vinv', false);
select pg_temp.fails($q$select submit_vendor_invoice('RO-T-0002','INV-1',current_date,1180,null)$q$, 'already uploaded');
do $$ begin
  assert (select count(*) from vendor_invoices)=1, 'vendor sees own invoices';
  assert (select status from vendor_invoices)='Submitted', 'starts Submitted';
  assert (vendor_dashboard() ->> 'payments_due')::numeric = 1180, 'payments due counts open invoices';
end $$;
select pg_temp.fails($q$update vendor_invoices set status='Paid'$q$, 'permission denied');
select pg_temp.fails($q$select decide_vendor_invoice(current_setting('t.vinv'), true, null)$q$, 'Only Accounts');
select pg_temp.fails($q$select pay_vendor_invoice(current_setting('t.vinv'), 'UTR123456')$q$, 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from vendor_invoices)=0, 'a partner sees no vendor invoices'; end $$;
select pg_temp.fails($q$select vendor_dashboard()$q$, 'vendors only');
do $$ declare d jsonb; begin d := partner_dashboard(); assert d ->> 'partner_id' = 'ELP-DLR-0002', 'partner dashboard is own'; assert d ? 'sales_month' and d ? 'next_step' and d ? 'score' and d ? 'outstanding', 'walkthrough tiles present'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select decide_vendor_invoice(current_setting('t.vinv'), true, null)$q$, 'Only Accounts');
select pg_temp.fails($q$select partner_dashboard()$q$, 'partners only');
do $$ begin assert (select count(*) from vendor_invoices)=0, 'sales cannot read vendor invoices'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails($q$select pay_vendor_invoice(current_setting('t.vinv'), 'UTR123456')$q$, 'Accept the invoice');
select pg_temp.fails($q$select decide_vendor_invoice(current_setting('t.vinv'), false, '')$q$, 'reason');
select decide_vendor_invoice(current_setting('t.vinv'), true, null);
select pg_temp.fails($q$select decide_vendor_invoice(current_setting('t.vinv'), true, null)$q$, 'already accepted');
select pg_temp.fails($q$select pay_vendor_invoice(current_setting('t.vinv'), 'ab')$q$, 'UTR');
select pay_vendor_invoice(current_setting('t.vinv'), 'UTR123456');
do $$ begin assert (select status from vendor_invoices)='Paid', 'paid'; end $$;
reset role;
-- the same UTR cannot pay a second invoice
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select submit_vendor_invoice('RO-T-0002','INV-2',current_date,500,null) as vinv2 \gset
select set_config('t.vinv2', :'vinv2', false);
do $$ begin assert (vendor_dashboard() ->> 'payments_due')::numeric = 500, 'paid invoices are no longer due'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select decide_vendor_invoice(current_setting('t.vinv2'), true, null);
select pg_temp.fails($q$select pay_vendor_invoice(current_setting('t.vinv2'), 'utr123456')$q$, 'UTR is already used');
reset role;
-- purchase order rejection and delivery updates
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails($q$select vendor_reject_ro('RO-T-0003','')$q$, 'reason');
select pg_temp.fails($q$select vendor_reject_ro('RO-T-0003','cannot supply')$q$, 'cannot be rejected');       -- already paid
select pg_temp.fails($q$select vendor_reject_ro('RO-T-0002','cannot supply')$q$, 'cannot be rejected');       -- already dispatched
select pg_temp.fails($q$select vendor_delivery_update('RO-T-0001','Dispatched','left today')$q$, 'Payment has not been released');
select pg_temp.fails($q$select vendor_delivery_update('RO-T-0001','Teleported',null)$q$, 'In production or Dispatched');
select pg_temp.fails($q$select vendor_delivery_update('RO-T-0002','In production',null)$q$, 'open purchase order');
select vendor_delivery_update('RO-T-0001','In production','film is on the line');
do $$ begin assert exists (select 1 from ro_events where ro_id='RO-T-0001' and note like 'In production%'), 'delivery update is logged'; end $$;
select vendor_delivery_update('RO-T-0003','Dispatched','LR 4521');
do $$ begin assert (select status from release_orders where id='RO-T-0003')='Dispatched', 'dispatch update moves the order'; end $$;
select vendor_reject_ro('RO-T-0001','cannot supply this month');
reset role;   -- a rejected order is hidden from the vendor by ro_read, so check as the owner
do $$ begin assert (select status from release_orders where id='RO-T-0001')='Rejected', 'vendor rejection recorded'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ declare d jsonb; begin d := vendor_dashboard(); assert d ->> 'vendor_id'='VND-0001' and d ? 'open_pos' and d ? 'open_rfqs' and d ? 'score' and d ? 'payments_due', 'vendor tiles present'; end $$;
reset role;
select pg_temp.as_user(null); set role anon;
select pg_temp.fails($q$select vendor_dashboard()$q$, 'permission denied');
select pg_temp.fails($q$select partner_dashboard()$q$, 'permission denied');
reset role;
delete from vendor_invoices; delete from ro_events where ro_id like 'RO-T-%'; delete from release_orders where id like 'RO-T-%';
\echo BUILD 11 VENDOR PORTAL TESTS PASSED

-- ===================== C. AI DEFER =====================
reset role;
insert into ai_recommendations(kind,title,reasons,target_kind,target_id,payload) values ('lead_time','Lead time test','["r"]','rm',(select id from raw_materials limit 1),'{"lead_days":9}') returning id as air \gset
select set_config('t.air', :'air', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select defer_ai_recommendation(current_setting('t.air')::bigint)$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select defer_ai_recommendation(:air, 'wait for next month');
do $$ begin assert (select status from ai_recommendations where title='Lead time test')='Deferred', 'deferred'; end $$;
select pg_temp.fails($q$select defer_ai_recommendation((select id from ai_recommendations where title='Lead time test'))$q$, 'pending');
select decide_ai_recommendation(:air, true, null);
do $$ begin assert (select status from ai_recommendations where title='Lead time test')='Approved', 'a deferred item can still be approved'; assert (select lead_days from raw_materials where id=(select target_id from ai_recommendations where title='Lead time test'))=9, 'approval applied'; end $$;
reset role;
delete from ai_recommendations where title='Lead time test';
\echo BUILD 11 AI DEFER TESTS PASSED
