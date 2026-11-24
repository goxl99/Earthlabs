\set ON_ERROR_STOP on
-- Build 9 tests: dashboard_overview (roles, money hidden from Warehouse, category filter, numbers match the tables) and dispatch issue reports.
-- Users: ...01 super, ...02 sales, ...03 dealer1, ...05 accounts, ...06 warehouse.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin execute q; raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select dashboard_overview()$q$, 'for staff');          -- a dealer cannot read it
select pg_temp.fails($q$select report_dispatch_issue('ORD-000001','damaged')$q$, 'Only Super Admin or Warehouse');
reset role;
select pg_temp.as_user(null); set role anon;
select pg_temp.fails($q$select dashboard_overview()$q$, 'permission denied');
reset role;
-- staff see money, warehouse does not
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select set_config('t.o_all', dashboard_overview()::text, false);
select set_config('t.o_dlr', dashboard_overview('DLR')::text, false);
select pg_temp.fails($q$select dashboard_overview('XYZ')$q$, 'Unknown category');
reset role;
do $$ declare a jsonb := current_setting('t.o_all')::jsonb; d jsonb := current_setting('t.o_dlr')::jsonb; n int; m numeric; begin
  assert (a->>'money')::boolean, 'super admin gets money figures';
  select count(*) into n from partners where status = 'Active' and type_code = 'DLR';
  assert (a->>'active_dlr')::int = n, 'dealer count matches the partners table';
  assert (d->>'active_dst')::int = 0, 'the DLR filter leaves out distributors';
  assert (d->>'active_dlr')::int = n, 'the DLR filter keeps dealers';
  select coalesce(sum(taxable),0) into m from invoices; assert (a->>'invoiced_total')::numeric = m, 'invoiced total matches invoices';
  assert jsonb_array_length(a->'chart_months') = 4, 'four months in the chart';
  assert jsonb_array_length(a->'chart_targets') = 4, 'four categories in the target chart';
  assert jsonb_array_length(a->'top5') <= 5 and jsonb_array_length(a->'bottom5') <= 5, 'at most five partners listed';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select set_config('t.o_wh', dashboard_overview()::text, false);
reset role;
do $$ declare w jsonb := current_setting('t.o_wh')::jsonb; begin
  assert not (w->>'money')::boolean, 'warehouse gets no money figures';
  assert not (w ? 'invoiced_total') and not (w ? 'outstanding') and not (w ? 'top5'), 'no money, scores or partner lists for warehouse';
  assert w ? 'low_stock' and w ? 'in_transit', 'warehouse still gets operational figures';
end $$;
-- dispatch issue report
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select report_dispatch_issue('ORD-NOPE','broken carton')$q$, 'No dispatch found');
select pg_temp.fails($q$select report_dispatch_issue('ORD-NOPE','x')$q$, 'Describe the issue');
select pg_temp.fails($q$update dispatch_notes set issue = 'x'$q$, 'permission denied');
reset role;
select 'BUILD 9 DASHBOARD TESTS PASSED' as result;
-- nav badge counts
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select set_config('t.nc_dealer', public.nav_counts()::text, false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select set_config('t.nc_wh', public.nav_counts()::text, false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select set_config('t.nc_su', public.nav_counts()::text, false);
reset role;
do $$ begin
  assert current_setting('t.nc_dealer')::jsonb = '{}'::jsonb, 'partners get no staff counts';
  assert not (current_setting('t.nc_wh')::jsonb ? 'apps') and not (current_setting('t.nc_wh')::jsonb ? 'fin'), 'warehouse sees no application or payment counts';
  assert (current_setting('t.nc_su')::jsonb ? 'apps') and (current_setting('t.nc_su')::jsonb ? 'appr'), 'super admin sees them all';
end $$;
select 'BUILD 9 NAV COUNT TESTS PASSED' as result;
