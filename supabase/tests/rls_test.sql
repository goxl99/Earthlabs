\set ON_ERROR_STOP on
-- helper: run as a user
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','boss@x','{"full_name":"Boss"}'),
 ('00000000-0000-0000-0000-000000000002','sales@x','{}'),
 ('00000000-0000-0000-0000-000000000003','dealer@x','{}'),
 ('00000000-0000-0000-0000-000000000004','dealer2@x','{}');
-- first user is Super Admin and active; the rest are inactive until approved
do $$ begin assert (select role from profiles where id='00000000-0000-0000-0000-000000000001')='super_admin', 'first user is super admin';
 assert (select active from profiles where id='00000000-0000-0000-0000-000000000002')=false, 'later users inactive'; end $$;
update profiles set role='sales', active=true where id='00000000-0000-0000-0000-000000000002';

-- public registration: dealer open, institutional closed
set role anon;
select submit_application('DLR','Test Traders','A','9999999999','a@a.com','Gujarat','Anand',null,'{}') as appid \gset
do $$ begin begin perform submit_application('INS','Closed','A','9999999999','b@b.com','Gujarat','Anand',null,'{}'); raise exception 'INS registration should be blocked'; exception when raise_exception then if sqlerrm like '%should be blocked' then raise; end if; end; end $$;
do $$ begin begin perform submit_application('DLR','Dup','A','9999999999','a@a.com','Gujarat','Anand',null,'{}'); raise exception 'duplicate allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
select set_config('t.appid', :'appid', false);
do $$ begin assert (select count(*) from track_application(current_setting('t.appid')::uuid,'A@A.com'))=1, 'tracking works with matching e-mail'; assert (select count(*) from track_application(current_setting('t.appid')::uuid,'x@y.com'))=0, 'tracking blocked with wrong e-mail'; end $$;
do $$ begin begin assert (select count(*) from applications)=0, 'anon cannot read applications'; exception when insufficient_privilege then null; end; end $$; -- build 8: anon now has no table privilege at all (also fine)
reset role;

-- Super Admin approves: permanent ID issued
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select approve_application((select id from applications limit 1)) as pid \gset
do $$ begin assert (select count(*) from partners where id='ELP-DLR-0001')=1, 'partner id issued'; end $$;
do $$ begin begin update partners set id='X' where id='ELP-DLR-0001'; raise exception 'id change allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
reset role;
insert into partners(id,type_code,name,district,status) values ('ELP-DLR-0002','DLR','Second','Anand','Active');
update profiles set role='dealer', active=true, partner_id='ELP-DLR-0001' where id='00000000-0000-0000-0000-000000000003';
update profiles set role='dealer', active=true, partner_id='ELP-DLR-0002' where id='00000000-0000-0000-0000-000000000004';
insert into agreements(partner_id,status,signed_path,signed_at) values ('ELP-DLR-0001','Signed','ELP-DLR-0001/mou.pdf',now());
update partners set status='Active' where id='ELP-DLR-0001';

-- Catalogue: only Super Admin writes
insert into margin_slabs values ('DLR',0,12),('DLR',1,20),('DST',1,25);
insert into skus(sku,name,category,mrp,pack_size,status,slab) values ('S1','Bottle','250 ml',149,24,'active',1),('L5','Five litre','5L',899,4,'active',1),('D1','Draft','x',10,1,'draft',1);
update skus set restricted=true where sku='L5';
insert into sku_access values ('L5','ELP-DLR-0002');
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin begin insert into skus(sku,name,category,mrp,pack_size) values ('Z','z','z',1,1); raise exception 'sales wrote sku'; exception when insufficient_privilege then null; end; end $$;
reset role;
-- dealer 1 sees S1 only (L5 restricted to dealer 2, D1 draft)
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select array_agg(sku order by sku) from skus)=array['S1'], 'dealer1 sees only S1'; end $$;
do $$ begin assert (select my_unit_price('S1'))=round(149/1.18*0.8,4), 'price uses dealer margin'; end $$;
do $$ begin assert (select my_unit_price('L5')) is null, 'restricted sku has no price'; end $$;
do $$ begin assert (select count(*) from sku_margins)=0 and (select count(*) from margin_slabs)=0, 'partners cannot read margins'; end $$;
do $$ begin assert (select count(*) from partners)=1, 'dealer sees only own partner row'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ begin assert (select array_agg(sku order by sku) from skus)=array['L5','S1'], 'dealer2 sees L5 and S1'; end $$;
reset role;

-- Per-SKU margin override beats slab
insert into sku_margins values ('S1','DLR',15);
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select my_unit_price('S1'))=round(149/1.18*0.85,4), 'sku override margin'; end $$;
reset role;

-- Schemes: hidden until disclosed; audience respected
insert into schemes(id,name,kind,value,valid_from,valid_to,active,disclosed,audience_mode,audience_partners)
values ('A','Hidden','pct',3,current_date-1,current_date+30,true,false,'all','{}'),
       ('B','Only dealer 1','flat',2000,current_date-1,current_date+30,true,true,'partners','{ELP-DLR-0001}'),
       ('C','Only dealer 2','flat',500,current_date-1,current_date+30,true,true,'partners','{ELP-DLR-0002}');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select array_agg(id) from schemes)=array['B'], 'dealer1 sees only scheme B'; end $$;
do $$ begin begin update schemes set disclosed=true where id='A'; if found then raise exception 'dealer changed scheme'; end if; exception when insufficient_privilege then null; end; end $$;
reset role;

-- Territory exclusivity
insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0001','Gujarat','Anand',true);
do $$ begin begin insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0002','Gujarat','Anand',true); raise exception 'conflict not blocked'; exception when raise_exception then if sqlerrm not like '%exclusive%' then raise; end if; end; end $$;

-- Users cannot promote themselves
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
update profiles set role='super_admin' where id=auth.uid();
do $$ begin assert (select count(*) from audit_log)=0, 'partners cannot read audit'; end $$;
reset role;
do $$ begin assert (select role from profiles where id='00000000-0000-0000-0000-000000000003')='dealer', 'self promotion blocked'; end $$;
-- Audit trail captured changes
do $$ begin assert (select count(*) from audit_log where table_name='partners')>=1 and (select count(*) from audit_log where table_name='skus')>=1, 'audit rows written'; end $$;

-- Application workflow guards
select submit_application('DST','Wholesale Co','B','8888888888','w@w.com','Gujarat','Surat',null,'{}') as app2 \gset
select set_config('t.app2', :'app2', false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin begin update applications set status='Rejected' where id=current_setting('t.app2')::uuid; raise exception 'reject without reason allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
do $$ begin begin update applications set status='Approved' where id=current_setting('t.app2')::uuid; raise exception 'direct approve allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
update applications set status='Rejected', reason='Outside service area' where id=current_setting('t.app2')::uuid;
do $$ begin begin perform approve_application(current_setting('t.app2')::uuid); raise exception 'approved a rejected one allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin begin perform approve_application(current_setting('t.app2')::uuid); raise exception 'sales approved allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
reset role;

-- Hardening: bootstrap closes, audit is immutable, flood guard
do $$ begin assert (select value::text from settings where key='bootstrap_open')='false', 'bootstrap closed after first Super Admin'; end $$;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000009','late@x');
do $$ begin assert (select role||active::text from profiles where id='00000000-0000-0000-0000-000000000009')='dealerfalse', 'later sign-up is inactive'; end $$;
do $$ begin begin update audit_log set action='x'; raise exception 'audit edit allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
do $$ begin begin delete from audit_log; raise exception 'audit delete allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin begin update audit_log set action='x'; raise exception 'super edited audit'; exception when insufficient_privilege or raise_exception then if sqlerrm like '%edited audit' then raise; end if; end; end $$;
reset role;
do $$ declare i int; begin
  for i in 1..60 loop insert into applications(type_code,business_name,contact_name,phone,email,district) values ('DLR','Bulk '||i,'x','9999999999','bulk'||i||'@x.com','Anand'); end loop;
  begin perform submit_application('DLR','Flood','A','9999999999','flood@x.com','Gujarat','Anand',null,'{}'); raise exception 'flood allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end;
end $$;

-- Day 2: territory exclusivity (more rules)
insert into partners(id,type_code,name,district,status) values ('ELP-DLR-0003','DLR','Third','Surat','Active'),('ELP-DST-0001','DST','Dist One','Anand','Active');
do $$ begin begin insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0003','Gujarat','Anand',false); raise exception 'share of exclusive district allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DST-0001','Gujarat','Anand',true);  -- different type, same district is fine
insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0002','Gujarat','Surat',false);
do $$ begin begin insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0003','Gujarat','Surat',true); raise exception 'exclusive over existing partner allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin assert (select available from check_territory('Gujarat','Anand','DLR'))=false and (select exclusive_holder from check_territory('Gujarat','Anand','DLR'))='ELP-DLR-0001', 'staff exclusivity check'; end $$;
do $$ begin assert (select count(*) from territory_map() where district='Anand')=2, 'map shows both types in Anand'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from territory_map())=0 and (select count(*) from check_territory('Gujarat','Anand','DLR') where other_partners>0)=0, 'partners cannot see the map'; end $$;
reset role;

-- Day 2: MOU templates (Super Admin only, known fields only)
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin begin insert into mou_templates(name,storage_path) values ('Sales template','_templates/a.docx'); raise exception 'sales uploaded template'; exception when insufficient_privilege then null; end; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin begin insert into mou_templates(name,storage_path,field_map) values ('Bad','_templates/b.docx','{"{{X}}":"bank_password"}'); raise exception 'unknown field allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
insert into mou_templates(name,storage_path,field_map,type_code) values ('Dealer MOU v1','_templates/dealer-v1.docx','{"{{NAME}}":"partner_name","{{ID}}":"partner_id"}','DLR');
reset role;

-- Day 2: agreement flow, activation gate, certificate and public verification
insert into partners(id,type_code,name,district,email) values ('ELP-DLR-0004','DLR','Fourth Traders','Rajkot','d4@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin begin update partners set status='Active' where id='ELP-DLR-0004'; raise exception 'activation without agreement allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
select create_agreement('ELP-DLR-0004',(select id from mou_templates limit 1)) as agr \gset
select set_config('t.agr', :'agr', false);
do $$ begin begin perform create_agreement('ELP-DLR-0004',(select id from mou_templates limit 1)); raise exception 'second open agreement allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
do $$ begin begin perform record_signed_agreement(current_setting('t.agr')::uuid,'x.pdf'); raise exception 'signing an unsent agreement allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
select send_agreement(current_setting('t.agr')::uuid);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin begin perform record_signed_agreement(current_setting('t.agr')::uuid,'x.pdf'); raise exception 'sales recorded signature allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select record_signed_agreement(current_setting('t.agr')::uuid,'ELP-DLR-0004/signed.pdf') as certcode \gset
select set_config('t.cert', :'certcode', false);
do $$ begin begin update agreements set status='Sent' where id=current_setting('t.agr')::uuid; raise exception 'reopening signed allowed'; exception when raise_exception then if sqlerrm like '%allowed' then raise; end if; end; end $$;
reset role;
do $$ begin assert (select status from partners where id='ELP-DLR-0004')='Active', 'partner active after signing'; end $$;
select pg_temp.as_user(null); set role anon;
do $$ begin assert (select valid from verify_certificate(lower(current_setting('t.cert'))))=true, 'public verify works'; assert (select count(*) from verify_certificate('NOSUCHCODE'))=0, 'unknown code not valid'; begin assert (select count(*) from certificates)=0, 'anon cannot list certificates'; exception when insufficient_privilege then null; end; end $$;
reset role;
update certificates set revoked=true where code=current_setting('t.cert');
select pg_temp.as_user(null); set role anon;
do $$ begin assert (select valid from verify_certificate(current_setting('t.cert')))=false, 'revoked certificate invalid'; end $$;
reset role;

-- Day 2: notifications are private and cannot be forged
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','d4@x');
update profiles set role='dealer', active=true, partner_id='ELP-DLR-0004' where id='00000000-0000-0000-0000-00000000000a';
select notify_partner('ELP-DLR-0004','Hello','Test message','/x');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
do $$ begin assert (select count(*) from notifications)=1, 'user sees own notification'; end $$;
update notifications set read_at=now();
do $$ begin assert (select count(*) from notifications where read_at is not null)=1, 'user can mark read'; end $$;
do $$ begin begin insert into notifications(user_id,title) values (auth.uid(),'forged'); raise exception 'forged notification allowed'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform notify_partner('ELP-DLR-0004','x','y','z'); raise exception 'user called notify allowed'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform count(*) from email_outbox; raise exception 'outbox readable allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from notifications)=0, 'other users cannot read it'; end $$;
reset role;
do $$ begin assert (select count(*) from email_outbox where status='queued')>=2, 'e-mails queued for sending'; end $$;
\echo ALL RLS TESTS PASSED
