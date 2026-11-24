-- EPDMS 021: vendor portal completion and walkthrough dashboards for partners and vendors. Additive; nothing existing is changed.
--  * vendor invoices (Vendor portal > Invoices & payments): the vendor uploads an invoice against a release order; Accounts accepts or
--    rejects it and records the payment (UTR once across vendor invoices and release orders)
--  * vendor can reject an approved release order before payment, and post delivery updates (In production / Dispatched)
--  * vendor_dashboard() and partner_dashboard() give the KPI tiles shown in the walkthrough

create sequence if not exists public.vinv_seq;
revoke all on public.vinv_seq from anon, authenticated;
create table if not exists public.vendor_invoices (
  id text primary key default ('VINV-' || to_char(current_date,'YYMM') || '-' || lpad(nextval('public.vinv_seq')::text, 4, '0')),
  vendor_id text not null references public.vendors(id),
  ro_id text not null references public.release_orders(id),
  invoice_no text not null check (length(trim(invoice_no)) > 0),
  invoice_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  file_path text,
  status text not null default 'Submitted' check (status in ('Submitted','Accepted','Rejected','Paid')),
  reason text, pay_utr text, paid_at timestamptz, decided_by uuid, created_at timestamptz not null default now(),
  unique (vendor_id, invoice_no)
);
create index if not exists vendor_invoices_vendor_idx on public.vendor_invoices(vendor_id, created_at desc);
create index if not exists vendor_invoices_status_idx on public.vendor_invoices(status, created_at desc);
create unique index if not exists vendor_invoices_utr_idx on public.vendor_invoices(lower(trim(pay_utr))) where pay_utr is not null;
alter table public.vendor_invoices enable row level security;
drop policy if exists vinv_read on public.vendor_invoices;
create policy vinv_read on public.vendor_invoices for select using (public.my_role() in ('super_admin','accounts') or vendor_id = (select public.my_vendor()));
revoke insert, update, delete, truncate on public.vendor_invoices from anon, authenticated;
grant select on public.vendor_invoices to authenticated;
drop trigger if exists audit_vendor_invoices on public.vendor_invoices;
create trigger audit_vendor_invoices after insert or update on public.vendor_invoices for each row execute function public.audit_row('id');

-- private bucket for invoice files; a vendor uploads only into the folder named after its Vendor ID
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public) values ('vendor-invoices','vendor-invoices',false) on conflict (id) do nothing;
    execute $p$create policy "vendor reads own invoices" on storage.objects for select to authenticated using (bucket_id = 'vendor-invoices' and ((storage.foldername(name))[1] = public.my_vendor() or public.my_role() in ('super_admin','accounts')))$p$;
    execute $p$create policy "vendor uploads own invoices" on storage.objects for insert to authenticated with check (bucket_id = 'vendor-invoices' and (storage.foldername(name))[1] = public.my_vendor())$p$;
  end if;
exception when duplicate_object then null;
end $$;

create or replace function public.submit_vendor_invoice(rid text, inv_no text, inv_date date, amt numeric, path text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v text := public.my_vendor(); r public.release_orders; nid text;
begin
  if v is null then raise exception 'Only a vendor can upload an invoice'; end if;
  select * into r from public.release_orders where id = rid and vendor_id = v;
  if r.id is null then raise exception 'Purchase order not found'; end if;
  if r.status not in ('Dispatched','Received') then raise exception 'Upload the invoice after you have dispatched the goods'; end if;
  if length(trim(coalesce(inv_no,''))) = 0 then raise exception 'Enter the invoice number'; end if;
  if coalesce(amt,0) <= 0 then raise exception 'Enter the invoice amount'; end if;
  if inv_date is null or inv_date > current_date then raise exception 'Enter the invoice date (not in the future)'; end if;
  if path is not null and (path like '%..%' or split_part(path,'/',1) <> v) then raise exception 'Bad file path'; end if;
  begin
    insert into public.vendor_invoices(vendor_id, ro_id, invoice_no, invoice_date, amount, file_path) values (v, rid, trim(inv_no), inv_date, amt, path) returning id into nid;
  exception when unique_violation then raise exception 'You have already uploaded invoice % ', trim(inv_no);
  end;
  perform public.ro_event(rid, r.status, 'Vendor invoice ' || trim(inv_no) || ' uploaded');
  return nid;
end $$;

create or replace function public.decide_vendor_invoice(iid text, accept boolean, why text default null) returns void
language plpgsql security definer set search_path = public as $$
declare i public.vendor_invoices;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can decide a vendor invoice'; end if;
  select * into i from public.vendor_invoices where id = iid for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if i.status <> 'Submitted' then raise exception 'This invoice is already %', lower(i.status); end if;
  if not accept and length(trim(coalesce(why,''))) < 3 then raise exception 'Give the reason for rejecting the invoice'; end if;
  update public.vendor_invoices set status = case when accept then 'Accepted' else 'Rejected' end, reason = case when accept then null else trim(why) end, decided_by = auth.uid() where id = iid;
end $$;

create or replace function public.pay_vendor_invoice(iid text, utr text) returns void
language plpgsql security definer set search_path = public as $$
declare i public.vendor_invoices;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can record a vendor payment'; end if;
  select * into i from public.vendor_invoices where id = iid for update;
  if i.id is null then raise exception 'Invoice not found'; end if;
  if i.status <> 'Accepted' then raise exception 'Accept the invoice before recording its payment'; end if;
  if length(trim(coalesce(utr,''))) < 6 then raise exception 'Enter the UTR of the payment'; end if;
  if exists (select 1 from public.release_orders where lower(trim(pay_utr)) = lower(trim(utr))) then raise exception 'This UTR is already used for another vendor payment'; end if;
  begin
    update public.vendor_invoices set status = 'Paid', pay_utr = trim(utr), paid_at = now() where id = iid;
  exception when unique_violation then raise exception 'This UTR is already used for another vendor payment';
  end;
end $$;

-- A vendor may decline an approved purchase order only before any payment has been released.
create or replace function public.vendor_reject_ro(rid text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(why,''))) < 3 then raise exception 'Give the reason for rejecting the purchase order'; end if;
  update public.release_orders set status = 'Rejected', reject_reason = 'Vendor: ' || trim(why)
   where id = rid and vendor_id = public.my_vendor() and status in ('Approved','Acknowledged') and pay_status = 'Unpaid';
  if not found then raise exception 'This purchase order cannot be rejected now (it may already be paid or on its way)'; end if;
  perform public.ro_event(rid, 'Rejected', 'Rejected by vendor: ' || trim(why));
end $$;

-- Delivery progress posted by the vendor. "Dispatched" goes through the same payment gate as vendor_dispatch_ro.
create or replace function public.vendor_delivery_update(rid text, stage text, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.release_orders;
begin
  select * into r from public.release_orders where id = rid and vendor_id = public.my_vendor() and status not in ('Pending approval','Rejected','Cancelled');
  if r.id is null then raise exception 'Purchase order not found'; end if;
  if stage = 'In production' then
    if r.status not in ('Approved','Acknowledged') then raise exception 'Only an open purchase order can be marked in production'; end if;
    perform public.ro_event(rid, r.status, 'In production' || case when length(trim(coalesce(note,''))) > 0 then ': ' || trim(note) else '' end);
  elsif stage = 'Dispatched' then
    perform public.vendor_dispatch_ro(rid);
    if length(trim(coalesce(note,''))) > 0 then perform public.ro_event(rid, 'Dispatched', trim(note)); end if;
  else raise exception 'Choose In production or Dispatched';
  end if;
end $$;

create or replace function public.vendor_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v text := public.my_vendor(); sc numeric;
begin
  if v is null then raise exception 'Vendor dashboard is for vendors only'; end if;
  select s.score into sc from public.vendor_scorecard(v) s limit 1;
  return jsonb_build_object('vendor_id', v,
    'open_pos', (select count(*) from public.release_orders where vendor_id = v and status in ('Approved','Acknowledged','Dispatched')),
    'open_rfqs', (select count(*) from public.rfqs r where r.status = 'Open' and exists (select 1 from public.rfq_invites i where i.rfq_id = r.id and i.vendor_id = v)),
    'score', sc,
    'payments_due', (select coalesce(sum(amount),0) from public.vendor_invoices where vendor_id = v and status in ('Submitted','Accepted')));
end $$;

create or replace function public.partner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid text := public.my_partner(); bal numeric; n_pay int; n_ord int; step text; href text; sc numeric; sales numeric;
begin
  if pid is null then raise exception 'Partner dashboard is for partners only'; end if;
  select coalesce(sum(total),0) into sales from public.orders where partner_id = pid and status <> 'Cancelled' and date_trunc('month', created_at) = date_trunc('month', now());
  select coalesce(sum(debit - credit),0) into bal from public.ledger_entries where partner_id = pid;
  select score into sc from public.partner_scores where partner_id = pid and score is not null order by month desc limit 1;
  select count(*) into n_pay from public.orders where partner_id = pid and status = 'Approved';
  select count(*) into n_ord from public.orders where partner_id = pid;
  if n_pay > 0 then step := 'Pay for your approved order'; href := '/orders/';
  elsif bal > 0 then step := 'Clear your outstanding invoices'; href := '/invoices/';
  elsif n_ord = 0 then step := 'Place your first order'; href := '/orders/#place';
  else step := 'Place your next order'; href := '/orders/#place'; end if;
  return jsonb_build_object('partner_id', pid, 'sales_month', sales, 'score', sc, 'outstanding', greatest(bal,0), 'next_step', step, 'next_href', href);
end $$;

revoke execute on function public.submit_vendor_invoice(text,text,date,numeric,text), public.decide_vendor_invoice(text,boolean,text), public.pay_vendor_invoice(text,text),
  public.vendor_reject_ro(text,text), public.vendor_delivery_update(text,text,text), public.vendor_dashboard(), public.partner_dashboard() from public, anon;
grant execute on function public.submit_vendor_invoice(text,text,date,numeric,text), public.decide_vendor_invoice(text,boolean,text), public.pay_vendor_invoice(text,text),
  public.vendor_reject_ro(text,text), public.vendor_delivery_update(text,text,text), public.vendor_dashboard(), public.partner_dashboard() to authenticated;
