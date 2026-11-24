-- EPDMS 025: Invoices & Payments > Credit & reminders. Accounts or Super Admin sends a payment reminder to a partner with an overdue balance.
-- One reminder per partner per 24 hours. The message is sent through the existing notify_partner (in-app, e-mail, WhatsApp when enabled).
create table if not exists public.payment_reminders (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  amount numeric(14,2) not null,
  sent_by uuid default auth.uid(), sent_at timestamptz not null default now()
);
create index if not exists payment_reminders_idx on public.payment_reminders(partner_id, sent_at desc);
alter table public.payment_reminders enable row level security;
drop policy if exists pr_read on public.payment_reminders;
create policy pr_read on public.payment_reminders for select using (public.my_role() in ('super_admin','accounts'));
revoke insert, update, delete, truncate on public.payment_reminders from anon, authenticated;
grant select on public.payment_reminders to authenticated;

create or replace function public.send_payment_reminder(pid text) returns void
language plpgsql security definer set search_path = public as $$
declare due numeric;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can send reminders'; end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into due from jsonb_array_elements(public.dashboard_overdue()) x where x ->> 'partner_id' = pid;
  if due <= 0 then raise exception 'This partner has nothing overdue'; end if;
  if exists (select 1 from public.payment_reminders where partner_id = pid and sent_at > now() - interval '24 hours') then raise exception 'A reminder was already sent to this partner in the last 24 hours'; end if;
  insert into public.payment_reminders(partner_id, amount) values (pid, due);
  perform public.notify_partner(pid, 'Payment reminder', 'An amount of Rs ' || to_char(due, 'FM9,99,99,990.00') || ' is overdue. Please pay it from Invoices & payments.', '/invoices/');
end $$;
revoke execute on function public.send_payment_reminder(text) from public, anon;
grant execute on function public.send_payment_reminder(text) to authenticated;
