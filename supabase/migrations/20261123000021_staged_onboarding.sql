-- Staged onboarding: Submitted > Documents requested > Documents submitted > (More info needed | Field verification) > Agreement pending (MOU e-sign) > Approved (signed, login issued)
alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check check (status in
  ('Submitted','Documents requested','Documents submitted','More info needed','Field verification','Agreement pending','Approved','Rejected'));

create or replace function public.required_docs(t text) returns text[] language sql immutable as $$
  select case t
    when 'INS' then array['Registration / licence','GST certificate','Authority letter of contact person','Site address proof']
    when 'DST' then array['Company / firm registration','PAN card','Address proof of business','Bank statement (6 months)','Authorised person ID','Warehouse proof or lease','Financial statements (2 years)','Dealer network list']
    when 'STK' then array['Company / firm registration','PAN card','Address proof of business','Bank statement (6 months)','Authorised person ID','Warehouse photos and lease','Financial statements (2 years)','Fleet / logistics details']
    else array['Company / firm registration','PAN card','Address proof of business','Bank statement (6 months)','Authorised person ID'] end $$;

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null, file_path text not null, file_name text not null, size_bytes int,
  status text not null default 'Uploaded' check (status in ('Uploaded','Accepted','Rejected')),
  note text, uploaded_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz,
  unique (application_id, kind)
);
alter table public.application_documents enable row level security;
create policy appdocs_staff_read on public.application_documents for select using ((select public.is_staff()));
-- writes only through the application-docs function (service role) and review_document()

insert into storage.buckets(id,name,public) values ('application-docs','application-docs',false) on conflict do nothing;
create policy "staff read application docs" on storage.objects for select using (bucket_id = 'application-docs' and public.is_staff());

create or replace function public.review_document(doc uuid, st text, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can review documents'; end if;
  if st not in ('Accepted','Rejected') then raise exception 'Bad status'; end if;
  if st = 'Rejected' and coalesce(trim(note),'') = '' then raise exception 'Say what is wrong with the document'; end if;
  update public.application_documents set status = st, note = nullif(trim(note),''), reviewed_by = auth.uid(), reviewed_at = now() where id = doc;
end $$;
revoke execute on function public.review_document(uuid,text,text) from public, anon;
grant execute on function public.review_document(uuid,text,text) to authenticated;

-- Approval now issues the Partner ID and moves to Agreement pending. 'Approved' happens only when the MOU is signed.
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
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin)
  values (pid,a.type_code,a.business_name,a.contact_name,a.phone,a.email,a.state,a.district,a.gstin);
  update public.applications set status='Agreement pending', partner_id=pid where id = app;
  return pid;
end $$;

-- When the agreement is signed (Leegality webhook or manual upload) the application becomes Approved.
create or replace function public.application_signed_t() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Signed' and old.status is distinct from 'Signed' then
    perform set_config('epdms.approving','on',true);
    update public.applications set status = 'Approved' where partner_id = new.partner_id and status = 'Agreement pending';
  end if;
  return null;
end $$;
create trigger agreements_signed_app_t after update of status on public.agreements for each row execute function public.application_signed_t();

create or replace function public.track_application(ref text, mail text)
returns table(status text, business_name text, type_code text, reason text, partner_id text, created_at timestamptz, ref_no text)
language sql stable security definer set search_path = public as $$
  select a.status, a.business_name, a.type_code,
         case when a.status in ('More info needed','Rejected','Field verification') then a.reason end,
         a.partner_id, a.created_at, a.ref_no
  from public.applications a
  where lower(a.email) = lower(trim(mail)) and (upper(a.ref_no) = upper(trim(ref)) or a.id::text = lower(trim(ref))) $$;

create or replace function public.application_mail(a applications) returns void
language plpgsql security definer set search_path = public as $$
declare subj text; head text; nxt text; base text := 'https://www.earthlabsproducts.com/partner/';
  st text := a.status; lvl int; mk text[] := array['[ ]','[ ]','[ ]','[ ]','[ ]']; i int; docs text := '';
begin
  if a.email is null then return; end if;
  lvl := case st when 'Submitted' then 1 when 'Documents requested' then 2 when 'Documents submitted' then 2 when 'More info needed' then 2
                 when 'Field verification' then 3 when 'Agreement pending' then 4 when 'Approved' then 5 else 1 end;
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
  elsif st = 'Approved' then
    subj := 'You are all set - Partner ID ' || coalesce(a.partner_id, '') || ' - ' || a.ref_no;
    head := 'Your MOU is signed and your partnership is active.';
    nxt := 'Your Partner ID is ' || coalesce(a.partner_id, '') || E'.\nYour login ID and a temporary password are in a separate e-mail. Sign in at ' || base || E' and choose your own password the first time. Your partner certificate is available in the portal.';
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
