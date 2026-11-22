\set ON_ERROR_STOP on
-- Day 5 load test. Run on a throwaway database (run_load_test.sh builds one): 1,000 partners, 1,005 users, 50,000 orders with lines,
-- payments, invoices and ledger rows. Synthetic data only. Then times the screens' queries as staff and as a partner (row-level security ON).
\timing off
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid, 'u'||i||'@example.test' from generate_series(1,6) i;
update profiles set role='sales',active=true where id='00000000-0000-0000-0000-000000000002';
update profiles set role='accounts',active=true where id='00000000-0000-0000-0000-000000000005';
update profiles set role='warehouse',active=true where id='00000000-0000-0000-0000-000000000006';
insert into partner_types(code,name,level) select 'DLR','Dealer',1 where not exists (select 1 from partner_types where code='DLR');
insert into margin_slabs select code,1,20 from partner_types where code in ('DLR','DST','INS') on conflict do nothing;
insert into skus(sku,name,category,mrp,pack_size,status,slab) select 'SK'||i,'Product '||i,'cat',100+i,12,'active',1 from generate_series(1,20) i;
insert into partners(id,type_code,name,district,status) select 'ELP-DLR-'||lpad(i::text,4,'0'),'DLR','Synthetic Partner '||i,(array['Anand','Surat','Rajkot','Vadodara','Bhuj','Mehsana'])[1+i%6],'Active' from generate_series(1,1000) i;
-- 1,000 partner users
insert into auth.users(id,email) select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid, 'p'||i||'@example.test' from generate_series(1,1000) i;
update profiles p set role='dealer', active=true, partner_id='ELP-DLR-'||lpad(substr(p.id::text,25)::int::text,4,'0') where p.id::text like '10000000-%';
-- 50,000 orders spread over 18 months, 2 lines each, status mix
insert into orders(id,partner_id,status,taxable,net,gst,total,created_at)
select 'ORD-'||lpad(i::text,6,'0'), 'ELP-DLR-'||lpad((1+(i*7919+i/8)%1000)::text,4,'0'),
  (array['Delivered','Delivered','Delivered','Dispatched','Payment Confirmed','Approved','Pending Approval','Cancelled'])[1+i%8],
  1000+i%500, 1000+i%500, round((1000+i%500)*0.18,2), round((1000+i%500)*1.18,2), now() - ((i%540)||' days')::interval - ((i%86400)||' seconds')::interval
from generate_series(1,50000) i;
insert into order_lines(order_id,sku,cartons,units,unit_price,amount) select o.id,'SK'||(1+(n+substr(o.id,5)::int)%20),1,12,50,600 from orders o cross join generate_series(1,2) n;
insert into order_payments(order_id,utr,amount,confirmed_by,confirmed_at) select id,'UTR'||substr(id,5),total,'00000000-0000-0000-0000-000000000005',created_at from orders where status in ('Delivered','Dispatched','Payment Confirmed');
insert into invoices(id,order_id,partner_id,supply_state,taxable,cgst,sgst,total,issued_on) select 'INV-'||substr(id,5),id,partner_id,'Gujarat',taxable,round(gst/2,2),round(gst/2,2),total,created_at::date from orders where status in ('Delivered','Dispatched');
insert into ledger_entries(partner_id,kind,ref,debit,credit,at) select partner_id,'invoice','INV-'||substr(id,5),total,0,created_at from orders where status in ('Delivered','Dispatched');
insert into notifications(user_id,title,body) select ('10000000-0000-0000-0000-'||lpad((1+i%1000)::text,12,'0'))::uuid,'Note '||i,'x' from generate_series(1,20000) i;
analyze;
select 'orders' t, count(*) from orders union all select 'partners', count(*) from partners union all select 'order_lines', count(*) from order_lines union all select 'ledger', count(*) from ledger_entries union all select 'audit_log', count(*) from audit_log union all select 'notifications', count(*) from notifications;

create temp table timings(who text, label text, ms numeric, rows bigint);
create or replace function pg_temp.t(who text, label text, q text) returns void language plpgsql as $$
declare s timestamptz; n bigint; e timestamptz; begin
  s := clock_timestamp(); execute 'select count(*) from ('||q||') x' into n; e := clock_timestamp();
  insert into timings values (who,label, round(extract(epoch from (e-s))*1000,1), n); end $$;
grant all on timings to authenticated;
-- as Super Admin
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); set role authenticated;
select pg_temp.t('super','orders latest 50','select id,partner_id,status,total,created_at from orders order by created_at desc limit 50');
select pg_temp.t('super','orders by status page','select * from orders where status=''Pending Approval'' order by created_at desc limit 50');
select pg_temp.t('super','orders of one partner','select * from orders where partner_id=''ELP-DLR-0042'' order by created_at desc limit 50');
select pg_temp.t('super','partners page 1','select id,name,type_code,district,status from partners order by id limit 50');
select pg_temp.t('super','partners page 20 + exact count','select id,name from partners order by id offset 950 limit 50');
select pg_temp.t('super','partners search name','select id from partners where name ilike ''%Partner 77%'' limit 50');
select pg_temp.t('super','ledger latest 50 (all partners)','select * from ledger_entries order by id desc limit 50');
select pg_temp.t('super','ledger of one partner','select * from ledger_entries where partner_id=''ELP-DLR-0042'' order by id desc limit 50');
select pg_temp.t('super','ledger_balance one partner','select ledger_balance(''ELP-DLR-0042'')');
select pg_temp.t('super','invoices latest 50','select * from invoices order by issued_on desc limit 50');
select pg_temp.t('super','audit latest page','select * from audit_log order by id desc limit 51');
select pg_temp.t('super','audit by table','select * from audit_log where table_name=''orders'' order by id desc limit 50');
select pg_temp.t('super','audit by record','select * from audit_log where table_name=''partners'' and row_key=''ELP-DLR-0042'' order by id desc limit 50');
select pg_temp.t('super','dashboard_stats','select dashboard_stats()');
select pg_temp.t('super','approval_queue','select * from approval_queue()');
select pg_temp.t('super','performance_overview','select * from performance_overview(50,0)');
select pg_temp.t('super','territory_map','select * from territory_map()');
select pg_temp.t('super','report orders','select run_report(''orders'',null,null)');
select pg_temp.t('super','payment proofs queue','select * from payment_proofs where status=''Submitted'' order by submitted_at limit 50');
select pg_temp.t('super','orders ready to invoice','select id,partner_id,total from orders where status in (''Payment Confirmed'',''Dispatched'',''Delivered'') order by created_at desc limit 100');
select pg_temp.t('super','invoiced order ids (limit 500)','select order_id from invoices limit 500');
reset role;
-- as one partner
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000042',false); set role authenticated;
select pg_temp.t('partner','my orders','select * from orders order by created_at desc limit 50');
select pg_temp.t('partner','my ledger','select * from ledger_entries order by id desc limit 50');
select pg_temp.t('partner','my invoices','select * from invoices order by issued_on desc limit 50');
select pg_temp.t('partner','my price list','select * from my_price_list()');
select pg_temp.t('partner','my dashboard','select dashboard_stats()');
select pg_temp.t('partner','order lines of my orders','select l.* from order_lines l join orders o on o.id=l.order_id limit 200');
select pg_temp.t('partner','my notifications','select * from notifications order by created_at desc limit 50');
reset role;
select who, label, ms, rows from timings order by ms desc;
