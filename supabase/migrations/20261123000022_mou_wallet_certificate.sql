-- MOU authoring, countersign approval, document wallet, "not applicable" documents, certificate numbers.

-- 1. Statuses: MOU signed (both parties signed, awaiting company approval)
alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check check (status in
  ('Submitted','Documents requested','Documents submitted','More info needed','Field verification','Agreement pending','MOU signed','Approved','Rejected'));

-- 2. Document wallet: keep every version, allow "not applicable"
alter table public.application_documents drop constraint application_documents_application_id_kind_key;
alter table public.application_documents add column is_current boolean not null default true,
  add column partner_id text, add column not_applicable boolean not null default false, add column reused_from uuid;
alter table public.application_documents alter column file_path drop not null;
create unique index appdocs_one_current on public.application_documents(application_id, kind) where is_current;
create policy appdocs_partner_read on public.application_documents for select using (partner_id is not null and partner_id = (select public.my_partner()));
create policy "partner reads own application docs" on storage.objects for select using (bucket_id = 'application-docs' and exists
  (select 1 from public.application_documents d where d.file_path = name and d.partner_id = (select public.my_partner())));

create or replace function public.wallet_documents(q text default '') returns table(id uuid, application_id uuid, ref_no text, business_name text, email text, partner_id text,
  kind text, file_name text, file_path text, status text, note text, not_applicable boolean, is_current boolean, uploaded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.application_id, a.ref_no, a.business_name, a.email, coalesce(d.partner_id, a.partner_id), d.kind, d.file_name, d.file_path, d.status, d.note, d.not_applicable, d.is_current, d.uploaded_at
  from public.application_documents d join public.applications a on a.id = d.application_id
  where (public.is_staff() or coalesce(d.partner_id, a.partner_id) = public.my_partner())
    and (coalesce(q,'') = '' or a.business_name ilike '%'||q||'%' or a.email ilike '%'||q||'%' or coalesce(a.partner_id,'') ilike '%'||q||'%' or a.ref_no ilike '%'||q||'%' or d.kind ilike '%'||q||'%')
  order by d.uploaded_at desc limit 300 $$;
revoke execute on function public.wallet_documents(text) from public, anon; grant execute on function public.wallet_documents(text) to authenticated;

create or replace function public.reuse_document(doc uuid, app uuid) returns void language plpgsql security definer set search_path = public as $$
declare d public.application_documents; a public.applications; src text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can reuse documents'; end if;
  select * into d from public.application_documents where id = doc; if d.id is null then raise exception 'Document not found'; end if;
  select * into a from public.applications where id = app; if a.id is null then raise exception 'Application not found'; end if;
  if not (d.kind = any (public.required_docs(a.type_code))) then raise exception 'This application does not need a "%" document', d.kind; end if;
  select ref_no into src from public.applications where id = d.application_id;
  update public.application_documents set is_current = false where application_id = app and kind = d.kind and is_current;
  insert into public.application_documents(application_id, kind, file_path, file_name, size_bytes, status, note, not_applicable, partner_id, reused_from)
  values (app, d.kind, d.file_path, d.file_name, d.size_bytes, 'Uploaded', 'Reused from the document wallet (' || coalesce(src,'earlier application') || ')', d.not_applicable, a.partner_id, d.id);
end $$;
revoke execute on function public.reuse_document(uuid,uuid) from public, anon; grant execute on function public.reuse_document(uuid,uuid) to authenticated;

-- 3. Company profile (used on MOU, signing and certificate)
create table public.company_profile (key text primary key, value text not null default '');
alter table public.company_profile enable row level security;
create policy company_profile_staff_read on public.company_profile for select using ((select public.is_staff()));
insert into public.company_profile(key, value) values
 ('legal_name','EarthLabs Innovative Products Pvt. Ltd.'), ('cin','U20237GJ2026PTC179705'), ('gstin','24AAJCE7904M1ZB'),
 ('address','Shed No. 4, J D Patel Estate, IPCL Road, Ranoli, Vadodara - 391350, Gujarat'),
 ('signatory_name',''), ('signatory_designation','Authorised Signatory'), ('signatory_email',''), ('signatory_phone','');
create or replace function public.set_company_profile(k text, v text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only Super Admin can change company details'; end if;
  if k not in ('legal_name','cin','gstin','address','signatory_name','signatory_designation','signatory_email','signatory_phone') then raise exception 'Unknown setting'; end if;
  insert into public.company_profile(key,value) values (k, coalesce(v,'')) on conflict (key) do update set value = excluded.value;
end $$;
revoke execute on function public.set_company_profile(text,text) from public, anon; grant execute on function public.set_company_profile(text,text) to authenticated;

-- 4. MOU body kept on the agreement so staff can re-edit and regenerate
alter table public.agreements add column mou_body text, add column mou_fields jsonb, add column mou_pdf_path text, add column approved_by uuid, add column approved_at timestamptz;
create or replace function public.save_mou(aid uuid, body text, fields jsonb, pdf_path text) returns void language plpgsql security definer set search_path = public as $$
declare st text; pid text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can prepare the MOU'; end if;
  select status, partner_id into st, pid from public.agreements where id = aid;
  if st is null then raise exception 'Agreement not found'; end if;
  if st in ('Signed','Void') then raise exception 'This agreement is already finished'; end if;
  if pdf_path is not null and (pdf_path like '%..%' or split_part(pdf_path,'/',1) <> pid) then raise exception 'Bad file path'; end if;
  update public.agreements set mou_body = body, mou_fields = fields, mou_pdf_path = coalesce(pdf_path, mou_pdf_path) where id = aid;
end $$;
revoke execute on function public.save_mou(uuid,text,jsonb,text) from public, anon; grant execute on function public.save_mou(uuid,text,jsonb,text) to authenticated;

-- 5. Partner address and certificate numbers
alter table public.partners add column address text;
update public.partners p set address = a.answers->>'address' from public.applications a where a.partner_id = p.id and p.address is null;
alter table public.certificates add column cert_no text;
create sequence public.certificate_seq;
create or replace function public.certificates_no_t() returns trigger language plpgsql as $$
declare tc text;
begin
  if new.cert_no is null then
    select type_code into tc from public.partners where id = new.partner_id;
    new.cert_no := 'ELC/' || coalesce(tc,'PTR') || '/' || to_char(now(),'YYYY') || '/' || lpad(nextval('public.certificate_seq')::text, 4, '0');
  end if;
  return new;
end $$;
create trigger certificates_no_t before insert on public.certificates for each row execute function public.certificates_no_t();
do $$ declare r record; begin for r in select c.id, p.type_code, c.issued_at from public.certificates c join public.partners p on p.id = c.partner_id where c.cert_no is null order by c.issued_at loop
  update public.certificates set cert_no = 'ELC/' || r.type_code || '/' || to_char(r.issued_at,'YYYY') || '/' || lpad(nextval('public.certificate_seq')::text, 4, '0') where id = r.id; end loop; end $$;

drop function public.verify_certificate(text);
create function public.verify_certificate(c text) returns table(valid boolean, partner_id text, partner_name text, type_name text, district text, issued_at timestamptz,
  cert_no text, address text, state text, company text, company_address text)
language sql stable security definer set search_path = public as $$
  select (not x.revoked and p.status = 'Active'), p.id, p.name, t.name, p.district, x.issued_at, x.cert_no, p.address, p.state,
         (select value from public.company_profile where key='legal_name'), (select value from public.company_profile where key='address')
  from public.certificates x join public.partners p on p.id = x.partner_id join public.partner_types t on t.code = p.type_code
  where x.code = upper(trim(c)) $$;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- 6. Approval copies the address and links documents to the new partner
create or replace function public.approve_application(app uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a public.applications; pid text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve'; end if;
  select * into a from public.applications where id = app for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.partner_id is not null then return a.partner_id; end if;
  if a.status in ('Rejected','Approved') then raise exception 'This application is already finished'; end if;
  perform set_config('epdms.approving','on',true);
  pid := public.next_partner_id(a.type_code);
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin,address)
  values (pid,a.type_code,a.business_name,a.contact_name,a.phone,a.email,a.state,a.district,a.gstin,a.answers->>'address');
  update public.application_documents set partner_id = pid where application_id = app;
  update public.applications set status='Agreement pending', partner_id=pid where id = app;
  return pid;
end $$;

-- 7. Signing no longer activates by itself. The company approves the signed MOU (activate_partner).
create or replace function public.esign_completed(docid text, path text) returns text language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  select * into a from public.agreements where esign_document_id = docid for update;
  if a.id is null then raise exception 'No agreement for this document'; end if;
  if a.status = 'Signed' then return null; end if;
  if path is null or path like '%..%' or split_part(path, '/', 1) <> a.partner_id then raise exception 'Bad file path'; end if;
  update public.agreements set status = 'Signed', signed_at = now(), signed_path = path where id = a.id;
  perform public.notify_partner(a.partner_id, 'Your MOU is signed', 'Thank you. EarthLabs will now approve the signed MOU and activate your account. Your login follows by e-mail.', '/partner/agreements/');
  return 'signed';
end $$;
create or replace function public.record_signed_agreement(aid uuid, path text) returns text language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can record a signed agreement'; end if;
  update public.agreements set status='Signed', signed_at=now(), signed_path=path where id = aid and status in ('Sent','Draft') returning partner_id into pid;
  if pid is null then raise exception 'Only an open agreement can be marked signed'; end if;
  return 'signed';
end $$;
create or replace function public.application_signed_t() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Signed' and old.status is distinct from 'Signed' then
    update public.applications set status = 'MOU signed' where partner_id = new.partner_id and status = 'Agreement pending';
  end if;
  return null;
end $$;

create or replace function public.activate_partner(pid text) returns text language plpgsql security definer set search_path = public as $$
declare ag public.agreements; code text; cno text; mail text; nm text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve the signed MOU'; end if;
  select * into ag from public.agreements where partner_id = pid and status = 'Signed' order by signed_at desc limit 1;
  if ag.id is null then raise exception 'There is no signed MOU for this partner yet'; end if;
  update public.agreements set approved_by = auth.uid(), approved_at = now() where id = ag.id and approved_at is null;
  update public.partners set status = 'Active' where id = pid and status = 'Agreement Pending';
  select c.code into code from public.certificates c where c.partner_id = pid and not c.revoked order by issued_at desc limit 1;
  if code is null then insert into public.certificates(partner_id, agreement_id) values (pid, ag.id) returning certificates.code into code; end if;
  select cert_no into cno from public.certificates where certificates.code = activate_partner.code;
  perform set_config('epdms.approving','on',true);
  update public.applications set status = 'Approved' where partner_id = pid and status in ('MOU signed','Agreement pending');
  select email, name into mail, nm from public.partners where id = pid;
  if mail is not null then insert into public.email_outbox(to_email, subject, body) values (mail, 'Your EarthLabs partner certificate - ' || cno,
    'Dear ' || nm || E',\n\nYour MOU is approved by EarthLabs and your partnership is now active.\n\nPartner ID         : ' || pid || E'\nCertificate number : ' || cno ||
    E'\n\nView and print your certificate: https://www.earthlabsproducts.com/partner/certificate/?code=' || code ||
    E'\nAnyone can verify it at: https://www.earthlabsproducts.com/partner/verify/?code=' || code || E'\n\nEarthLabs Partner Network'); end if;
  return code;
end $$;
revoke execute on function public.activate_partner(text) from public, anon; grant execute on function public.activate_partner(text) to authenticated;

-- 8. Application e-mails know the MOU signed step
create or replace function public.application_mail(a applications) returns void
language plpgsql security definer set search_path = public as $$
declare subj text; head text; nxt text; base text := 'https://www.earthlabsproducts.com/partner/';
  st text := a.status; lvl int; mk text[] := array['[ ]','[ ]','[ ]','[ ]','[ ]']; i int; docs text := '';
begin
  if a.email is null then return; end if;
  lvl := case st when 'Submitted' then 1 when 'Documents requested' then 2 when 'Documents submitted' then 2 when 'More info needed' then 2
                 when 'Field verification' then 3 when 'Agreement pending' then 4 when 'MOU signed' then 5 when 'Approved' then 5 else 1 end;
  for i in 1..5 loop mk[i] := case when i < lvl then '[x]' when i = lvl then (case when st = 'Approved' then '[x]' else '[>]' end) else '[ ]' end; end loop;
  if st = 'Submitted' then
    subj := 'Application received - ' || a.ref_no;
    head := 'We have received your application.';
    nxt := 'Our team will review your basic details first. If they look good, we will e-mail you the list of documents to upload. We will e-mail you at every step.';
  elsif st = 'Documents requested' then
    subj := 'Next step: upload your documents - ' || a.ref_no;
    head := 'Your basic application is reviewed. Please upload your documents.';
    select string_agg('  - ' || d, E'\n') into docs from unnest(public.required_docs(a.type_code)) d;
    nxt := E'Documents required:\n' || docs || E'\n\nOpen the link below, go to the Documents tab, upload each file (PDF, JPG or PNG, up to 8 MB) and press Submit documents.';
  elsif st = 'Documents submitted' then
    subj := 'Documents received - ' || a.ref_no;
    head := 'Thank you. We have received your documents.';
    nxt := 'Our team will check them and e-mail you the result. If anything is missing we will tell you exactly what.';
  elsif st = 'More info needed' then
    subj := 'Action needed on your application - ' || a.ref_no;
    head := 'We need a little more from you before we can continue.';
    nxt := E'What we need: ' || coalesce(a.reason, 'please contact us') || E'\nUpload the corrected documents from the Documents tab at the link below, then press Submit documents again.';
  elsif st = 'Field verification' then
    subj := 'Meeting or field visit - ' || a.ref_no;
    head := 'Your documents are reviewed. The next step is a meeting or field visit.';
    nxt := coalesce('Details: ' || a.reason || E'\n', '') || 'Our team will contact you on ' || coalesce(a.phone, 'your mobile number') || ' to confirm the date.';
  elsif st = 'Agreement pending' then
    subj := 'Approved - please sign your MOU - ' || a.ref_no;
    head := 'Congratulations. Your application is approved.';
    nxt := 'Your Partner ID is ' || coalesce(a.partner_id, '(being issued)') || E'.\nNext, you will receive your MOU (partnership agreement) from Leegality by e-mail / SMS with a secure link. Sign it with Aadhaar e-sign or OTP.\nAs soon as it is signed, we e-mail your login ID and password.';
  elsif st = 'MOU signed' then
    subj := 'MOU signed - activation in progress - ' || a.ref_no;
    head := 'Thank you. Your MOU is signed.';
    nxt := 'EarthLabs is approving the signed MOU. As soon as it is approved, your partnership is activated and we e-mail your certificate and your login ID and password.';
  elsif st = 'Approved' then
    subj := 'You are all set - Partner ID ' || coalesce(a.partner_id, '') || ' - ' || a.ref_no;
    head := 'Your MOU is signed and your partnership is active.';
    nxt := 'Your Partner ID is ' || coalesce(a.partner_id, '') || E'.\nYour login ID and a temporary password are in a separate e-mail, and your certificate is in another. Sign in at ' || base || E' and choose your own password the first time.';
  elsif st = 'Rejected' then
    subj := 'Application update - ' || a.ref_no;
    head := 'We are not able to approve this application right now.';
    nxt := E'Reason: ' || coalesce(a.reason, 'not specified') || E'\nYou are welcome to reapply when this is resolved.';
  else return; end if;
  insert into public.email_outbox(to_email, subject, body) values (a.email, subj,
    'Dear ' || coalesce(nullif(trim(a.contact_name), ''), a.business_name) || E',\n\n' || head || E'\n\n' ||
    'Reference number : ' || a.ref_no || E'\n' ||
    'Reference ID     : ' || a.id || E'\n' ||
    'Business         : ' || a.business_name || E'\n' ||
    'Registered mobile: ' || coalesce(a.phone, '-') || E'\n' ||
    'Current status   : ' || st || E'\n\n' ||
    E'Progress\n' || mk[1] || E' Application received\n' || mk[2] || E' Documents\n' || mk[3] || E' Verification / field visit\n' || mk[4] || E' Agreement (MOU e-sign)\n' || mk[5] || E' Login issued\n\n' ||
    nxt || E'\n\n' ||
    'Track your application and upload documents: ' || base || E'track/\n(use your reference number and this e-mail address)\n\n' ||
    'EarthLabs Partner Network');
end $$;
