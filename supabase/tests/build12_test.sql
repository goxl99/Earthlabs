\set ON_ERROR_STOP on
-- Build 12 tests: ai_insights() and ai_assist(). Users: ...01 super, ...03 partner, ...0b vendor.
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

-- fixture as owner: one raw material that is short, one vendor with a late open order
insert into raw_materials(id,name,unit,vendor_id,on_hand,reorder_level,per_day,lead_days,rate,active) values ('RM-AI1','AI test base','kg','VND-0001',10,50,5,4,20,true) on conflict (id) do nothing;
insert into release_orders(id,vendor_id,rm_id,qty,rate,lead_days,eta,status) values ('RO-AI-LATE','VND-0001','RM-AI1',5,20,4,current_date-3,'Approved') on conflict (id) do nothing;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare a jsonb; i jsonb; begin
  a := ai_assist('reorder');
  assert a ->> 'title' = 'What should we reorder this week?', 'title';
  assert exists (select 1 from jsonb_array_elements(a -> 'rows') e where e ->> 'item' = 'RM-AI1'), 'the short material is listed';
  assert (select (e ->> 'suggest_qty')::numeric from jsonb_array_elements(a -> 'rows') e where e ->> 'item' = 'RM-AI1') > 0, 'a positive quantity is suggested';
  a := ai_assist('delay');
  assert exists (select 1 from jsonb_array_elements(a -> 'rows') e where e ->> 'vendor' = 'VND-0001' and (e ->> 'late_orders')::int >= 1), 'the vendor with a late order is flagged';
  a := ai_assist('credit'); assert jsonb_typeof(a -> 'rows') = 'array', 'credit answer has rows';
  a := ai_assist('scheme'); assert jsonb_typeof(a -> 'rows') = 'array', 'scheme answer has rows';
  a := ai_assist('paycarry'); assert jsonb_array_length(a -> 'rows') >= 2 and a ->> 'summary' like '%one step at a time%', 'pay and carry explains the ladder';
  i := ai_insights();
  assert i ? 'top' and i ? 'at_risk' and i ? 'inactive' and i ? 'forecast', 'all four cards are returned';
  assert (i -> 'forecast' ->> 'outstanding')::numeric >= 0, 'forecast is a number';
  assert jsonb_typeof(i -> 'inactive') = 'array', 'inactive is a list';
end $$;
select pg_temp.fails($q$select ai_assist('nonsense')$q$, 'unknown question');
reset role;

-- not for partners, vendors or signed-out callers
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select ai_assist('reorder')$q$, 'staff only');
select pg_temp.fails($q$select ai_insights()$q$, 'staff only');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select pg_temp.fails($q$select ai_insights()$q$, 'staff only');
reset role;
set role anon;
select pg_temp.fails($q$select ai_assist('reorder')$q$, 'permission denied');
reset role;

-- the answers change nothing
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare n1 int; n2 int; begin
  select count(*) into n1 from release_orders; perform ai_assist('reorder'); select count(*) into n2 from release_orders;
  assert n1 = n2, 'asking a question never creates a release order';
end $$;
reset role;
select 'BUILD 12 OK';

-- trade_doc: staff open any, a partner only their own, the signed-out nobody
reset role;
do $$ declare oid text; iid text; begin
  select id into oid from orders where partner_id = 'ELP-DLR-0001' and not exists (select 1 from invoices i where i.order_id = orders.id) order by created_at limit 1;
  if oid is null then
    insert into orders(id, partner_id, status, taxable, discount, net, gst, total, placed_by) values ('ORD-DOC-1', 'ELP-DLR-0001', 'Approved', 1000, 0, 1000, 180, 1180, '00000000-0000-0000-0000-000000000003') returning id into oid;
    insert into order_lines(order_id, sku, cartons, units, unit_price, amount) select 'ORD-DOC-1', sku, 1, pack_size, 10, pack_size * 10 from skus where status = 'active' limit 1;
  end if;
  perform set_config('epdms.test_order', oid, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare t jsonb; oid text := current_setting('epdms.test_order'); begin
  t := trade_doc('po', oid);
  assert t -> 'doc' ->> 'number' = oid, 'purchase order number is the order id';
  assert t -> 'partner' ->> 'id' = 'ELP-DLR-0001', 'partner block is the order owner';
  assert jsonb_typeof(t -> 'lines') = 'array' and jsonb_array_length(t -> 'lines') >= 1, 'lines are returned';
  assert t -> 'company' ? 'legal_name', 'company block is returned to the partner through the function';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin perform pg_temp.fails(format('select trade_doc(%L, %L)', 'po', current_setting('epdms.test_order')), 'document not found'); end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
do $$ begin assert trade_doc('po', current_setting('epdms.test_order')) -> 'doc' ->> 'number' is not null, 'accounts (staff) can open any'; end $$;
select pg_temp.fails($q$select trade_doc('nonsense', 'x')$q$, 'unknown document|not found');
reset role;
set role anon;
select pg_temp.fails($q$select trade_doc('po', 'x')$q$, 'permission denied');
reset role;
reset role;
insert into invoices(id, order_id, partner_id, supply_state, taxable, cgst, sgst, igst, total) values ('INV-DOC-1', current_setting('epdms.test_order'), 'ELP-DLR-0001', 'Gujarat', 1000, 90, 90, 0, 1180) on conflict (id) do nothing;
insert into invoice_lines(invoice_id, sku, name, units, unit_price, amount) select 'INV-DOC-1', sku, name, 10, 100, 1000 from skus where status = 'active' limit 1 on conflict do nothing;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ declare t jsonb; begin t := trade_doc('invoice', 'INV-DOC-1');
  assert (t -> 'doc' ->> 'total')::numeric = 1180 and t -> 'doc' ->> 'supply_state' = 'Gujarat', 'invoice figures come through';
  assert jsonb_array_length(t -> 'lines') = 1, 'invoice lines come through'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
select pg_temp.fails($q$select trade_doc('invoice', 'INV-DOC-1')$q$, 'document not found');
reset role;
select 'TRADE DOC OK';
