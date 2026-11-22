-- EPDMS 009 (build 5): invoices with GST split, credit notes, append-only partner ledger, manual payments,
-- partner payment proofs (UTR or advice) with duplicate block and Accounts confirmation gate.
-- No prices are accepted from the client anywhere in this file: invoice amounts are copied from the order, which the database priced.

-- company details used for the GST split (state only; no GSTIN or other real data is stored in the repo)
insert into public.settings(key,value) values ('company','{"state":"Gujarat"}') on conflict (key) do nothing;

-- ============ 1) Ledger (append only) ============
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  at timestamptz not null default now(),
  kind text not null check (kind in ('invoice','payment','credit_note','adjustment')),
  ref text not null,                                   -- invoice, credit note or order number
  utr text,                                            -- set for payments
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  narration text,
  by_user uuid default auth.uid(),
  check ((debit > 0) <> (credit > 0))                  -- exactly one side per row
);
create index ledger_partner_idx on public.ledger_entries(partner_id, at desc);
-- one UTR can be recorded as a payment only once, whoever enters it
create unique index ledger_utr_idx on public.ledger_entries(lower(trim(utr))) where kind = 'payment';
alter table public.ledger_entries enable row level security;
create policy ledger_read on public.ledger_entries for select using (public.my_role() in ('super_admin','accounts') or partner_id = public.my_partner());
revoke insert, update, delete, truncate on public.ledger_entries from anon, authenticated;
create or replace function public.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'Ledger entries cannot be changed. Post a credit note or an adjustment instead'; end $$;
create trigger ledger_no_change before update or delete on public.ledger_entries for each row execute function public.ledger_immutable();
create trigger audit_ledger after insert on public.ledger_entries for each row execute function public.audit_row('partner_id');

create or replace function public.post_ledger(pid text, k text, r text, u text, dr numeric, cr numeric, note text) returns void
language sql security definer set search_path = public as $$
  insert into public.ledger_entries(partner_id, kind, ref, utr, debit, credit, narration) values (pid, k, r, nullif(trim(u),''), dr, cr, note)
$$;
revoke execute on function public.post_ledger(text,text,text,text,numeric,numeric,text) from public, anon, authenticated;

-- every confirmed order payment lands in the ledger (credit)
create or replace function public.order_payment_to_ledger() returns trigger language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  select partner_id into pid from public.orders where id = new.order_id;
  perform public.post_ledger(pid, 'payment', new.order_id, new.utr, 0, new.amount, 'Payment against ' || new.order_id);
  return new;
end $$;
create trigger order_payment_ledger_t after insert on public.order_payments for each row execute function public.order_payment_to_ledger();

create or replace function public.ledger_balance(pid text) returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.my_role() in ('super_admin','accounts') or pid = public.my_partner()) then raise exception 'Not allowed'; end if;
  return (select coalesce(sum(debit - credit), 0) from public.ledger_entries where partner_id = pid);   -- positive = partner owes EarthLabs
end $$;
grant execute on function public.ledger_balance(text) to authenticated;

-- ============ 2) Invoices ============
create sequence public.invoice_seq;
create table public.invoices (
  id text primary key default ('INV-' || lpad(nextval('public.invoice_seq')::text, 6, '0')),
  order_id text not null unique references public.orders(id),
  partner_id text not null references public.partners(id),
  issued_on date not null default current_date,
  supply_state text not null,
  taxable numeric(12,2) not null, cgst numeric(12,2) not null default 0, sgst numeric(12,2) not null default 0, igst numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  issued_by uuid default auth.uid(),
  check (taxable + cgst + sgst + igst = total)
);
create index invoices_partner_idx on public.invoices(partner_id, issued_on desc);
create table public.invoice_lines (
  invoice_id text not null references public.invoices(id),
  sku text not null, name text not null, units int not null, unit_price numeric(12,4) not null, amount numeric(12,2) not null,
  primary key (invoice_id, sku)
);
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy invoices_read on public.invoices for select using (public.my_role() in ('super_admin','accounts','sales') or partner_id = public.my_partner());
create policy invoice_lines_read on public.invoice_lines for select using (exists (select 1 from public.invoices i where i.id = invoice_id));
revoke insert, update, delete, truncate on public.invoices, public.invoice_lines from anon, authenticated;
revoke all on public.invoice_seq from anon, authenticated;
create trigger invoices_no_change before update or delete on public.invoices for each row execute function public.ledger_immutable();
create trigger invoice_lines_no_change before update or delete on public.invoice_lines for each row execute function public.ledger_immutable();
create trigger audit_invoices after insert on public.invoices for each row execute function public.audit_row('id');

-- Accounts issues the tax invoice for a paid order. Amounts come from the order only; CGST+SGST inside the company state, IGST outside it.
create or replace function public.issue_invoice(oid text) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; p public.partners; home text; iid text; half numeric; c numeric := 0; s numeric := 0; i numeric := 0;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can issue invoices'; end if;
  select * into o from public.orders where id = oid for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('Payment Confirmed','Dispatched','Delivered') then raise exception 'An invoice can be issued only after payment is confirmed (this order is %)', o.status; end if;
  if exists (select 1 from public.invoices where order_id = oid) then raise exception 'This order already has an invoice'; end if;
  select * into p from public.partners where id = o.partner_id;
  select value #>> '{state}' into home from public.settings where key = 'company';
  if lower(coalesce(p.state,'')) = lower(coalesce(home,'Gujarat')) then
    half := round(o.gst / 2, 2); c := half; s := o.gst - half;
  else i := o.gst; end if;
  insert into public.invoices(order_id, partner_id, supply_state, taxable, cgst, sgst, igst, total)
  values (oid, o.partner_id, p.state, o.net, c, s, i, o.net + o.gst) returning id into iid;
  insert into public.invoice_lines(invoice_id, sku, name, units, unit_price, amount)
  select iid, l.sku, k.name, l.units, l.unit_price, l.amount from public.order_lines l join public.skus k on k.sku = l.sku where l.order_id = oid;
  perform public.post_ledger(o.partner_id, 'invoice', iid, null, o.net + o.gst, 0, 'Invoice for ' || oid);
  perform public.notify_partner(o.partner_id, 'Invoice ' || iid || ' issued', 'Tax invoice for order ' || oid || ' is ready in your invoices.', '/partner/invoices/');
  return iid;
end $$;

-- a paid-and-invoiced order can be cancelled only after the whole invoice is reversed by credit notes
create or replace function public.orders_invoice_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invoices; cn numeric;
begin
  if new.status = 'Cancelled' and old.status <> 'Cancelled' then
    select * into inv from public.invoices where order_id = new.id;
    if inv.id is not null then
      select coalesce(sum(amount),0) into cn from public.credit_notes where invoice_id = inv.id;
      if cn < inv.total then raise exception 'Issue credit notes for the full invoice % before cancelling this order', inv.id; end if;
    end if;
  end if;
  return new;
end $$;

-- ============ 3) Credit notes ============
create sequence public.credit_note_seq;
create table public.credit_notes (
  id text primary key default ('CN-' || lpad(nextval('public.credit_note_seq')::text, 6, '0')),
  invoice_id text not null references public.invoices(id),
  partner_id text not null references public.partners(id),
  amount numeric(12,2) not null check (amount > 0),          -- total including GST
  taxable numeric(12,2) not null, cgst numeric(12,2) not null default 0, sgst numeric(12,2) not null default 0, igst numeric(12,2) not null default 0,
  reason text not null check (length(trim(reason)) >= 5),
  issued_on date not null default current_date,
  issued_by uuid default auth.uid()
);
create index credit_notes_invoice_idx on public.credit_notes(invoice_id);
alter table public.credit_notes enable row level security;
create policy cn_read on public.credit_notes for select using (public.my_role() in ('super_admin','accounts') or partner_id = public.my_partner());
revoke insert, update, delete, truncate on public.credit_notes from anon, authenticated;
revoke all on public.credit_note_seq from anon, authenticated;
create trigger cn_no_change before update or delete on public.credit_notes for each row execute function public.ledger_immutable();
create trigger audit_credit_notes after insert on public.credit_notes for each row execute function public.audit_row('id');
create trigger orders_invoice_guard_t before update on public.orders for each row execute function public.orders_invoice_guard();

-- Accounts raises a credit note against an invoice. It can never exceed what is still uncredited; the GST split follows the invoice.
create or replace function public.issue_credit_note(inv_id text, amt numeric, why text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; done_ numeric; cid text; tx numeric; gst numeric; c numeric := 0; s numeric := 0; i numeric := 0; half numeric;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can issue credit notes'; end if;
  if length(trim(coalesce(why,''))) < 5 then raise exception 'A reason is required'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  select * into inv from public.invoices where id = inv_id for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  select coalesce(sum(amount),0) into done_ from public.credit_notes where invoice_id = inv_id;
  if done_ + amt > inv.total then raise exception 'Credit notes cannot exceed the invoice. Still available: %', inv.total - done_; end if;
  tx := round(amt * inv.taxable / inv.total, 2); gst := amt - tx;
  if inv.igst > 0 then i := gst; else half := round(gst / 2, 2); c := half; s := gst - half; end if;
  insert into public.credit_notes(invoice_id, partner_id, amount, taxable, cgst, sgst, igst, reason) values (inv_id, inv.partner_id, amt, tx, c, s, i, trim(why)) returning id into cid;
  perform public.post_ledger(inv.partner_id, 'credit_note', cid, null, 0, amt, trim(why));
  perform public.notify_partner(inv.partner_id, 'Credit note ' || cid || ' issued', trim(why), '/partner/invoices/');
  return cid;
end $$;

-- ============ 4) Manual payment entry (bank transfer received outside an order, e.g. an advance) ============
create or replace function public.record_payment(pid text, utr text, amt numeric, mode text, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can record payments'; end if;
  if length(trim(coalesce(utr,''))) < 6 then raise exception 'Enter the UTR or reference number (at least 6 characters)'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter an amount above zero'; end if;
  if not exists (select 1 from public.partners where id = pid) then raise exception 'Partner not found'; end if;
  if exists (select 1 from public.order_payments where lower(trim(order_payments.utr)) = lower(trim(record_payment.utr))) then raise exception 'This UTR is already recorded against a payment'; end if;
  begin
    perform public.post_ledger(pid, 'payment', 'MANUAL', utr, 0, amt, coalesce(nullif(trim(mode),''),'Bank transfer') || coalesce(' · ' || nullif(trim(note),''), ''));
  exception when unique_violation then raise exception 'This UTR is already recorded against a payment';
  end;
end $$;

-- ============ 5) Partner payment proof (UTR or payment advice) and Accounts confirmation ============
create table public.payment_proofs (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  order_id text not null references public.orders(id),
  utr text not null check (length(trim(utr)) >= 6),
  amount numeric(12,2) not null check (amount > 0),
  file_path text,                                   -- optional advice in the private 'payment-proofs' bucket, folder = Partner ID
  note text,
  status text not null default 'Submitted' check (status in ('Submitted','Confirmed','Rejected')),
  reason text,
  reviewed_by uuid, reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);
create index payment_proofs_order_idx on public.payment_proofs(order_id);
create index payment_proofs_status_idx on public.payment_proofs(status, submitted_at);
-- the same UTR cannot sit in two live proofs
create unique index payment_proofs_utr_idx on public.payment_proofs(lower(trim(utr))) where status <> 'Rejected';
alter table public.payment_proofs enable row level security;
create policy proofs_read on public.payment_proofs for select using (public.my_role() in ('super_admin','accounts','sales') or partner_id = public.my_partner());
revoke insert, update, delete, truncate on public.payment_proofs from anon, authenticated;
create trigger audit_payment_proofs after insert or update on public.payment_proofs for each row execute function public.audit_row('id');

create or replace function public.submit_payment_proof(oid text, utr text, amt numeric, path text, note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare pid text := public.my_partner(); o public.orders; pid_ text; n bigint;
begin
  if pid is null or public.my_role() not in ('dealer','distributor') then raise exception 'Only partners can submit payment proof'; end if;
  select * into o from public.orders where id = oid;
  if o.id is null or o.partner_id <> pid then raise exception 'Order not found'; end if;
  if o.status <> 'Approved' then raise exception 'Payment can be reported only for an approved order (this one is %)', o.status; end if;
  if length(trim(coalesce(utr,''))) < 6 then raise exception 'Enter the UTR or reference number (at least 6 characters)'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter the amount you paid'; end if;
  if path is not null and (path like '%..%' or split_part(path, '/', 1) <> pid) then raise exception 'The file must be uploaded to your own folder'; end if;
  if (select count(*) from public.payment_proofs where partner_id = pid and submitted_at > now() - interval '1 hour') >= 20 then raise exception 'Too many submissions. Please try again later'; end if;
  if exists (select 1 from public.order_payments p where lower(trim(p.utr)) = lower(trim(submit_payment_proof.utr)))
     or exists (select 1 from public.ledger_entries l where l.kind = 'payment' and lower(trim(l.utr)) = lower(trim(submit_payment_proof.utr)))
     or exists (select 1 from public.payment_proofs x where x.status <> 'Rejected' and lower(trim(x.utr)) = lower(trim(submit_payment_proof.utr))) then
    raise exception 'This UTR has already been used. Check the number or contact EarthLabs';
  end if;
  insert into public.payment_proofs(partner_id, order_id, utr, amount, file_path, note) values (pid, oid, trim(utr), amt, nullif(path,''), nullif(trim(note),'')) returning id into n;
  return n;
end $$;

-- Accounts confirms a proof after checking the bank. The order moves on only through confirm_order_payment (the payment gate).
create or replace function public.confirm_payment_proof(proof_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p public.payment_proofs; res text;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can confirm payments'; end if;
  select * into p from public.payment_proofs where id = proof_id for update;
  if p.id is null then raise exception 'Proof not found'; end if;
  if p.status <> 'Submitted' then raise exception 'This proof is already %', lower(p.status); end if;
  res := public.confirm_order_payment(p.order_id, p.utr, p.amount);
  update public.payment_proofs set status = 'Confirmed', reviewed_by = auth.uid(), reviewed_at = now() where id = proof_id;
  return res;
end $$;

create or replace function public.reject_payment_proof(proof_id bigint, why text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payment_proofs;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Only Accounts or Super Admin can reject payment proof'; end if;
  if length(trim(coalesce(why,''))) < 5 then raise exception 'A reason is required'; end if;
  select * into p from public.payment_proofs where id = proof_id for update;
  if p.id is null then raise exception 'Proof not found'; end if;
  if p.status <> 'Submitted' then raise exception 'This proof is already %', lower(p.status); end if;
  update public.payment_proofs set status = 'Rejected', reason = trim(why), reviewed_by = auth.uid(), reviewed_at = now() where id = proof_id;
  perform public.notify_partner(p.partner_id, 'Payment proof not accepted for ' || p.order_id, trim(why), '/partner/orders/');
end $$;

revoke execute on function public.issue_invoice(text), public.issue_credit_note(text,numeric,text), public.record_payment(text,text,numeric,text,text),
  public.submit_payment_proof(text,text,numeric,text,text), public.confirm_payment_proof(bigint), public.reject_payment_proof(bigint,text) from public, anon;
grant execute on function public.issue_invoice(text), public.issue_credit_note(text,numeric,text), public.record_payment(text,text,numeric,text,text),
  public.submit_payment_proof(text,text,numeric,text,text), public.confirm_payment_proof(bigint), public.reject_payment_proof(bigint,text) to authenticated;
-- trigger functions are never called directly
revoke execute on function public.order_payment_to_ledger(), public.orders_invoice_guard(), public.ledger_immutable() from public, anon, authenticated;

-- ============ 6) Dashboard numbers: add money queues ============
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.app_role := public.my_role(); pid text := public.my_partner(); j jsonb := '{}';
begin
  if r is null then return j; end if;
  if public.is_staff() then
    j := jsonb_build_object(
      'applications_open', (select count(*) from public.applications where status in ('Submitted','More info needed','Field verification')),
      'partners_active', (select count(*) from public.partners where status = 'Active'),
      'orders_pending', (select count(*) from public.orders where status = 'Pending Approval'),
      'orders_to_pay', (select count(*) from public.orders where status = 'Approved'),
      'orders_to_dispatch', (select count(*) from public.orders where status = 'Payment Confirmed'),
      'low_stock', (select count(*) from public.stock s join public.skus k on k.sku = s.sku where k.status = 'active' and s.available - s.reserved <= s.reorder_level),
      'approvals_pending', case when public.is_super() then (select count(*) from public.change_requests where status = 'Pending') end,
      'proofs_to_check', case when r in ('super_admin','accounts') then (select count(*) from public.payment_proofs where status = 'Submitted') end,
      'orders_to_invoice', case when r in ('super_admin','accounts') then (select count(*) from public.orders o where o.status in ('Payment Confirmed','Dispatched','Delivered') and not exists (select 1 from public.invoices i where i.order_id = o.id)) end);
  elsif pid is not null then
    j := jsonb_build_object(
      'orders_open', (select count(*) from public.orders where partner_id = pid and status not in ('Delivered','Cancelled')),
      'orders_total', (select count(*) from public.orders where partner_id = pid),
      'orders_to_pay', (select count(*) from public.orders where partner_id = pid and status = 'Approved'),
      'ordered_value', (select coalesce(sum(total),0) from public.orders where partner_id = pid and status <> 'Cancelled'),
      'ledger_balance', (select coalesce(sum(debit - credit),0) from public.ledger_entries where partner_id = pid));
  end if;
  return j;
end $$;
grant execute on function public.dashboard_stats() to authenticated;
