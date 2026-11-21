\set ON_ERROR_STOP on
-- Build 3 tests: SKU rules, price lists, scheme engine and disclosure, order workflow and payment gate, stock, dispatch.
-- Runs after rls_test.sql on the same database (uses its partners ELP-DLR-0001/0002/0004 and users ...01 boss, ...02 sales, ...03 dealer1, ...04 dealer2).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;

insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000005','accounts@x'),('00000000-0000-0000-0000-000000000006','wh@x'),('00000000-0000-0000-0000-000000000007','pending@x');
update profiles set role='accounts', active=true where id='00000000-0000-0000-0000-000000000005';
update profiles set role='warehouse', active=true where id='00000000-0000-0000-0000-000000000006';
insert into partners(id,type_code,name,district) values ('ELP-DLR-0005','DLR','Not Yet Active','Surat');
update profiles set role='dealer', active=true, partner_id='ELP-DLR-0005' where id='00000000-0000-0000-0000-000000000007';
-- clear the earlier scheme fixtures so the numbers below are exact
update schemes set active=false, disclosed=false;

-- ===== Catalogue rules =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$insert into skus(sku,name,category,mrp,pack_size,status,slab) values ('N1','New sachet','5g',10,100,'active',0)$q$, 'Set a margin for DST');
insert into margin_slabs values ('DST',0,18);
insert into skus(sku,name,category,mrp,pack_size,status,slab) values ('N1','New sachet','5g',10,100,'active',0);
do $$ begin assert (select count(*) from stock where sku='N1')=1, 'a stock row exists for every new SKU'; end $$;
select set_sku_status('N1','retired');
do $$ begin assert (select status from skus where sku='N1')='retired', 'SKU retired'; end $$;
select pg_temp.fails($q$update skus set status='draft' where sku='N1'$q$, 'cannot go back to draft');
select pg_temp.fails($q$delete from skus where sku='N1'$q$, 'Only a draft SKU can be deleted');
select set_sku_status('N1','active');
do $$ begin assert (select status from skus where sku='N1')='active', 'SKU restored'; end $$;
do $$ begin assert (select count(*) from price_list() where sku='S1')=2, 'staff price list has a row per partner type'; end $$;
do $$ begin assert (select price from price_list() where sku='S1' and type_code='DLR')=round(149/1.18*0.85,4), 'price list shows SKU-wise margin price'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select set_sku_status('S1','retired')$q$, 'Only Super Admin controls products');
do $$ begin assert (select count(*) from price_list())>0, 'sales can read the price list'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from price_list())=0, 'partners cannot read the staff price list'; end $$;
do $$ begin assert (select array_agg(sku order by sku) from my_price_list())=array['N1','S1'], 'partner price list shows only visible SKUs'; end $$;
do $$ begin assert (select price from my_price_list() where sku='S1')=round(149/1.18*0.85,4), 'partner sees own price'; end $$;
reset role;

-- ===== Stock =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select adjust_stock('S1',100,'opening stock')$q$, 'Only Warehouse');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select adjust_stock('S1',100,'')$q$, 'reason is required');
select pg_temp.fails($q$select adjust_stock('S1',-5,'stock take')$q$, 'stock_available_check|violates check|available');
select adjust_stock('S1',100,'opening stock');
select adjust_stock('N1',500,'opening stock');
do $$ begin assert (select available from stock where sku='S1')=100 and (select count(*) from stock_moves where sku='S1')=1, 'stock adjusted and logged'; end $$;
select pg_temp.fails($q$update stock set available=9999 where sku='S1'$q$, 'permission denied');
update stock set reorder_level=50 where sku='S1';
do $$ begin assert (select reorder_level from stock where sku='S1')=50, 'warehouse can set the reorder level'; end $$;
reset role;

-- ===== Scheme engine and disclosure =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$insert into schemes(id,name,kind,value,valid_from,valid_to,active) values ('X','Too big','pct',30,current_date,current_date+5,true)$q$, 'above 25');
select pg_temp.fails($q$insert into schemes(id,name,kind,valid_from,valid_to,active) values ('X','Free no fields','free',current_date,current_date+5,true)$q$, 'buy and free cartons');
select pg_temp.fails($q$insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed) values ('X','Draft disclosed','flat',5,current_date,current_date+5,false,true)$q$, 'Only an active scheme can be disclosed');
insert into schemes(id,name,kind,value,skus,min_cartons,valid_from,valid_to,active,stackable) values ('P1','Ten percent on 10 cartons','pct',10,'{S1}',10,current_date-1,current_date+30,true,true);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from schemes)=0, 'undisclosed scheme is invisible to the partner'; end $$;
do $$ begin assert (quote_order('[{"sku":"S1","cartons":10}]')->>'discount')::numeric=0, 'undisclosed scheme gives no discount'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails($q$select disclose_scheme('P1',true)$q$, 'not allowed to disclose');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select disclose_scheme('P1',true);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select (quote_order('[{"sku":"S1","cartons":10}]')) as q10 \gset
select set_config('t.q10', :'q10', false);
do $$ declare q jsonb := current_setting('t.q10')::jsonb; begin
  assert (q->>'taxable')::numeric = round(240*round(149/1.18*0.85,4),2), 'taxable uses partner price, 10 cartons of 24';
  assert (q->>'discount')::numeric = round((q->>'taxable')::numeric*0.10,2), 'ten percent scheme applied once disclosed';
  assert (q->>'total')::numeric = (q->>'net')::numeric + (q->>'gst')::numeric, 'total = net + GST';
  assert (q->>'lead_days')::int = 4, 'lead time with stock = confirm 1 + dispatch 1 + transit 2';
end $$;
do $$ begin assert (quote_order('[{"sku":"S1","cartons":5}]')->>'discount')::numeric=0, 'below minimum: no discount'; end $$;
do $$ begin assert (quote_order('[{"sku":"S1","cartons":5}]')->'hints'->>0) like 'Add 5 more carton(s) to unlock Ten percent%', 'hint tells how many cartons unlock the scheme'; end $$;
select pg_temp.fails($q$select quote_order('[{"sku":"S1","cartons":3}]')$q$, 'Minimum for');
select pg_temp.fails($q$select quote_order('[{"sku":"L5","cartons":10}]')$q$, 'not available for you');
select pg_temp.fails($q$select quote_order('[{"sku":"D1","cartons":10}]')$q$, 'not available for you');
select pg_temp.fails($q$select quote_order('[]')$q$, 'at least one product');
reset role;

-- stack rule: stackable all apply, among non-stackable only the best one; audience limits; first-order-only; budget cap
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into schemes(id,name,kind,buy,get,skus,valid_from,valid_to,active,disclosed,stackable) values ('F1','Buy 5 get 1','free',5,1,'{S1}',current_date-1,current_date+30,true,true,false);
insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed,stackable) values ('N5','Flat 500','flat',500,current_date-1,current_date+30,true,true,false);
insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed,audience_mode,audience_partners) values ('OD2','Dealer 2 only','flat',100,current_date-1,current_date+30,true,true,'partners','{ELP-DLR-0002}');
insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed,first_order_only) values ('FO','First order','flat',50,current_date-1,current_date+30,true,true,true);
insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed,budget) values ('BUD','Budget limited','flat',100,current_date-1,current_date+30,true,true,150);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare ids text[]; begin
  select array_agg(a->>'id' order by a->>'id') into ids from jsonb_array_elements(quote_order('[{"sku":"S1","cartons":10}]')->'applied') a;
  assert ids = array['BUD','F1','FO','P1'], format('best non-stackable only, others stack, audience respected: got %s', ids);
end $$;
do $$ declare q jsonb := quote_order('[{"sku":"S1","cartons":10}]'); fr numeric; begin
  fr := 2*24*round(149/1.18*0.85,4);
  assert (q->>'discount')::numeric = round((q->>'taxable')::numeric*0.10,2) + round(fr,2) + 50 + 100, 'discount = percent + free cartons + first order + budget flat';
end $$;
reset role;

-- ===== Orders =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000007'); set role authenticated;
select pg_temp.fails($q$select place_order('[{"sku":"S1","cartons":10}]')$q$, 'not active');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$select place_order('[{"sku":"S1","cartons":10}]')$q$, 'Only partners');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$insert into orders(partner_id,taxable,net,gst,total) values ('ELP-DLR-0001',1,1,0,1)$q$, 'permission denied');
select place_order('[{"sku":"S1","cartons":10}]') as o1 \gset
select set_config('t.o1', :'o1', false);
do $$ begin
  assert (select status from orders where id=current_setting('t.o1'))='Pending Approval', 'new order waits for approval';
  assert (select reserved_cartons from order_lines where order_id=current_setting('t.o1'))=10, 'stock reserved for the order';
  assert (select jsonb_array_length(applied) from orders where id=current_setting('t.o1'))=4, 'applied schemes stored on the order';
  assert (select lead_days from orders where id=current_setting('t.o1'))=4, 'lead days stored';
end $$;
-- the budget scheme (150, 100 per order) and first-order scheme no longer apply to the second order
do $$ declare ids text[]; begin
  select array_agg(a->>'id' order by a->>'id') into ids from jsonb_array_elements(quote_order('[{"sku":"S1","cartons":10}]')->'applied') a;
  assert ids = array['F1','P1'], format('budget cap and first-order rule stop those schemes: got %s', ids);
end $$;
-- stock short: 100 on hand, 10 reserved, order 100 cartons -> 90 reserved, 10 short, lead time adds make days (1+1+7+2)
select place_order('[{"sku":"S1","cartons":100}]') as o2 \gset
select set_config('t.o2', :'o2', false);
do $$ begin
  assert (select short_cartons from order_lines where order_id=current_setting('t.o2'))=10, 'short cartons recorded';
  assert (select lead_days from orders where id=current_setting('t.o2'))=11, 'lead time adds make-to-order days when short';
end $$;
reset role;
do $$ begin assert (select count(*) from scheme_usage where order_id=current_setting('t.o1'))=4, 'scheme usage recorded'; assert (select reserved from stock where sku='S1')=100, 'reserved is never more than available'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select count(*) from orders)=0 and (select count(*) from order_lines)=0, 'another partner cannot see the orders'; end $$;
reset role;

-- hold and cancel need a reason; cancel returns stock and scheme budget
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select hold_order(%L,'')$q$, current_setting('t.o2')), 'reason is required');
select hold_order(current_setting('t.o2'), 'Waiting for stock confirmation');
do $$ begin assert (select status from orders where id=current_setting('t.o2'))='On hold', 'order on hold'; end $$;
select pg_temp.fails(format($q$select approve_order(%L)$q$, current_setting('t.o2')), 'waiting for approval');
select resume_order(current_setting('t.o2'));
do $$ begin assert (select status from orders where id=current_setting('t.o2'))='Pending Approval', 'resume returns to the earlier step'; end $$;
select pg_temp.fails(format($q$select cancel_order(%L,'no')$q$, current_setting('t.o2')), 'reason is required');
select cancel_order(current_setting('t.o2'), 'Partner asked to cancel');
do $$ begin
  assert (select status from orders where id=current_setting('t.o2'))='Cancelled', 'order cancelled';
  assert (select reserved from stock where sku='S1')=10, 'reservation released on cancel';
  assert (select count(*) from scheme_usage where order_id=current_setting('t.o2'))=0, 'scheme budget returned on cancel';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails(format($q$select cancel_order(%L,'I changed my mind')$q$, current_setting('t.o1')), 'Only Super Admin or Sales');
reset role;

-- payment gate
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR1','B1')$q$, current_setting('t.o1')), 'Payment is not confirmed');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select approve_order(%L)$q$, current_setting('t.o1')), 'Only Super Admin or Sales');
select pg_temp.fails(format($q$select confirm_order_payment(%L,'UTR000111',100)$q$, current_setting('t.o1')), 'approved order');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select approve_order(current_setting('t.o1'));
select pg_temp.fails(format($q$select confirm_order_payment(%L,'UTR000111',100)$q$, current_setting('t.o1')), 'Only Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails(format($q$select confirm_order_payment(%L,'123',100)$q$, current_setting('t.o1')), 'violates check|order_payments');
select (select total from orders where id=current_setting('t.o1')) as tot \gset
select confirm_order_payment(current_setting('t.o1'), 'UTR000111', round(:tot/2,2)) as s1 \gset
do $$ begin assert (select status from orders where id=current_setting('t.o1'))='Approved', 'part payment does not release the order'; end $$;
select pg_temp.fails(format($q$select confirm_order_payment(%L,' utr000111 ',10)$q$, current_setting('t.o1')), 'already recorded');
select confirm_order_payment(current_setting('t.o1'), 'UTR000222', :tot - round(:tot/2,2)) as s2 \gset
do $$ begin
  assert (select status from orders where id=current_setting('t.o1'))='Payment Confirmed', 'full payment confirmed by Accounts releases the order';
  assert (select eta_from from orders where id=current_setting('t.o1')) = current_date + 4, 'delivery estimate counted from payment confirmation';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR1','B1')$q$, current_setting('t.o1')), 'Only Warehouse');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select dispatch_order(current_setting('t.o1'), 'GJ01 AB 1234', 'LR-77', 'BATCH-TEST-1');
do $$ begin
  assert (select status from orders where id=current_setting('t.o1'))='Dispatched', 'dispatched';
  assert (select available from stock where sku='S1')=90 and (select reserved from stock where sku='S1')=0, 'stock deducted and reservation cleared at dispatch';
  assert (select count(*) from dispatch_notes where order_id=current_setting('t.o1'))=1, 'dispatch note stored';
  assert (select count(*) from stock_moves where order_id=current_setting('t.o1'))=1, 'dispatch stock move logged';
end $$;
select pg_temp.fails(format($q$select dispatch_order(%L,'x','x','x')$q$, current_setting('t.o1')), 'Payment is not confirmed');
select deliver_order(current_setting('t.o1'));
do $$ begin assert (select status from orders where id=current_setting('t.o1'))='Delivered', 'delivered'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select cancel_order(%L,'too late to cancel')$q$, current_setting('t.o1')), 'cannot be cancelled');
reset role;

-- a UTR can pay only one order
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"S1","cartons":5}]') as o3 \gset
select set_config('t.o3', :'o3', false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_order(current_setting('t.o3'));
select pg_temp.fails(format($q$select confirm_order_payment(%L,'UTR000111',1000)$q$, current_setting('t.o3')), 'already recorded');
reset role;

-- the database itself refuses a status jump and a direct dispatch, even for the owner role
select pg_temp.fails(format($q$update orders set status='Delivered' where id=%L$q$, current_setting('t.o3')), 'cannot move');
select pg_temp.fails(format($q$update orders set status='Payment Confirmed' where id=%L$q$, current_setting('t.o1')), 'cannot move');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$update orders set status='Dispatched' where id=%L$q$, current_setting('t.o3')), 'permission denied');
reset role;

-- credit exception only when pay-and-carry is switched off AND the partner has a credit level
select set_config('epdms.credit_apply','on',false); update partners set credit_level=1 where id='ELP-DLR-0001'; select set_config('epdms.credit_apply','off',false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'v','l','b')$q$, current_setting('t.o3')), 'Payment is not confirmed');
reset role;
update settings set value='{"enabled":false,"advance_pct":0}' where key='pay_and_carry';
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select dispatch_order(current_setting('t.o3'), 'GJ01', 'LR-78', 'B2');
do $$ begin assert (select status from orders where id=current_setting('t.o3'))='Dispatched', 'credit partner ships when pay-and-carry is off'; end $$;
reset role;
update settings set value='{"enabled":true,"advance_pct":100}' where key='pay_and_carry';
select set_config('epdms.credit_apply','on',false); update partners set credit_level=0 where id='ELP-DLR-0001'; select set_config('epdms.credit_apply','off',false);

-- batch reference can be made mandatory (link to the batch system)
update settings set value='true' where key='batch_ref_required';
insert into settings(key,value) values ('batch_ref_required','true') on conflict (key) do update set value='true';
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":5}]') as o4 \gset
select set_config('t.o4', :'o4', false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_order(current_setting('t.o4'));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select confirm_order_payment(current_setting('t.o4'), 'UTR000333', (select total from orders where id=current_setting('t.o4')));
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR','')$q$, current_setting('t.o4')), 'batch reference');
select dispatch_order(current_setting('t.o4'), 'GJ01', 'LR-79', 'BATCH-OK');
reset role;
update settings set value='false' where key='batch_ref_required';

-- audit, notifications, dashboard
do $$ begin assert (select count(*) from audit_log where table_name='orders')>=8, 'every order change is in the audit trail'; end $$;
do $$ begin assert (select count(*) from audit_log where table_name='order_payments')=3, 'payments audited'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from notifications where title like 'Order%approved')>=1, 'partner told when the order is approved'; end $$;
do $$ begin assert (dashboard_stats()->>'orders_total')::int >= 3 and not (dashboard_stats() ? 'applications_open'), 'partner dashboard shows only own numbers'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin assert (dashboard_stats() ? 'applications_open') and (dashboard_stats() ? 'orders_to_dispatch'), 'staff dashboard has the queue numbers'; end $$;
reset role;
\echo BUILD 3 TESTS PASSED
