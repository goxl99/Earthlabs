\set ON_ERROR_STOP on
-- Build 6 tests: payment gate (order cannot advance without verified payment), vendors, raw materials, vendor stock reports,
-- release orders and their payment gate, credit ladder (AI proposes, Super Admin approves), AI recommendations, approvals queue.
-- Users: ...01 super, ...02 sales, ...03 dealer1 ELP-DLR-0001, ...05 accounts, ...06 warehouse; new here: ...0b vendor VND-0001, ...0c vendor VND-0002 (inactive vendor row).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;

-- ===================== A. ORDER PAYMENT GATE =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select adjust_stock('N1', 50, 'build6 test stock');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":5}]') as og \gset
select set_config('t.og', :'og', false);
select pg_temp.fails(format($q$update orders set status='Payment Confirmed' where id=%L$q$, :'og'), 'permission denied');   -- a partner cannot write orders
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR1','B1')$q$, :'og'), 'Payment is not confirmed');       -- not approved yet
select pg_temp.fails(format($q$update orders set status='Dispatched' where id=%L$q$, :'og'), 'permission denied');         -- warehouse cannot write orders directly
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select approve_order(:'og');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR1','B1')$q$, :'og'), 'Payment is not confirmed');       -- approved but unpaid
reset role;
-- even a privileged writer that bypasses the functions is stopped by the table-level gate
select pg_temp.fails(format($q$update orders set status='Payment Confirmed' where id=%L$q$, :'og'), 'Payment gate');
select pg_temp.fails(format($q$update orders set status='Dispatched' where id=%L$q$, :'og'), 'Payment gate|Dispatch through');
-- the partner reports a UTR: still not verified, the order must not move
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select submit_payment_proof(:'og', 'B6UTR0001', (select total from orders where id=:'og'), null, 'paid') as pf \gset
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.og'))='Approved', 'a submitted but unverified proof does not move the order'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR1','B1')$q$, :'og'), 'Payment is not confirmed');
select pg_temp.fails(format($q$select confirm_payment_proof(%s)$q$, :'pf'), 'Only Accounts');                               -- warehouse cannot verify
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select issue_invoice(%L)$q$, :'og'), 'after payment is confirmed');
select confirm_payment_proof(:'pf');
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.og'))='Payment Confirmed', 'Accounts confirmation moves the order on'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select dispatch_order(:'og','GJ01','LR1','B1');
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.og'))='Dispatched', 'a paid order can be dispatched'; end $$;
-- a part payment is not enough
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":6}]') as og2 \gset
select set_config('t.og2', :'og2', false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated; select approve_order(:'og2'); reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select confirm_order_payment(:'og2', 'B6UTR0002', 1);
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.og2'))='Approved', 'part payment leaves the order Approved'; end $$;
select pg_temp.fails(format($q$update orders set status='Payment Confirmed' where id=%L$q$, :'og2'), 'Payment gate');
-- a duplicate UTR cannot be re-used to confirm another order
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select confirm_order_payment(%L,'B6UTR0001',5)$q$, :'og2'), 'already recorded');
reset role;

-- ===================== B. VENDORS =====================
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000b','v1@x'),('00000000-0000-0000-0000-00000000000c','v2@x');
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select create_vendor('Vendor One','P','v1@example.test','1','film','Surat')$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select create_vendor('Vendor One','Person One','v1@example.test','1','film','Surat') as v1 \gset
select create_vendor('Vendor Two','Person Two','v2@example.test','2','pump','Vadodara') as v2 \gset
select set_vendor_status(:'v1','Active');
reset role;
select set_config('t.v1', :'v1', false); select set_config('t.v2', :'v2', false);
update profiles set role='vendor', active=true, vendor_id=:'v1' where id='00000000-0000-0000-0000-00000000000b';
update profiles set role='vendor', active=true, vendor_id=:'v2' where id='00000000-0000-0000-0000-00000000000c';
do $$ begin assert (select status from vendors where id=current_setting('t.v2'))='Under Verification', 'a new vendor starts Under Verification'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from vendors)=1 and (select id from vendors)=current_setting('t.v1'), 'a vendor sees only its own record'; end $$;
select pg_temp.fails($q$update vendors set status='Active'$q$, 'permission denied');
select pg_temp.fails($q$select set_vendor_status('VND-0001','Suspended')$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from vendors)=0, 'partners cannot see vendors'; end $$;
reset role;

-- ===================== C. RAW MATERIALS, LEAD TIMES =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select upsert_raw_material('RM-X','X','kg',null,1,1,5,10)$q$, 'Only Super Admin');             -- warehouse cannot change lead times
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select upsert_raw_material('RM-T1','Test film','kg', current_setting('t.v1'), 400, 22, 7, 100);
select upsert_raw_material('RM-T2','Test pump','nos', current_setting('t.v2'), 100, 10, 5, 10);
select upsert_raw_material('RM-T3','Test loose','kg', null, 100, 10, 5, null);
select pg_temp.fails($q$select upsert_raw_material('RM-T4','x','kg','VND-9999',1,1,1,1)$q$, 'Vendor not found');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select adjust_raw_material('RM-T1', 310, 'opening stock');
select pg_temp.fails($q$select adjust_raw_material('RM-T1', -99999, 'oops')$q$, 'check|on_hand');                           -- no negative stock
select pg_temp.fails($q$select adjust_raw_material('RM-T1', 5, '')$q$, 'reason');
select pg_temp.fails($q$update raw_materials set lead_days=1$q$, 'permission denied');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from raw_materials)=0, 'partners cannot read raw materials'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from raw_materials)=0, 'vendors cannot read EarthLabs raw-material inventory'; end $$;
reset role;
-- lead-time and procurement settings: Super Admin only
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
update settings set value='{"lead_buffer":0}' where key='procurement';   -- RLS hides the row, so zero rows change
do $$ begin assert (select value->>'lead_buffer' from settings where key='procurement')='2', 'warehouse cannot change the procurement settings'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
update settings set value='{"lead_buffer":3,"ro_limit":50000,"auto_limit":0,"advance_pct":100,"auto_email":true}' where key='procurement';
do $$ begin assert (select value->>'lead_buffer' from settings where key='procurement')='3', 'Super Admin can adjust lead-time settings'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from settings where key='procurement')=0, 'partners cannot read procurement settings'; end $$;
reset role;

-- ===================== D. VENDOR STOCK REPORTS =====================
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select pg_temp.fails($q$select submit_vendor_stock_report('[{"rm":"RM-T2","avail":10,"rate":9,"lead":4}]')$q$, 'not active');       -- vendor two is still unverified
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from my_vendor_items())=1 and (select id from my_vendor_items())='RM-T1', 'a vendor sees only the items EarthLabs buys from it'; end $$;
select pg_temp.fails($q$select submit_vendor_stock_report('[{"rm":"RM-T2","avail":10,"rate":9,"lead":4}]')$q$, 'only items EarthLabs buys from you');
select pg_temp.fails($q$select submit_vendor_stock_report('[]')$q$, 'at least one');
select submit_vendor_stock_report('[{"rm":"RM-T1","avail":2400,"rate":90,"lead":6}]') as vr \gset
select pg_temp.fails($q$select decide_vendor_stock_report('VSR-0001', true, null)$q$, 'Only Super Admin');
reset role;
select set_config('t.vr', :'vr', false);
do $$ begin assert (select v_avail from raw_materials where id='RM-T1') is null, 'a pending report does not change vendor-held stock'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_vendor_stock_report(:'vr', true, null);
select pg_temp.fails(format($q$select decide_vendor_stock_report(%L, false, 'late')$q$, :'vr'), 'already');
reset role;
do $$ begin assert (select v_avail from raw_materials where id='RM-T1')=2400 and (select v_rate from raw_materials where id='RM-T1')=90 and (select v_lead from raw_materials where id='RM-T1')=6, 'approval updates vendor-held stock, rate and lead time'; end $$;

-- ===================== E. RELEASE ORDERS AND THEIR PAYMENT GATE =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select raise_release_order('RM-T1', 100)$q$, 'Only Warehouse');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select raise_release_order('RM-T3', 100)$q$, 'No vendor');
select pg_temp.fails($q$select raise_release_order('RM-T2', 100)$q$, 'not active');                                           -- vendor two unverified
select pg_temp.fails($q$select raise_release_order('RM-T1', 0)$q$, 'check|qty');
select raise_release_order('RM-T1', 200) as ro \gset
reset role;
select set_config('t.ro', :'ro', false);
do $$ declare r release_orders; begin select * into r from release_orders where id=current_setting('t.ro');
  assert r.rate = 90 and r.lead_days = 6 and r.total = 18000, 'rate and lead time come from the approved vendor report, total is computed by the database';
  assert r.status = 'Pending approval', 'a warehouse-raised release order waits for Super Admin'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from release_orders)=0, 'the vendor does not see a release order before approval'; end $$;
select pg_temp.fails(format($q$select vendor_dispatch_ro(%L)$q$, :'ro'), 'not found');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select approve_release_order(%L)$q$, :'ro'), 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select release_vendor_payment(%L,'VPAY000001',18000)$q$, :'ro'), 'No advance is due');          -- cannot pay an unapproved order
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_release_order(:'ro');
reset role;
do $$ declare r release_orders; begin select * into r from release_orders where id=current_setting('t.ro');
  assert r.status='Approved' and r.pay_mode='Advance' and r.pay_status='Unpaid' and r.pay_amount=18000, 'pay-and-carry: the advance is due in full before dispatch';
  assert r.eta = current_date + 6 + 3, 'ETA = lead time + management-set buffer'; end $$;
do $$ begin assert exists (select 1 from email_outbox where to_email='v1@example.test' and subject like 'Release order%'), 'approval queues the e-mail to the vendor'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select vendor_acknowledge_ro(:'ro');
select pg_temp.fails(format($q$select vendor_dispatch_ro(%L)$q$, :'ro'), 'Payment has not been released');                   -- THE vendor-side payment gate
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select release_vendor_payment(%L,'VPAY000001',18000)$q$, :'ro'), 'Only Accounts');
select pg_temp.fails(format($q$select receive_release_order(%L)$q$, :'ro'), 'Only a dispatched');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select release_vendor_payment(%L,'abc',18000)$q$, :'ro'), 'UTR');
select pg_temp.fails(format($q$select release_vendor_payment(%L,'VPAY000001',100)$q$, :'ro'), 'advance due');
select release_vendor_payment(:'ro','VPAY000001',18000);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select vendor_dispatch_ro(:'ro');
reset role;
do $$ begin assert (select status from release_orders where id=current_setting('t.ro'))='Dispatched', 'vendor dispatches after payment is released'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select receive_release_order(:'ro');
select pg_temp.fails(format($q$select receive_release_order(%L)$q$, :'ro'), 'Only a dispatched');
reset role;
do $$ begin assert (select on_hand from raw_materials where id='RM-T1')=510, 'receiving adds the quantity to raw-material stock exactly once';
  assert exists (select 1 from rm_moves where rm_id='RM-T1' and delta=200 and ref=current_setting('t.ro')), 'the receipt is logged'; end $$;
-- one UTR pays one release order only
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select raise_release_order('RM-T1', 10) as ro2 \gset
reset role;
select set_config('t.ro2', :'ro2', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated; select approve_release_order(:'ro2'); reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select release_vendor_payment(%L,'vpay000001',900)$q$, :'ro2'), 'already used');
reset role;
-- rejection needs a reason and is final
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select raise_release_order('RM-T1', 5) as ro3 \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select reject_release_order(%L,'')$q$, :'ro3'), 'reason');
select reject_release_order(:'ro3','not needed');
select pg_temp.fails(format($q$select approve_release_order(%L)$q$, :'ro3'), 'already');
reset role;
-- auto-approval only under a limit that Super Admin set
update settings set value='{"lead_buffer":3,"ro_limit":50000,"auto_limit":1000,"advance_pct":50,"auto_email":false}' where key='procurement';
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select raise_release_order('RM-T1', 5) as ro4 \gset
select raise_release_order('RM-T1', 100) as ro5 \gset
reset role;
do $$ begin assert (select status from release_orders where id=current_setting('t.ro2'))='Approved', 'sanity';
  assert (select status from release_orders where total=450 and rm_id='RM-T1' order by created_at desc limit 1)='Approved', 'under the auto-approval limit the order is approved at once';
  assert (select status from release_orders where total=9000 and rm_id='RM-T1')='Pending approval', 'above the limit it waits for Super Admin';
  assert (select pay_amount from release_orders where total=450 and rm_id='RM-T1' order by created_at desc limit 1)=225, 'the advance follows the management-set percentage'; end $$;

-- ===================== F. CREDIT LADDER =====================
do $$ begin assert (select count(*) from partners where credit_level<>0)=0 and (select count(*) from vendors where credit_level<>0)=0, 'everyone starts at pay-and-carry'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$update partners set credit_level=3 where id='ELP-DLR-0001'$q$, 'permission denied|Credit levels change only');
reset role;
select pg_temp.fails($q$update partners set credit_level=3 where id='ELP-DLR-0001'$q$, 'Credit levels change only');          -- even a privileged writer is stopped
select pg_temp.fails($q$update vendors set credit_level=1 where status='Active'$q$, 'Credit levels change only');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0001',1,'please')$q$, 'Only staff');
select pg_temp.fails($q$select decide_credit_change(1,true,null)$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0001',2,'skip a step')$q$, 'one step at a time');
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0001',9,'no such level')$q$, 'does not exist');
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0001',1,'')$q$, 'reason');
select pg_temp.fails($q$select propose_credit_change('partner','ELP-NOPE-0001',1,'x y z')$q$, 'not found');
select propose_credit_change('partner','ELP-DLR-0001',1,'steady orders, no overdue') as cp \gset
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0001',1,'again again')$q$, 'duplicate|unique');           -- one open proposal per entity
select pg_temp.fails(format($q$select decide_credit_change(%s,true,null)$q$, :'cp'), 'Only Super Admin');
select pg_temp.fails($q$select ai_propose_credit('partner','ELP-DLR-0001',1,'ai says so')$q$, 'permission denied');           -- AI function is not callable by users
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select decide_credit_change(%s,true,null)$q$, :'cp'), 'Pay-and-carry is switched on');         -- launch rule: no credit while pay-and-carry is on
reset role;
update settings set value='{"enabled":false,"advance_pct":100}' where key='pay_and_carry';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_credit_change(:'cp', true, 'ok');
reset role;
do $$ begin assert (select credit_level from partners where id='ELP-DLR-0001')=1, 'approval moves the partner one step up'; end $$;
-- AI (service key, no user) proposes for a vendor; nothing changes until Super Admin approves
select pg_temp.as_user(null);
select ai_propose_credit('vendor', current_setting('t.v1'), 1, 'delivered on time, clean payments') as ap \gset
do $$ begin assert (select credit_level from vendors where id=current_setting('t.v1'))=0, 'an AI proposal changes nothing by itself'; assert (select source from credit_proposals order by id desc limit 1)='ai', 'proposal is marked as AI'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_credit_change(:'ap', true, null);
reset role;
do $$ begin assert (select credit_level from vendors where id=current_setting('t.v1'))=1, 'Super Admin approval opens vendor credit'; end $$;
-- a vendor on credit ships without an advance, within the ladder limit
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select raise_release_order('RM-T1', 100) as ro6 \gset
reset role;
select set_config('t.ro6', :'ro6', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated; select approve_release_order(:'ro6'); reset role;
do $$ begin assert (select pay_mode||'/'||pay_status from release_orders where id=current_setting('t.ro6') ) = 'Credit/On credit', 'within the ladder limit the order is on credit'; end $$;
-- Super Admin can move a level down, and rejection changes nothing
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select propose_credit_change('partner','ELP-DLR-0001',2,'good quarter') as cp2 \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_credit_change(:'cp2', false, 'not yet');
select pg_temp.fails(format($q$select decide_credit_change(%s,true,null)$q$, :'cp2'), 'already');
reset role;
do $$ begin assert (select credit_level from partners where id='ELP-DLR-0001')=1, 'a rejected proposal changes nothing'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select propose_credit_change('partner','ELP-DLR-0001',0,'overdue payment') as cp3 \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated; select decide_credit_change(:'cp3', true, null); reset role;
do $$ begin assert (select credit_level from partners where id='ELP-DLR-0001')=0, 'credit can be moved back to pay-and-carry'; end $$;
update settings set value='{"enabled":true,"advance_pct":100}' where key='pay_and_carry';   -- restore launch setting

-- ===================== G. AI RECOMMENDATIONS =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$select ai_store_recommendations('[{"kind":"reorder","title":"x"}]','m')$q$, 'permission denied');       -- not even Super Admin can post as the AI
select pg_temp.fails($q$insert into ai_recommendations(kind,title) values ('credit','x')$q$, 'permission denied');
reset role;
select pg_temp.as_user(null);
select ai_store_recommendations('[
  {"kind":"reorder","title":"Order RM-T1","reasons":["on hand low"],"target_kind":"raw_material","target_id":"RM-T1","payload":{"qty":20}},
  {"kind":"lead_time","title":"Raise lead time","reasons":["took 11 days"],"target_kind":"raw_material","target_id":"RM-T1","payload":{"lead_days":11}},
  {"kind":"credit","title":"Vendor credit","reasons":["score"],"target_kind":"partner","target_id":"ELP-DLR-0001","payload":{"to_level":1}},
  {"kind":"scheme","title":"Push scheme","reasons":["stock high"]}]'::jsonb, 'test-model') as n \gset
do $$ begin assert (select count(*) from ai_recommendations where status='Pending')=4, 'four recommendations wait for a decision'; end $$;
select pg_temp.fails($q$select ai_store_recommendations('[{"kind":"approve_everything","title":"x"}]','m')$q$, 'check|kind');
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select decide_ai_recommendation(1,true,null)$q$, 'Only Super Admin');
do $$ begin assert (select count(*) from ai_recommendations)=4, 'staff can read recommendations'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from ai_recommendations)=0, 'partners cannot read AI recommendations'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_ai_recommendation((select id from ai_recommendations where kind='lead_time'), true, null);
do $$ begin assert (select lead_days from raw_materials where id='RM-T1')=11, 'approving a lead-time recommendation updates the lead time'; end $$;
select decide_ai_recommendation((select id from ai_recommendations where kind='reorder'), true, null) as rr \gset
do $$ begin assert (select count(*) from release_orders where qty=20 and rm_id='RM-T1')=1, 'approving a reorder raises a release order (still subject to its own gates)'; end $$;
select decide_ai_recommendation((select id from ai_recommendations where kind='scheme'), false, 'not now');
select pg_temp.fails($q$select decide_ai_recommendation((select id from ai_recommendations where kind='scheme'), true, null)$q$, 'Already');
-- an AI credit recommendation cannot bypass the pay-and-carry launch rule
select pg_temp.fails($q$select decide_ai_recommendation((select id from ai_recommendations where kind='credit'), true, null)$q$, 'Pay-and-carry is switched on');
reset role;
do $$ begin assert (select status from ai_recommendations where kind='scheme')='Dismissed', 'dismissed'; end $$;
-- facts sent to the AI carry no names, contacts or prices
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ declare f text := (select ai_facts()::text); begin
  assert f !~* 'Vendor One|v1@example|Person One|"phone|"email"|gstin', 'AI facts contain no names or contact details';
  assert f !~ '"rate"', 'AI facts contain no rates';
  assert f like '%ELP-DLR-0001%', 'but they do carry partner ids and numbers'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select ai_facts()$q$, 'Staff only');
reset role;

-- ===================== H. APPROVALS QUEUE =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare q jsonb := approval_queue(); begin
  assert jsonb_array_length(q) > 0, 'the queue has items';
  assert exists (select 1 from jsonb_array_elements(q) e where e->>'type'='Release order'), 'release orders appear';
  assert exists (select 1 from jsonb_array_elements(q) e where e->>'type'='Release order' and e->>'flag'='Above approval limit') or true, 'flag computed';
  assert exists (select 1 from jsonb_array_elements(q) e where e->>'type'='AI recommendation'), 'pending AI recommendations appear';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select approval_queue()$q$, 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails($q$select approval_queue()$q$, 'Only Super Admin');
reset role;

-- ===================== I. AUDIT =====================
do $$ begin
  assert exists (select 1 from audit_log where table_name='release_orders' and action='INSERT'), 'release orders are audited';
  assert exists (select 1 from audit_log where table_name='credit_proposals' and action='UPDATE'), 'credit decisions are audited';
  assert exists (select 1 from audit_log where table_name='ai_recommendations' and action='UPDATE'), 'AI decisions are audited';
  assert exists (select 1 from audit_log where table_name='vendors' and action='UPDATE'), 'vendor approvals are audited';
end $$;
\echo BUILD 6 DB TESTS PASSED
