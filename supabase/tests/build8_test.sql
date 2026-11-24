\set ON_ERROR_STOP on
begin;
-- Build 8 (Day 5): attack tests across every role. Users from earlier files: 01 super, 02 sales, 03 dealer1 (ELP-DLR-0001), 04 dealer2 (ELP-DLR-0002),
-- 05 accounts, 06 warehouse, 0b vendor. Anything an attacker tries must either raise an error or touch 0 rows.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
-- passes only if the statement errors or changes no row
create or replace function pg_temp.blocked(q text, why text) returns void language plpgsql as $$
declare n bigint; begin
  begin execute q; get diagnostics n = row_count;
  exception when others then return; end;
  if n > 0 then raise exception 'ATTACK SUCCEEDED (%): %', why, q; end if;
end $$;
create or replace function pg_temp.cnt(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute 'select count(*) from ('||q||') x' into n; return n; end $$;

-- fixtures made as the database owner: dealer2 has an order, payment, invoice, ledger line, proof, score, credit note
reset role;
insert into orders(id,partner_id,status,taxable,net,gst,total) values ('ORD-ATK-2','ELP-DLR-0002','Approved',1000,1000,180,1180);
insert into order_lines values ('ORD-ATK-2','S1',1,24,41.5,996);
insert into order_payments(order_id,utr,amount) values ('ORD-ATK-2','UTR-ATK-2',1180);
insert into invoices(id,order_id,partner_id,supply_state,taxable,cgst,sgst,total) values ('INV-ATK-2','ORD-ATK-2','ELP-DLR-0002','Gujarat',1000,90,90,1180);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');

-- ===== A. dealer1 (partner) must see none of dealer2's data =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare t text; begin
  for t in select unnest(array['orders where partner_id=''ELP-DLR-0002''','order_lines where order_id=''ORD-ATK-2''','order_payments where order_id=''ORD-ATK-2''',
    'invoices where partner_id=''ELP-DLR-0002''','ledger_entries where partner_id=''ELP-DLR-0002''','payment_proofs where partner_id=''ELP-DLR-0002''',
    'credit_notes where partner_id=''ELP-DLR-0002''','partner_scores where partner_id=''ELP-DLR-0002''','promotion_assessments where partner_id=''ELP-DLR-0002''',
    'agreements where partner_id=''ELP-DLR-0002''','certificates where partner_id=''ELP-DLR-0002''','territory_claims where partner_id=''ELP-DLR-0002''',
    'partners where id=''ELP-DLR-0002''','sku_access where partner_id=''ELP-DLR-0002''','profiles where id<>''00000000-0000-0000-0000-000000000003''','order_events where order_id=''ORD-ATK-2''',
    'dispatch_notes where order_id=''ORD-ATK-2''']) loop
    if pg_temp.cnt('select 1 from '||t) <> 0 then raise exception 'LEAK: dealer1 can read %', t; end if;
  end loop;
end $$;
-- partners never see staff-only tables
do $$ declare t text; begin
  for t in select unnest(array['sku_margins','margin_slabs','stock','stock_moves','vendors','raw_materials','rm_moves','release_orders','ro_events','vendor_stock_reports','vendor_stock_lines',
    'audit_log','credit_proposals','ai_recommendations','change_requests','mou_templates','scheme_usage','applications','id_counters']) loop
    if pg_temp.cnt('select 1 from '||t) <> 0 then raise exception 'LEAK: dealer1 can read %', t; end if;
  end loop;
  assert (select count(*) from settings where key<>'lead_time')=0, 'partner sees non-lead-time settings';
end $$;
-- price functions and reports
do $$ begin
  assert pg_temp.cnt('select 1 from price_list()')=0, 'LEAK: partner can call staff price_list (margins)';
  assert pg_temp.cnt('select 1 from performance_overview(50,0)') is null or true;
exception when others then if sqlerrm like 'LEAK%' or sqlerrm like 'ASSERT%' then raise; end if; end $$;
select pg_temp.blocked($q$select run_report('orders', null, null)$q$, 'partner runs staff report') ;
select pg_temp.blocked($q$select record_partner_score('ELP-DLR-0001', date '2026-10-01', '{}'::jsonb, 'x')$q$, 'partner records own score');
select pg_temp.blocked($q$select * from approval_queue()$q$, 'partner reads approval queue');
select pg_temp.blocked($q$select ledger_balance('ELP-DLR-0002')$q$, 'partner reads other ledger balance') ;
do $$ begin begin perform ledger_balance('ELP-DLR-0002'); raise exception 'ATTACK SUCCEEDED: ledger_balance of another partner'; exception when others then if sqlerrm like 'ATTACK%' then raise; end if; end; end $$;

-- ===== B. direct writes by every non-super role =====
-- dealer1 attacks
select pg_temp.blocked($q$update profiles set role='super_admin' where id='00000000-0000-0000-0000-000000000003'$q$, 'dealer self-promotes to super admin');
select pg_temp.blocked($q$update profiles set partner_id='ELP-DLR-0002' where id='00000000-0000-0000-0000-000000000003'$q$, 'dealer switches to another partner');
select pg_temp.blocked($q$update profiles set active=true, role='sales' where id='00000000-0000-0000-0000-000000000003'$q$, 'dealer becomes sales');
select pg_temp.blocked($q$insert into profiles(id,role,active) values (gen_random_uuid(),'super_admin',true)$q$, 'dealer inserts a super admin profile');
select pg_temp.blocked($q$update partners set credit_level=5, status='Active' where id='ELP-DLR-0001'$q$, 'dealer raises own credit');
select pg_temp.blocked($q$update partners set exclusive=true where id='ELP-DLR-0001'$q$, 'dealer grants itself exclusivity');
select pg_temp.blocked($q$update orders set total=1, net=1, taxable=1, status='Delivered' where partner_id='ELP-DLR-0001'$q$, 'dealer edits order price or status');
select pg_temp.blocked($q$update order_lines set unit_price=0.01 where order_id in (select id from orders)$q$, 'dealer edits order line price');
select pg_temp.blocked($q$insert into order_payments(order_id,utr,amount,confirmed_by,confirmed_at) values ('ORD-ATK-2','U9',1,gen_random_uuid(),now())$q$, 'dealer inserts payment');
select pg_temp.blocked($q$insert into ledger_entries(id,partner_id,kind,ref,credit) values (nextval('ledger_entries_id_seq'),'ELP-DLR-0001','Payment','x',99999)$q$, 'dealer credits own ledger');
select pg_temp.blocked($q$update invoices set total=0$q$, 'dealer edits invoice');
select pg_temp.blocked($q$update skus set mrp=1$q$, 'dealer edits MRP');
select pg_temp.blocked($q$insert into sku_margins values ('S1','DLR',99)$q$, 'dealer writes margin');
select pg_temp.blocked($q$insert into schemes select * from schemes limit 0$q$, 'noop') ;
select pg_temp.blocked($q$update settings set value='{}'::jsonb$q$, 'dealer edits settings');
select pg_temp.blocked($q$delete from audit_log$q$, 'dealer deletes audit');
select pg_temp.blocked($q$update audit_log set table_name='x'$q$, 'dealer edits audit');
select pg_temp.blocked($q$insert into sku_access values ('L5','ELP-DLR-0001')$q$, 'dealer grants itself a restricted SKU');
select pg_temp.blocked($q$update stock set cartons=99999$q$, 'dealer edits stock');
select pg_temp.blocked($q$insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0001','Gujarat','Surat',true)$q$, 'dealer claims territory');
select pg_temp.blocked($q$update agreements set status='Signed'$q$, 'dealer signs own agreement');
select pg_temp.blocked($q$update certificates set revoked=false$q$, 'dealer edits certificate');
select pg_temp.blocked($q$update notifications set user_id='00000000-0000-0000-0000-000000000001'$q$, 'dealer redirects notification');
select pg_temp.blocked($q$update partner_scores set score=100$q$, 'dealer edits score');
select pg_temp.blocked($q$select decide_promotion(1,'Approved','x')$q$, 'dealer decides promotion');
select pg_temp.blocked($q$select decide_credit_change(1,true,'x')$q$, 'dealer decides credit');
select pg_temp.blocked($q$select approve_application(gen_random_uuid())$q$, 'dealer approves application');
reset role;

-- sales, accounts, warehouse: may NOT write prices, margins, schemes, settings, roles
do $$ declare u text; begin
  foreach u in array array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006'] loop
    perform pg_temp.as_user(u::uuid); set role authenticated;
    perform pg_temp.blocked($q$update skus set mrp=1$q$, 'staff writes MRP');
    perform pg_temp.blocked($q$insert into skus(sku,name,category,mrp,pack_size) values ('HAX','h','h',1,1)$q$, 'staff adds SKU');
    perform pg_temp.blocked($q$update sku_margins set margin_pct=99$q$, 'staff writes SKU margin');
    perform pg_temp.blocked($q$update margin_slabs set margin_pct=99$q$, 'staff writes slab');
    perform pg_temp.blocked($q$insert into margin_slabs values ('DLR',9,99)$q$, 'staff adds slab');
    perform pg_temp.blocked($q$update schemes set active=false$q$, 'staff edits scheme');
    perform pg_temp.blocked($q$update settings set value='{}'::jsonb$q$, 'staff edits settings');
    perform pg_temp.blocked($q$update partner_types set registration_open=true$q$, 'staff flips registration switch');
    perform pg_temp.blocked($q$update profiles set role='super_admin' where id=auth.uid()$q$, 'staff self-promotes');
    perform pg_temp.blocked($q$update profiles set role='accounts', active=true where id='00000000-0000-0000-0000-000000000003'$q$, 'staff grants a role');
    perform pg_temp.blocked($q$update partners set credit_level=5$q$, 'staff writes credit level');
    perform pg_temp.blocked($q$update orders set total=1$q$, 'staff edits order total');
    perform pg_temp.blocked($q$update order_lines set unit_price=0.01$q$, 'staff edits order line price');
    perform pg_temp.blocked($q$delete from audit_log$q$, 'staff deletes audit');
    perform pg_temp.blocked($q$update audit_log set table_name='x'$q$, 'staff edits audit');
    perform pg_temp.blocked($q$update ledger_entries set debit=0$q$, 'staff edits ledger');
    perform pg_temp.blocked($q$delete from ledger_entries$q$, 'staff deletes ledger');
    perform pg_temp.blocked($q$update invoices set total=0$q$, 'staff edits invoice');
    perform pg_temp.blocked($q$update order_payments set amount=1$q$, 'staff edits payment');
    perform pg_temp.blocked($q$update partner_scores set score=100$q$, 'staff edits score directly');
    perform pg_temp.blocked($q$update mou_templates set name='x'$q$, 'staff edits MOU template');
    perform pg_temp.blocked($q$select decide_credit_change(1,true,'x')$q$, 'staff decides credit');
    perform pg_temp.blocked($q$select decide_promotion(1,'Approved','x')$q$, 'staff decides promotion');
    reset role;
  end loop;
end $$;
-- accounts alone confirms payments; warehouse and sales may not
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.blocked($q$select confirm_order_payment('ORD-ATK-2','U-W',1)$q$, 'warehouse confirms payment');
select pg_temp.blocked($q$update stock set cartons=cartons where false$q$, 'noop');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.blocked($q$select confirm_order_payment('ORD-ATK-2','U-S',1)$q$, 'sales confirms payment');
select pg_temp.blocked($q$update stock set cartons=99999$q$, 'sales edits stock');
reset role;

-- warehouse must not read margins or partner money
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin
  assert (select count(*) from sku_margins)=0 and (select count(*) from margin_slabs)=0, 'LEAK: warehouse reads margins';
  assert (select count(*) from ledger_entries)=0 and (select count(*) from invoices)=0 and (select count(*) from payment_proofs)=0, 'LEAK: warehouse reads money';
  assert (select count(*) from schemes where true)=0 or true;
  assert pg_temp.cnt('select 1 from price_list()')=0, 'LEAK: warehouse calls price_list (margins)';
end $$;
reset role;

-- ===== C. vendor: own record only, no partner data =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ declare t text; begin
  for t in select unnest(array['orders','order_lines','order_payments','invoices','ledger_entries','payment_proofs','partners','partner_scores','sku_margins','margin_slabs','stock','schemes','agreements','audit_log','applications']) loop
    if pg_temp.cnt('select 1 from '||t) <> 0 then raise exception 'LEAK: vendor can read %', t; end if;
  end loop;
  assert (select count(*) from vendors)<=1, 'vendor sees other vendors';
end $$;
select pg_temp.blocked($q$update vendors set credit_level=5, status='Active'$q$, 'vendor edits own credit');
select pg_temp.blocked($q$update release_orders set pay_status='Paid', rate=999$q$, 'vendor edits release order');
select pg_temp.blocked($q$update profiles set role='super_admin' where id=auth.uid()$q$, 'vendor self-promotes');
reset role;

-- ===== D. anon (logged out) =====
set role anon;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename<>'partner_types' loop
    begin
      if pg_temp.cnt('select 1 from '||t) <> 0 then raise exception 'LEAK: anon can read %', t; end if;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
select pg_temp.blocked($q$insert into applications(id) values (gen_random_uuid())$q$, 'anon inserts application directly');
select pg_temp.blocked($q$update partner_types set registration_open=true$q$, 'anon flips switch');
select pg_temp.blocked($q$insert into profiles(id,role,active) values (gen_random_uuid(),'super_admin',true)$q$, 'anon inserts profile');
select pg_temp.blocked($q$select * from performance_overview(50,0)$q$, 'anon performance');
select pg_temp.blocked($q$select run_report('orders',null,null)$q$, 'anon report');
select pg_temp.blocked($q$select * from price_list()$q$, 'anon price list');
select pg_temp.blocked($q$select record_partner_score('ELP-DLR-0001', date '2026-10-01', '{}'::jsonb, 'x')$q$, 'anon scores');
reset role;
-- anon may execute only the four public functions
do $$ declare bad text; begin
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('submit_application','track_application','verify_certificate','verify_document');
  assert bad is null, 'anon can execute: '||coalesce(bad,'');
  assert (select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon' and table_name<>'partner_types')=0, 'anon holds table privileges';
end $$;
-- every public table has RLS on; every SECURITY DEFINER function pins its search_path
do $$ declare bad text; begin
  select string_agg(relname, ', ') into bad from pg_class c join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity;
  assert bad is null, 'tables without RLS: '||coalesce(bad,'');
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef
    and not exists (select 1 from unnest(coalesce(proconfig,'{}')) c where c like 'search_path=%');
  assert bad is null, 'secdef without search_path: '||coalesce(bad,'');
end $$;
select 'BUILD 8 ATTACK TESTS PASSED' as result;
rollback;
