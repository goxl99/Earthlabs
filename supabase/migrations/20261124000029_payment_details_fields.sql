-- Build 14: "Add payment details" as in the walkthrough: how paid, paying bank, date paid, advice upload.
alter table public.payment_proofs add column if not exists mode text check (mode is null or mode in ('Bank transfer (NEFT / RTGS / IMPS)','UPI','Cheque / demand draft','Gateway'));
alter table public.payment_proofs add column if not exists paid_on date;
alter table public.payment_proofs add column if not exists bank text;

drop function if exists public.submit_payment_proof(text, text, numeric, text, text);
create or replace function public.submit_payment_proof(oid text, utr text, amt numeric, path text, note text, how text default null, paid date default null, pay_bank text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare pid text := public.my_partner(); o public.orders; n bigint;
begin
  if pid is null or public.my_role() not in ('dealer','distributor') then raise exception 'Only partners can submit payment proof'; end if;
  select * into o from public.orders where id = oid;
  if o.id is null or o.partner_id <> pid then raise exception 'Order not found'; end if;
  if o.status <> 'Approved' then raise exception 'Payment can be reported only for an approved order (this one is %)', o.status; end if;
  if length(trim(coalesce(utr,''))) < 6 then raise exception 'Enter the UTR or reference number (at least 6 characters)'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter the amount you paid'; end if;
  if how is not null and how not in ('Bank transfer (NEFT / RTGS / IMPS)','UPI','Cheque / demand draft','Gateway') then raise exception 'Choose how you paid'; end if;
  if paid is not null and (paid > (now() at time zone 'Asia/Kolkata')::date or paid < (now() at time zone 'Asia/Kolkata')::date - 180) then raise exception 'The payment date must be within the last 180 days and not in the future'; end if;
  if path is not null and (path like '%..%' or split_part(path, '/', 1) <> pid) then raise exception 'The file must be uploaded to your own folder'; end if;
  if (select count(*) from public.payment_proofs where partner_id = pid and submitted_at > now() - interval '1 hour') >= 20 then raise exception 'Too many submissions. Please try again later'; end if;
  if exists (select 1 from public.order_payments p where lower(trim(p.utr)) = lower(trim(submit_payment_proof.utr)))
     or exists (select 1 from public.ledger_entries l where l.kind = 'payment' and lower(trim(l.utr)) = lower(trim(submit_payment_proof.utr)))
     or exists (select 1 from public.payment_proofs x where x.status <> 'Rejected' and lower(trim(x.utr)) = lower(trim(submit_payment_proof.utr))) then
    raise exception 'This UTR has already been used. Check the number or contact EarthLabs';
  end if;
  insert into public.payment_proofs(partner_id, order_id, utr, amount, file_path, note, mode, paid_on, bank)
  values (pid, oid, trim(utr), amt, nullif(path,''), nullif(trim(note),''), how, paid, nullif(trim(pay_bank),'')) returning id into n;
  return n;
end $$;
revoke all on function public.submit_payment_proof(text, text, numeric, text, text, text, date, text) from public, anon;
grant execute on function public.submit_payment_proof(text, text, numeric, text, text, text, date, text) to authenticated;
