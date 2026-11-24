\set ON_ERROR_STOP on
-- Build 9 tests: module switches, My network, RFQs and quotes (vendors never see a competitor's rate), awarding creates a release order
-- that still goes through the payment gate, vendor scorecard, BOM planning, computed scoring inputs, WhatsApp outbox.
-- Runs after build8 on the same database. Users: ...01 super, ...02 sales, ...03 partner ELP-DLR-0001 (promoted to DST in build 7),
-- ...04 dealer ELP-DLR-0002, ...05 accounts, ...06 warehouse, ...0b vendor VND-0001 (active), ...0c vendor VND-0002 (unverified).
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

-- ===================== A. MODULE SWITCHES =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select set_module('rfq', false)$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$select set_module('users', false)$q$, 'core');
select pg_temp.fails($q$select set_module('audit', false)$q$, 'core');
select pg_temp.fails($q$select set_module('nonsense', false)$q$, 'Unknown module');
select set_module('rfq', false);
do $$ begin assert (my_modules() ->> 'rfq') = 'false', 'the switch is stored'; assert module_enabled('orders'), 'unswitched modules stay on'; end $$;
reset role;
-- a switched-off module refuses its actions for everyone, including Super Admin
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select create_rfq('RM-T1', 100, null, array['VND-0001'], null)$q$, 'switched off');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select set_module('rfq', true);
reset role;
do $$ begin assert (select count(*) from audit_log where table_name='settings' and row_key='modules') >= 1, 'switching a module is audited'; end $$;

-- ===================== B. MY NETWORK =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select pg_temp.fails($q$select set_partner_parent('ELP-DLR-0002','ELP-DLR-0001')$q$, 'Only Super Admin or Sales');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select set_partner_parent('ELP-DLR-0002','ELP-DLR-0002')$q$, 'own parent');
select pg_temp.fails($q$select set_partner_parent('ELP-DLR-0001','ELP-DLR-0002')$q$, 'higher level');         -- a distributor cannot sit under a dealer
select pg_temp.fails($q$select set_partner_parent('ELP-DLR-0002','ELP-NOPE-0001')$q$, 'not found');
select set_partner_parent('ELP-DLR-0002','ELP-DLR-0001');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin
  assert (select count(*) from my_network()) = 1 and (select id from my_network()) = 'ELP-DLR-0002', 'a distributor sees only the dealers linked to it';
  assert (select count(*) from partners where id = 'ELP-DLR-0002') = 0, 'the network view does not open the dealer record itself (GSTIN, credit level stay hidden)';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from my_network()) = 0, 'a dealer with no children sees an empty network'; end $$;
reset role;

-- ===================== C. RFQ, QUOTES, AWARD =====================
-- a second active vendor for the same material
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select set_vendor_status('VND-0002','Active');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select create_rfq('RM-T1', 100, null, array['VND-0001'], null)$q$, 'Only Warehouse');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select create_rfq('RM-T1', 100, null, array[]::text[], null)$q$, 'at least one vendor');
select pg_temp.fails($q$select create_rfq('RM-T1', 100, null, array['VND-9999'], null)$q$, 'not active');
select pg_temp.fails($q$select create_rfq('RM-NOPE', 100, null, array['VND-0001'], null)$q$, 'not found');
select pg_temp.fails($q$select create_rfq('RM-T1', 0, null, array['VND-0001'], null)$q$, 'check|qty');
select create_rfq('RM-T1', 500, current_date + 20, array['VND-0001','VND-0002'], 'test rfq') as rfq \gset
reset role;
select set_config('t.rfq', :'rfq', false);
do $$ begin assert (select count(*) from email_outbox where subject like 'Request for quotation%') >= 2, 'invited vendors are e-mailed'; end $$;
-- an uninvited vendor (no invite) cannot quote; create a third vendor to prove it
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select create_vendor('Vendor Three','P3','v3@example.test','3','x','Surat') as v3 \gset
select set_vendor_status(:'v3','Active');
reset role;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000d','v3@x') on conflict do nothing;
update profiles set role='vendor', active=true, vendor_id=:'v3' where id='00000000-0000-0000-0000-00000000000d';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); set role authenticated;
select pg_temp.fails(format($q$select submit_quote(%L, 80, 5, null)$q$, current_setting('t.rfq')), 'not invited');
do $$ begin assert (select count(*) from rfqs) = 0, 'an uninvited vendor does not see the RFQ'; end $$;
reset role;
-- invited vendors quote; each sees only its own quote
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails(format($q$select submit_quote(%L, 0, 5, null)$q$, current_setting('t.rfq')), 'check|rate');
select pg_temp.fails(format($q$select submit_quote(%L, 80, 5, current_date - 1)$q$, current_setting('t.rfq')), 'in the past');
select pg_temp.fails($q$insert into quotes(rfq_id,vendor_id,rate,lead_days) values ('x','VND-0001',1,1)$q$, 'permission denied');   -- no direct writes
select submit_quote(current_setting('t.rfq'), 88, 6, current_date + 10);
select submit_quote(current_setting('t.rfq'), 85, 6, current_date + 10);                                                           -- re-quote replaces
do $$ begin assert (select count(*) from quotes) = 1 and (select rate from quotes) = 85, 'a re-quote replaces the earlier one'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select submit_quote(current_setting('t.rfq'), 79, 9, current_date + 10);
do $$ begin
  assert (select count(*) from quotes) = 1 and (select vendor_id from quotes) = 'VND-0002', 'a vendor never sees a competitor''s rate';
  assert (select count(*) from rfq_invites) = 1, 'a vendor sees only its own invite';
end $$;
reset role;
-- staff see both; partners see none
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin assert (select count(*) from quotes) = 2, 'staff compare all quotes'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from quotes) = 0 and (select count(*) from rfqs) = 0, 'partners cannot read RFQs or quotes'; end $$;
reset role;
-- only Super Admin awards
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select award_quote((select id from quotes where vendor_id = 'VND-0002'))$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select award_quote((select id from quotes where vendor_id = 'VND-0002')) as po \gset
select pg_temp.fails($q$select award_quote((select id from quotes where vendor_id = 'VND-0001'))$q$, 'not open');             -- already awarded
reset role;
select set_config('t.po', :'po', false);
do $$ declare r release_orders; begin
  select * into r from release_orders where id = current_setting('t.po');
  assert r.vendor_id = 'VND-0002' and r.rate = 79 and r.lead_days = 9 and r.qty = 500 and r.total = 39500, 'the purchase order carries the awarded quote, total computed by the database';
  assert (select status from quotes where vendor_id = 'VND-0002' and rfq_id = current_setting('t.rfq')) = 'Accepted', 'the winning quote is Accepted';
  assert (select status from quotes where vendor_id = 'VND-0001' and rfq_id = current_setting('t.rfq')) = 'Rejected', 'the others are Rejected';
  assert (select status from rfqs where id = current_setting('t.rfq')) = 'Awarded', 'the RFQ is Awarded';
  assert r.status in ('Pending approval','Approved'), 'the purchase order starts in the normal release-order flow';
  assert (select count(*) from audit_log where table_name = 'quotes') >= 3, 'quotes are audited';
end $$;
-- the purchase order cannot be dispatched by the vendor before payment (same gate as any release order)
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin if (select status from release_orders where id = current_setting('t.po')) = 'Pending approval' then perform approve_release_order(current_setting('t.po')); end if; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select vendor_acknowledge_ro(current_setting('t.po'));
select pg_temp.fails(format($q$select vendor_dispatch_ro(%L)$q$, current_setting('t.po')), 'payment|paid|advance');
reset role;
-- closing: an RFQ nobody awarded can be closed and then refuses quotes
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select create_rfq('RM-T1', 50, null, array['VND-0001'], null) as rfq2 \gset
select close_rfq(:'rfq2');
select pg_temp.fails(format($q$select close_rfq(%L)$q$, :'rfq2'), 'not open');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails(format($q$select submit_quote(%L, 80, 5, null)$q$, :'rfq2'), 'closed');
reset role;

-- ===================== D. VENDOR SCORECARD =====================
-- make the awarded order Received on time, so vendor two has data; vendor one has only an unanswered... quoted invite
update release_orders set status = 'Received', received_at = now(), actual_days = lead_days where id = current_setting('t.po');
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ declare a record; begin
  select * into a from vendor_scorecard() where vendor_id = 'VND-0002';
  assert a.received >= 1 and a.on_time_pct = 100 and a.response_pct = 100, 'on-time delivery and quote response are measured';
  assert a.score is not null and a.score between 0 and 100, 'the score is a 0-100 number';
  assert (select count(*) from vendor_scorecard()) >= 2, 'staff see every vendor';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); set role authenticated;
do $$ declare a record; begin
  select * into a from vendor_scorecard() limit 1;
  assert (select count(*) from vendor_scorecard()) = 1, 'a vendor sees only its own scorecard';
  assert a.score is null and a.on_time_pct is null, 'a vendor with no data has no score, not zero';
end $$;
do $$ begin assert (select count(*) from vendor_scorecard('VND-0001')) = 1 and (select vendor_id from vendor_scorecard('VND-0001')) <> 'VND-0001', 'a vendor cannot ask for another vendor''s scorecard'; end $$;
reset role;

-- ===================== E. BOM AND MATERIAL PLANNING =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select set_bom('S1','RM-T1',0.5)$q$, 'Only Warehouse');
select pg_temp.fails($q$select 1 from plan_materials('[{"sku":"S1","units":10}]')$q$, 'Not allowed');
do $$ begin assert (select count(*) from bom) = 0, 'partners cannot read the bill of materials'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select set_bom('NOPE','RM-T1',1)$q$, 'foreign key|violates');
select set_bom('S1','RM-T1',0.5);
select set_bom('S1','RM-T2',2);
select set_bom('L5','RM-T1',3);
select set_bom('L5','RM-T2',0);                                                                                                   -- zero removes
do $$ begin assert (select count(*) from bom) = 3 and not exists (select 1 from bom where sku='L5' and rm_id='RM-T2'), 'zero quantity removes a line'; end $$;
select pg_temp.fails($q$select 1 from plan_materials('"x"')$q$, 'list');
do $$ declare t record; u record; oh numeric; begin
  select on_hand into oh from raw_materials where id = 'RM-T1';
  select * into t from plan_materials('[{"sku":"S1","units":1000},{"sku":"L5","units":100}]', current_date + 30) where rm_id = 'RM-T1';
  assert t.needed = 800, 'needed = 1000 x 0.5 + 100 x 3 = 800, got ' || t.needed;
  assert t.shortfall = greatest(800 - oh, 0), 'shortfall = needed minus on hand';
  assert t.order_by = current_date + 30 - t.lead_days, 'order-by date = need date minus lead time';
  select * into u from plan_materials('[{"sku":"S1","units":10}]') where rm_id = 'RM-T2';
  assert u.needed = 20 and u.order_by is null, 'no need-by date gives no order-by date';
  assert (select count(*) from plan_materials('[{"sku":"UNKNOWN","units":5}]')) = 0, 'a SKU without a BOM needs nothing';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select set_module('bom', false);
select pg_temp.fails($q$select 1 from plan_materials('[]')$q$, 'switched off');
select set_module('bom', true);
reset role;

-- ===================== F. COMPUTED SCORING INPUTS =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select suggest_score_inputs('ELP-DLR-0001')$q$, 'Not allowed');                                         -- partners cannot compute scores
reset role;
-- a distributor with one linked dealer that ordered this month, ledger with 1000 billed and 600 paid
reset role;
insert into ledger_entries(partner_id, kind, ref, debit, narration) values ('ELP-DLR-0001','invoice','B9-INV-1',1000,'build 9 fixture');
insert into ledger_entries(partner_id, kind, ref, utr, credit, narration) values ('ELP-DLR-0001','payment','B9-PAY-1','B9UTR0001',600,'build 9 fixture');
select set_config('t.pd', (select round(least(coalesce(sum(credit) filter (where kind = 'payment'),0) / nullif(sum(debit),0), 1), 3) from ledger_entries where partner_id = 'ELP-DLR-0001')::text, false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ declare a jsonb; begin
  a := suggest_score_inputs('ELP-DLR-0001');
  assert jsonb_array_length(a) = 8, 'eight values';
  assert (a ->> 2)::numeric = current_setting('t.pd')::numeric, 'payment discipline = payments over billing, capped at 1, got ' || (a ->> 2);
  assert (a ->> 2)::numeric between 0 and 1, 'between 0 and 1';
  assert jsonb_typeof(a -> 0) = 'null' and jsonb_typeof(a -> 3) = 'null' and jsonb_typeof(a -> 4) = 'null', 'targets, secondary sales and new customers are left unverified (no data source)';
  assert jsonb_typeof(a -> 1) in ('null','number'), 'network development is computed only for linked partners';
  a := suggest_score_inputs('ELP-DLR-0003');
  assert jsonb_typeof(a -> 2) = 'null', 'a partner with no billing has no payment-discipline value, not zero';
end $$;
select pg_temp.fails($q$select suggest_score_inputs('ELP-NOPE-0001')$q$, 'not found');
reset role;

-- ===================== G. WHATSAPP OUTBOX =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select pg_temp.fails($q$select * from whatsapp_outbox$q$, 'permission denied');
select pg_temp.fails($q$select notify_partner('ELP-DLR-0002','t','m',null)$q$, 'permission denied');
reset role;
update partners set phone = '98765 43210' where id = 'ELP-DLR-0002';
select notify_partner('ELP-DLR-0002','Switched off','nothing queued',null);
do $$ begin assert (select count(*) from whatsapp_outbox) = 0, 'nothing is queued while WhatsApp is switched off'; end $$;
update settings set value = '{"enabled":true}' where key = 'whatsapp';
select notify_partner('ELP-DLR-0002','Order update','Your order moved on',null);
do $$ begin
  assert (select count(*) from whatsapp_outbox where to_phone = '919876543210' and status = 'queued') = 1, 'a 10-digit number gets the 91 prefix and the message is queued';
end $$;
update partners set phone = 'call me' where id = 'ELP-DLR-0002';
select notify_partner('ELP-DLR-0002','Bad phone','skipped',null);
do $$ begin assert (select count(*) from whatsapp_outbox) = 1, 'an invalid number queues nothing and never blocks the notification'; end $$;
update settings set value = '{"enabled":false}' where key = 'whatsapp';

-- ===================== H. GRANTS =====================
do $$ declare f text; begin
  foreach f in array array['set_module(text,boolean)','set_partner_parent(text,text)','my_network()','create_rfq(text,numeric,date,text[],text)','close_rfq(text)','submit_quote(text,numeric,int,date)','award_quote(bigint)','vendor_scorecard(text)','set_bom(text,text,numeric)','plan_materials(jsonb,date)','suggest_score_inputs(text,date)','module_enabled(text)','my_modules()'] loop
    assert not has_function_privilege('anon', 'public.' || f, 'execute'), 'the logged-out role must not run ' || f;
    assert has_function_privilege('authenticated', 'public.' || f, 'execute'), 'signed-in users may call ' || f;
  end loop;
  assert not has_function_privilege('authenticated', 'public.module_guard(text)', 'execute'), 'module_guard is internal';
  assert not has_table_privilege('anon', 'public.rfqs', 'select') and not has_table_privilege('anon', 'public.quotes', 'select') and not has_table_privilege('anon', 'public.bom', 'select'), 'the logged-out role has no table access';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0, 'every table has row-level security';
end $$;
select 'BUILD 9 TESTS PASSED' as result;
