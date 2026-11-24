\set ON_ERROR_STOP on
-- Build 14 tests: payment details (how paid, bank, date) stored with the proof; wrong values refused. Users as in build6 (...01 super, ...02 sales, ...03 dealer1, ...06 warehouse).
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin execute q; raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated; select adjust_stock('N1', 50, 'build14 stock'); reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":5}]') as o14 \gset
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated; select approve_order(:'o14'); reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails(format($q$select submit_payment_proof(%L,'B14UTR001',100,null,null,'Cash',null,null)$q$, :'o14'), 'Choose how you paid');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'B14UTR001',100,null,null,'UPI',current_date+3,null)$q$, :'o14'), 'not in the future');
select pg_temp.fails(format($q$select submit_payment_proof(%L,'B14UTR001',100,null,null,'UPI',current_date-400,null)$q$, :'o14'), 'last 180 days');
select submit_payment_proof(:'o14','B14UTR001',(select total from orders where id=:'o14'),null,'ok','UPI',current_date,'HDFC Bank') as pf14 \gset
reset role;
do $$ declare r public.payment_proofs; begin
  select * into r from public.payment_proofs where utr='B14UTR001';
  assert r.mode='UPI' and r.bank='HDFC Bank' and r.paid_on=current_date and r.status='Submitted', 'payment details stored with the proof';
  assert (select status from orders where id=(select order_id from payment_proofs where utr='B14UTR001')) is not distinct from (select status from orders where id=r.order_id), 'order not moved';
end $$;
select 'build14 OK' as result;
