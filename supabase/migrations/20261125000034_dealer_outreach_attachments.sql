-- Brochure and video on the first e-mail. Files are listed in settings.lead_attachments ([{filename, path}]), copied onto each queued mail.
alter table public.email_outbox add column if not exists attachments jsonb;

create or replace function public.release_approved_leads() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare cap int; used int; rto text; r record; oid bigint; n int := 0; att jsonb; note text;
begin
  select nullif(value #>> '{}', '') into rto from public.settings where key = 'lead_reply_to';
  if rto is null then return 0; end if;
  select coalesce((value #>> '{}')::int, 25) into cap from public.settings where key = 'lead_daily_cap';
  cap := coalesce(cap, 25);
  select value into att from public.settings where key = 'lead_attachments';
  if att is null or jsonb_typeof(att) <> 'array' or jsonb_array_length(att) = 0 then att := null; end if;
  note := case when att is null then '' else E'\n\nI have attached our product brochure and a short video.' end;
  select count(*) into used from public.email_outbox where kind = 'lead' and created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  for r in select * from public.dealer_leads where status = 'Approved' and outbox_id is null order by approved_at limit greatest(cap - used, 0) for update skip locked loop
    insert into public.email_outbox (to_email, subject, body, kind, reply_to, attachments)
      values (r.email, r.subject, r.body || note || E'\n\n--\nEarthLabs Innovative Products Pvt. Ltd., Vadodara, Gujarat.\nIf you would rather not hear from us, reply with the word STOP and we will not write again.', 'lead', rto, att)
      returning id into oid;
    update public.dealer_leads set outbox_id = oid, status = 'Queued' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;
