-- EPDMS 032: dealer outreach. Find dealers (AI web search or a staff list), approve them, send the first e-mail automatically, track replies and the next step.
-- Additive and idempotent. Nothing here changes existing rows. Mail goes through the existing email_outbox / send-emails path.
-- Nothing is sent to a dealer until a Super Admin sets the reply address (setting lead_reply_to) and approves the lead.

alter table public.email_outbox add column if not exists kind text;
alter table public.email_outbox add column if not exists reply_to text;

create table if not exists public.dealer_leads (
  id uuid primary key default gen_random_uuid(),
  district text not null,
  name text, business text, email text, phone text, website text, address text, products text,
  source text not null default 'staff' check (source in ('ai_search', 'staff')),
  source_url text,
  status text not null default 'Found' check (status in ('Found', 'Approved', 'Queued', 'Sent', 'Replied', 'Not interested', 'Opted out', 'Send failed', 'Converted', 'Rejected')),
  subject text, body text,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  outbox_id bigint, sent_at timestamptz, last_reply_at timestamptz,
  next_step text, next_step_note text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index if not exists dealer_leads_email_u on public.dealer_leads (lower(email)) where email is not null;
create index if not exists dealer_leads_district_idx on public.dealer_leads (district, status);
create index if not exists dealer_leads_outbox_idx on public.dealer_leads (outbox_id) where outbox_id is not null;

create table if not exists public.lead_replies (
  id bigint generated always as identity primary key,
  lead_id uuid references public.dealer_leads(id) on delete set null,
  from_email text, subject text, body text, intent text, ai_note text,
  resend_id text unique, received_at timestamptz not null default now()
);
create index if not exists lead_replies_lead_idx on public.lead_replies (lead_id, received_at desc);

alter table public.dealer_leads enable row level security;
alter table public.lead_replies enable row level security;
drop policy if exists dealer_leads_staff_read on public.dealer_leads;
drop policy if exists dealer_leads_staff_add on public.dealer_leads;
drop policy if exists dealer_leads_staff_edit on public.dealer_leads;
drop policy if exists lead_replies_staff_read on public.lead_replies;
create policy dealer_leads_staff_read on public.dealer_leads for select using (coalesce(public.my_role() in ('super_admin', 'sales'), false));
create policy dealer_leads_staff_add on public.dealer_leads for insert with check (coalesce(public.my_role() in ('super_admin', 'sales'), false) and status = 'Found' and source = 'staff');
create policy dealer_leads_staff_edit on public.dealer_leads for update using (coalesce(public.my_role() in ('super_admin', 'sales'), false)) with check (coalesce(public.my_role() in ('super_admin', 'sales'), false));
create policy lead_replies_staff_read on public.lead_replies for select using (coalesce(public.my_role() in ('super_admin', 'sales'), false));
-- Staff may edit the details, the draft and the next step directly. Status changes go through the functions below.
revoke all on public.dealer_leads from anon, authenticated;
revoke all on public.lead_replies from anon, authenticated;
grant select on public.dealer_leads, public.lead_replies to authenticated;
grant insert (district, name, business, email, phone, website, address, products, subject, body, source, status) on public.dealer_leads to authenticated;
grant update (name, business, email, phone, website, address, products, subject, body, next_step, next_step_note) on public.dealer_leads to authenticated;

create or replace function public.lead_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('super_admin', 'sales'), false) $$;
revoke all on function public.lead_is_staff() from public, anon;
grant execute on function public.lead_is_staff() to authenticated;

-- Approve leads: the e-mail goes out automatically afterwards (within the daily cap). Only leads with an address and a draft, and never an existing partner or applicant.
create or replace function public.approve_leads(ids uuid[]) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.lead_is_staff() then raise exception 'Only Super Admin or Sales can approve outreach'; end if;
  update public.dealer_leads l set status = 'Approved', approved_by = auth.uid(), approved_at = now(), next_step = 'First e-mail is being sent'
   where l.id = any(ids) and l.status = 'Found' and l.email is not null and coalesce(l.subject, '') <> '' and coalesce(l.body, '') <> ''
     and not exists (select 1 from public.partners p where lower(p.email) = lower(l.email))
     and not exists (select 1 from public.applications a where lower(a.email) = lower(l.email));
  get diagnostics n = row_count;
  perform public.release_approved_leads();
  return n;
end $$;
revoke all on function public.approve_leads(uuid[]) from public, anon;
grant execute on function public.approve_leads(uuid[]) to authenticated;

-- Manual status changes that never send mail.
create or replace function public.set_lead_status(ids uuid[], s text) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.lead_is_staff() then raise exception 'Only Super Admin or Sales can change leads'; end if;
  if s not in ('Found', 'Rejected', 'Converted', 'Not interested', 'Replied') then raise exception 'That status cannot be set by hand'; end if;
  update public.dealer_leads set status = s,
    next_step = case s when 'Rejected' then 'Closed: not a fit' when 'Converted' then 'Onboard as a partner' when 'Not interested' then 'Closed: not interested' when 'Replied' then 'Read the reply and decide' else next_step end,
    last_reply_at = case when s = 'Replied' then now() else last_reply_at end
   where id = any(ids) and status not in ('Opted out') and (s <> 'Found' or status in ('Rejected')) and (s <> 'Rejected' or status in ('Found', 'Approved'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_lead_status(uuid[], text) from public, anon;
grant execute on function public.set_lead_status(uuid[], text) to authenticated;

-- Super Admin sets where dealers' replies go, and the daily cap.
create or replace function public.set_lead_settings(reply_to text, daily_cap int) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), 'sales') <> 'super_admin' then raise exception 'Only Super Admin can change outreach settings'; end if;
  if reply_to is not null and reply_to !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'That is not a valid e-mail address'; end if;
  if daily_cap < 1 or daily_cap > 200 then raise exception 'Daily cap must be between 1 and 200'; end if;
  insert into public.settings(key, value) values ('lead_reply_to', to_jsonb(coalesce(reply_to, ''))) on conflict (key) do update set value = excluded.value;
  insert into public.settings(key, value) values ('lead_daily_cap', to_jsonb(daily_cap)) on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.set_lead_settings(text, int) from public, anon;
grant execute on function public.set_lead_settings(text, int) to authenticated;

create or replace function public.lead_settings() returns table (reply_to text, daily_cap int) language sql stable security definer set search_path = public as $$
  select nullif((select value #>> '{}' from public.settings where key = 'lead_reply_to'), ''), coalesce((select (value #>> '{}')::int from public.settings where key = 'lead_daily_cap'), 25)
  where public.lead_is_staff() $$;
revoke all on function public.lead_settings() from public, anon;
grant execute on function public.lead_settings() to authenticated;

-- Moves approved leads into the mail queue, up to the daily cap (India time). The queue trigger then sends instantly.
-- Does nothing until the reply address is set, so no dealer ever writes back into a mailbox nobody reads.
create or replace function public.release_approved_leads() returns int language plpgsql security definer set search_path = public as $$
declare cap int; used int; rto text; r record; oid bigint; n int := 0;
begin
  select nullif(value #>> '{}', '') into rto from public.settings where key = 'lead_reply_to';
  if rto is null then return 0; end if;
  select coalesce((value #>> '{}')::int, 25) into cap from public.settings where key = 'lead_daily_cap';
  cap := coalesce(cap, 25);
  select count(*) into used from public.email_outbox where kind = 'lead' and created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  for r in select * from public.dealer_leads where status = 'Approved' and outbox_id is null order by approved_at limit greatest(cap - used, 0) for update skip locked loop
    insert into public.email_outbox (to_email, subject, body, kind, reply_to)
      values (r.email, r.subject, r.body || E'\n\n--\nEarthLabs Innovative Products Pvt. Ltd., Vadodara, Gujarat.\nIf you would rather not hear from us, reply with the word STOP and we will not write again.', 'lead', rto)
      returning id into oid;
    update public.dealer_leads set outbox_id = oid, status = 'Queued' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.release_approved_leads() from public, anon, authenticated;

-- When the mail is really sent (or fails for good), the lead follows.
create or replace function public.lead_mail_sent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'lead' then
    if new.status = 'sent' and old.status is distinct from 'sent' then
      update public.dealer_leads set status = 'Sent', sent_at = coalesce(new.sent_at, now()), next_step = 'Wait for a reply (follow up in 7 days)' where outbox_id = new.id and status in ('Queued', 'Approved');
    elsif new.status = 'failed' and old.status is distinct from 'failed' then
      update public.dealer_leads set status = 'Send failed', next_step = 'Check the e-mail address' where outbox_id = new.id and status in ('Queued', 'Approved');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.lead_mail_sent() from public, anon, authenticated;
drop trigger if exists lead_mail_sent_t on public.email_outbox;
create trigger lead_mail_sent_t after update of status on public.email_outbox for each row execute function public.lead_mail_sent();

-- Retry every 10 minutes for leads held back by the daily cap or the missing reply address.
do $$ begin
  perform cron.schedule('release-approved-leads', '*/10 * * * *', 'select public.release_approved_leads()');
exception when others then null;
end $$;
