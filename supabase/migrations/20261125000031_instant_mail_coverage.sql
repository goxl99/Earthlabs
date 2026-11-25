-- EPDMS 031: send e-mail the moment it is queued, and a coverage summary for Partners and Territory Explorer.
-- Additive and idempotent. Nothing here changes existing columns or rows.
--
-- ONE-OFF PER PROJECT (run once in the SQL editor; the value is the same as the CRON_SECRET edge-function secret and never goes in the repo):
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
-- Until that secret exists, the trigger below does nothing and the scheduled job still delivers (just later), so this is safe to apply first.

-- 1. Claim queued mail so an instant send and the scheduled retry can never send the same message twice.
alter table public.email_outbox add column if not exists claimed_at timestamptz;
create index if not exists email_outbox_queued_idx on public.email_outbox (created_at) where status = 'queued';

create or replace function public.claim_emails(n int default 50) returns setof public.email_outbox
language sql security definer set search_path = public as $$
  update public.email_outbox o set claimed_at = now()
  where o.id in (
    select id from public.email_outbox
    where status = 'queued' and attempts < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by created_at limit greatest(1, least(n, 100)) for update skip locked)
  returning o.*;
$$;
revoke all on function public.claim_emails(int) from public, anon, authenticated;
grant execute on function public.claim_emails(int) to service_role;

-- 2. Fire the delivery function right after any statement that queues mail. pg_net sends the request after the transaction commits,
--    so the person who submitted never waits for it, and any failure here is swallowed (the scheduled job is the safety net).
create or replace function public.email_outbox_kick() returns trigger language plpgsql security definer set search_path = public, vault as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then return null; end if;
  perform net.http_post(url := 'https://dkkwlipkhvuigkgjwizn.supabase.co/functions/v1/send-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s), body := '{}'::jsonb, timeout_milliseconds := 5000);
  return null;
exception when others then return null;
end $$;
revoke all on function public.email_outbox_kick() from public, anon, authenticated;
drop trigger if exists email_outbox_kick_t on public.email_outbox;
create trigger email_outbox_kick_t after insert on public.email_outbox for each statement execute function public.email_outbox_kick();

-- 3. The scheduled job becomes a once-a-minute retry (it was every 5 minutes). Same job, same command.
do $$ begin
  perform cron.alter_job(job_id := (select jobid from cron.job where jobname = 'send-emails-every-5-min'), schedule := '* * * * *');
exception when others then null;
end $$;

-- 4. Coverage counts per district and partner type, for the Partners and Territory Explorer screens.
--    Onboarded = active partners. Pending = partners awaiting their signed agreement + applications still in progress.
--    Runs with the caller's rights, so row-level security decides what each person can count.
create or replace function public.coverage_counts() returns table (district text, type_code text, onboarded int, pending int)
language sql stable security invoker set search_path = public as $$
  select x.district, x.type_code,
    (count(*) filter (where x.kind = 'p' and x.st = 'Active'))::int,
    (count(*) filter (where (x.kind = 'p' and x.st = 'Agreement Pending') or x.kind = 'a'))::int
  from (
    select p.district, p.type_code, p.status as st, 'p'::text as kind from public.partners p where p.status in ('Active', 'Agreement Pending')
    union all
    select a.district, a.type_code, a.status, 'a' from public.applications a where a.partner_id is null and a.status <> 'Rejected'
  ) x
  group by x.district, x.type_code;
$$;
revoke all on function public.coverage_counts() from public, anon;
grant execute on function public.coverage_counts() to authenticated;
