\set ON_ERROR_STOP on
-- Build 10 tests: application review on the live staged flow (history trail, field-verification record) and approval with decisions.
-- Users: ...01 super, ...02 sales, ...03 dealer1.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin execute q; raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
reset role;
-- earlier fixtures created partners with fixed IDs; move the counters past them
insert into id_counters(code,last) select type_code, max(substring(id from '[0-9]+$')::int) from partners group by type_code on conflict (code) do update set last = greatest(id_counters.last, excluded.last);
insert into applications(type_code,business_name,contact_name,phone,email,district,answers) values ('DLR','Test Traders B10','Asha','+91 98000 10001','b10@example.in','Kutch','{"years":"6","address":"1 Main Road"}') returning id as a1 \gset
insert into applications(type_code,business_name,contact_name,phone,email,district,answers) values ('DST','Test Distribution B10','Meera','+91 98000 10002','b10b@example.in','Kutch','{}') returning id as a2 \gset
insert into application_documents(application_id,kind,file_name) values (:'a1','PAN card','pan.pdf');
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;   -- Sales moves it along
update applications set status='Documents submitted' where id = :'a1';
update applications set status='Field verification', reason='Visit on Friday' where id = :'a1';
update applications set status='Field verification', reg_verified=true, reputation=0.7, field_note='Two trade references checked', reason=null where id = :'a1';
select pg_temp.fails(format($q$update applications set reputation=1.5 where id = %L$q$, :'a1'), 'reputation');
select pg_temp.fails(format($q$update applications set status='Rejected' where id = %L$q$, :'a1'), 'reason is required');
select pg_temp.fails(format($q$select approve_application(%L,'DLR','Kutch',false,1,5,null)$q$, :'a1'), 'Only Super Admin');
reset role;
do $$ declare h jsonb; begin
  select history into h from applications where business_name='Test Traders B10';
  assert jsonb_array_length(h) = 2, 'history has one entry per stage change: ' || h::text;
  assert h->0->>'status' = 'Documents submitted' and h->1->>'note' = 'Visit on Friday', 'note recorded in history';
  assert (select reputation from applications where business_name='Test Traders B10') = 0.7, 'field record saved';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;   -- Super Admin
select pg_temp.fails(format($q$select approve_application(%L,'ZZZ','Kutch',false,1,5,null)$q$, :'a1'), 'Unknown partner category');
select pg_temp.fails(format($q$select approve_application(%L,'DLR','Kutch',false,9,5,null)$q$, :'a1'), '1 to 5 years');
select pg_temp.fails(format($q$select approve_application(%L,'DLR','Kutch',false,1,-1,null)$q$, :'a1'), 'negative');
select approve_application(:'a1','DLR','Kutch',true,2,7.5,null) as pid1 \gset
reset role;
select set_config('t.pid1', :'pid1', false), set_config('t.a1', :'a1', false), set_config('t.a2', :'a2', false);
do $$ declare pid text := current_setting('t.pid1'); begin
  assert (select count(*) from partners where id = pid and district='Kutch' and exclusive and monthly_target = 7.5 and type_code='DLR' and address = '1 Main Road') = 1, 'partner created with category, exclusivity, target and address';
  assert (select count(*) from territory_claims where partner_id = pid and district='Kutch' and exclusive) = 1, 'territory claim recorded';
  assert (select status from applications where id = current_setting('t.a1')::uuid) = 'Agreement pending', 'application moves to Agreement pending as in the live flow';
  assert (select partner_id from applications where id = current_setting('t.a1')::uuid) = pid, 'Partner ID linked';
  assert (select partner_id from application_documents where application_id = current_setting('t.a1')::uuid limit 1) = pid, 'uploaded documents follow the partner';
  assert (select count(*) from agreements where partner_id = pid) = 0, 'no agreement without a template';
end $$;
-- exclusive district: nobody else may take it exclusively; a finished application cannot be approved again
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select approve_application(%L,'DST','Kutch',true,1,10,null)$q$, :'a2'), 'Exclusive territory blocked');
-- already has a partner: returns the same ID
select approve_application(:'a1','DLR','Kutch',false,1,5,null) as same \gset
reset role;
select set_config('t.same', :'same', false);
do $$ begin assert current_setting('t.same') = current_setting('t.pid1'), 'approving twice returns the same Partner ID'; end $$;
-- with a template: draft agreement carries the chosen term
insert into mou_templates(name,storage_path,type_code) values ('B10 Distributor MOU','_templates/b10.pdf','DST');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_application(:'a2','DST','Kutch',false,3,10,(select id from mou_templates where name='B10 Distributor MOU')) as pid2 \gset
reset role;
select set_config('t.pid2', :'pid2', false);
do $$ declare pid text := current_setting('t.pid2'); begin
  assert (select count(*) from agreements where partner_id = pid and status='Draft' and term_years = 3) = 1, 'draft agreement with chosen term';
  assert (select count(*) from applications where id = current_setting('t.a2')::uuid and status='Agreement pending') = 1, 'second application moved on';
  assert (select jsonb_array_length(history) from applications where id = current_setting('t.a2')::uuid) = 1, 'history kept through approval';
end $$;
select pg_temp.as_user(null); set role anon;
select pg_temp.fails($q$select approve_application(gen_random_uuid(),'DLR','Kutch',false,1,5,null)$q$, 'permission denied');
reset role;
select 'BUILD 10 APPLICATION WORKFLOW TESTS PASSED' as result;
