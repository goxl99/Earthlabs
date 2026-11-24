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
