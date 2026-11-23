-- EPDMS 017: readable application reference numbers, an e-mail on submission and on every status change,
-- and a standard footer (Partner ID, reference number, mobile) on every partner notification e-mail.

-- 1) Readable reference number (the long id stays as the tracking key)
create sequence if not exists public.application_ref_seq;
alter table public.applications add column if not exists ref_no text;
create or replace function public.applications_set_ref() returns trigger language plpgsql as $$
begin
  if new.ref_no is null then new.ref_no := 'APP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.application_ref_seq')::text, 4, '0'); end if;
  return new;
end $$;
drop trigger if exists applications_set_ref_t on public.applications;
create trigger applications_set_ref_t before insert on public.applications for each row execute function public.applications_set_ref();
do $$ declare r record; begin
  for r in select id, created_at from public.applications where ref_no is null order by created_at loop
    update public.applications set ref_no = 'APP-' || to_char(r.created_at, 'YYYY') || '-' || lpad(nextval('public.application_ref_seq')::text, 4, '0') where id = r.id;
  end loop;
end $$;
create unique index if not exists applications_ref_no_key on public.applications(ref_no);

-- 2) Track by reference number OR by the long reference id, with the e-mail used to apply
create or replace function public.track_application(ref text, mail text)
returns table(status text, business_name text, type_code text, reason text, partner_id text, created_at timestamptz, ref_no text)
language sql stable security definer set search_path = public as $$
  select a.status, a.business_name, a.type_code,
         case when a.status in ('More info needed','Rejected') then a.reason end,
         a.partner_id, a.created_at, a.ref_no
  from public.applications a
  where lower(a.email) = lower(trim(mail)) and (upper(a.ref_no) = upper(trim(ref)) or a.id::text = lower(trim(ref)))
$$;
grant execute on function public.track_application(text, text) to anon, authenticated;

-- 3) E-mails to the applicant
create or replace function public.application_mail(a public.applications) returns void
language plpgsql security definer set search_path = public as $$
declare subj text; head text; nxt text; steps text; base text := 'https://www.earthlabsproducts.com/partner/';
        st text := a.status; done text := '[ ]'; cur text := '[>]'; pend text := '[ ]';
        s1 text; s2 text; s3 text; s4 text;
begin
  if a.email is null then return; end if;
  s1 := case when st in ('Submitted','More info needed','Field verification','Approved') then '[x]' else '[ ]' end;
  s2 := case when st = 'Field verification' then cur when st = 'Approved' then '[x]' else pend end;
  s3 := case when st = 'Approved' then '[x]' else pend end;
  s4 := case when st = 'Approved' then cur else pend end;
  if st = 'Submitted' then
    subj := 'Application received - ' || a.ref_no;
    head := 'We have received your application and it is now in review.';
    nxt := 'Our team will check your details and documents. We will e-mail you at every step, so there is nothing more to do right now.';
  elsif st = 'More info needed' then
    subj := 'More information needed - ' || a.ref_no;
    head := 'We need a little more information before we can continue.';
    nxt := 'What we need: ' || coalesce(a.reason, 'please contact us') || E'\nPlease reply to this e-mail or call us with the details.';
  elsif st = 'Field verification' then
    subj := 'Your application is in field verification - ' || a.ref_no;
    head := 'Your documents are reviewed. The next step is a field verification.';
    nxt := 'Our team will contact you on ' || coalesce(a.phone, 'your mobile number') || ' to arrange it.';
  elsif st = 'Approved' then
    subj := 'Application approved - Partner ID ' || coalesce(a.partner_id, '') || ' - ' || a.ref_no;
    head := 'Congratulations. Your application is approved.';
    nxt := 'Your Partner ID is ' || coalesce(a.partner_id, '(being issued)') || E'.\nNext: sign in at ' || base || E' with this e-mail address (choose "Approved partner without a login? Create an account" the first time). Your partnership agreement will be sent for e-signature, and your certificate is issued once it is signed.';
  elsif st = 'Rejected' then
    subj := 'Application update - ' || a.ref_no;
    head := 'We are not able to approve this application right now.';
    nxt := 'Reason: ' || coalesce(a.reason, 'not specified') || E'\nYou are welcome to reapply when this is resolved.';
  else return; end if;
  insert into public.email_outbox(to_email, subject, body) values (a.email, subj,
    'Dear ' || coalesce(nullif(trim(a.contact_name), ''), a.business_name) || E',\n\n' || head || E'\n\n' ||
    'Reference number : ' || a.ref_no || E'\n' ||
    'Reference ID     : ' || a.id || E'\n' ||
    'Business         : ' || a.business_name || E'\n' ||
    'Registered mobile: ' || coalesce(a.phone, '-') || E'\n' ||
    'Current status   : ' || st || E'\n\n' ||
    'Progress\n' || s1 || ' Application received\n' || s2 || ' Verification\n' || s3 || ' Approval\n' || s4 || E' Agreement and certificate\n\n' ||
    nxt || E'\n\n' ||
    'Track your application any time: ' || base || E'track/\n(use your reference number and this e-mail address)\n\n' ||
    'EarthLabs Partner Network');
end $$;
revoke execute on function public.application_mail(public.applications) from public, anon, authenticated;

create or replace function public.applications_mail_t() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform public.application_mail(new);
  elsif new.status is distinct from old.status then perform public.application_mail(new); end if;
  return null;
end $$;
drop trigger if exists applications_mail_ins on public.applications;
drop trigger if exists applications_mail_upd on public.applications;
create trigger applications_mail_ins after insert on public.applications for each row execute function public.applications_mail_t();
create trigger applications_mail_upd after update of status on public.applications for each row execute function public.applications_mail_t();

-- 4) Partner notifications: every e-mail carries Partner ID, the reference found in the subject or text, mobile on file, and the sign-in link
create or replace function public.notify_partner(pid text, ttl text, msg text, lnk text) returns void
language plpgsql security definer set search_path = public as $$
declare mail text; ph text; wa jsonb; nm text; refx text; mailbody text;
begin
  insert into public.notifications(user_id,title,body,link) select id, ttl, msg, lnk from public.profiles where partner_id = pid and active;
  select email, regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), name into mail, ph, nm from public.partners where id = pid;
  refx := (regexp_match(ttl || ' ' || msg, '((?:ORD|INV|CN|RO|RFQ|APP)-[A-Z0-9-]+)'))[1];
  mailbody := 'Dear ' || coalesce(nm, 'Partner') || E',\n\n' || ttl || E'\n' || msg || E'\n\n' ||
          'Partner ID       : ' || pid || E'\n' ||
          coalesce('Reference number : ' || refx || E'\n', '') ||
          'Registered mobile: ' || coalesce(nullif(ph,''), '-') || E'\n\n' ||
          'View the latest status: https://www.earthlabsproducts.com' || case when lnk like '/partner%' then lnk else '/partner' || coalesce(nullif(lnk, ''), '/') end || E'\n\nEarthLabs Partner Network';
  if mail is not null then insert into public.email_outbox(to_email,subject,body) values (mail, ttl || coalesce(' - ' || refx, ''), mailbody); end if;
  select value into wa from public.settings where key = 'whatsapp';
  if coalesce((wa->>'enabled')::boolean, false) and ph is not null and ph <> '' then
    if length(ph) = 10 then ph := '91' || ph; end if;
    if ph ~ '^[0-9]{11,15}$' then insert into public.whatsapp_outbox(to_phone, body) values (ph, left(ttl || ': ' || msg, 900)); end if;
  end if;
end $$;
revoke execute on function public.notify_partner(text,text,text,text) from public, anon, authenticated;
