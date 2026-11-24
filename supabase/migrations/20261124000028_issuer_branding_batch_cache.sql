-- Build 13: constant document layout, per-issuer branding (logo, PAN, bank), HSN on SKUs, QC cache from the Batch system.
alter table public.skus add column if not exists hsn text not null default '340130';

create table if not exists public.issuer_branding (
  owner_id text primary key,            -- 'COMPANY', a partner id or a vendor id
  kind text not null check (kind in ('company','partner','vendor')),
  legal_name text, address text, state text, state_code text, gstin text, pan text, email text,
  logo text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  bank jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.issuer_branding enable row level security;
revoke all on public.issuer_branding from anon, authenticated;

insert into public.issuer_branding(owner_id, kind, legal_name, address, state, state_code, gstin, pan, email, bank)
values ('COMPANY','company','Earthlabs Innovative Products Pvt. Ltd.','Shed No. 4, J D Patel Estate, IPCL Road, Ranoli, Vadodara, Gujarat 391350','Gujarat','24','24AAJCE7904M1ZB','AAJCE7904M','info@earthlabsproducts.com',
 '{"account_name":"M/S Earthlabs Innovative Products Pvt. Ltd.","bank":"ICICI Bank","account_no":"753405000580","ifsc":"ICIC0007534"}')
on conflict (owner_id) do nothing;

-- Staff set any brand; a partner or vendor sets only their own.
create or replace function public.set_branding(oid text, b jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if oid = 'COMPANY' then if public.my_role() <> 'super_admin' then raise exception 'Not allowed'; end if; k := 'company';
  elsif exists (select 1 from public.partners where id = oid) then
    if not (public.my_role() = 'super_admin' or oid = public.my_partner()) then raise exception 'Not allowed'; end if; k := 'partner';
  elsif exists (select 1 from public.vendors where id = oid) then
    if not (public.my_role() = 'super_admin' or oid = public.my_vendor()) then raise exception 'Not allowed'; end if; k := 'vendor';
  else raise exception 'Unknown owner'; end if;
  insert into public.issuer_branding(owner_id, kind, legal_name, address, state, state_code, gstin, pan, email, logo, bank)
  values (oid, k, b->>'legal_name', b->>'address', b->>'state', b->>'state_code', b->>'gstin', b->>'pan', b->>'email', nullif(b->>'logo',''), coalesce(b->'bank','{}'::jsonb))
  on conflict (owner_id) do update set legal_name = excluded.legal_name, address = excluded.address, state = excluded.state, state_code = excluded.state_code,
    gstin = excluded.gstin, pan = excluded.pan, email = excluded.email, logo = coalesce(excluded.logo, public.issuer_branding.logo), bank = excluded.bank, updated_at = now();
end $$;
create or replace function public.get_branding(oid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (public.my_role() = 'super_admin' or oid = coalesce(public.my_partner(), '') or oid = coalesce(public.my_vendor(), '')) then raise exception 'Not allowed'; end if;
  return coalesce((select to_jsonb(b) from public.issuer_branding b where owner_id = oid), '{}'::jsonb);
end $$;
revoke all on function public.set_branding(text, jsonb), public.get_branding(text) from public, anon;
grant execute on function public.set_branding(text, jsonb), public.get_branding(text) to authenticated;

-- QC facts copied from the Batch system (read-only link). Filled by the batch-qc edge function.
create table if not exists public.batch_qc_cache (
  batch_ref text primary key, product text, qc_status text, qty numeric, fetched_at timestamptz not null default now()
);
alter table public.batch_qc_cache enable row level security;
revoke all on public.batch_qc_cache from anon, authenticated;

create or replace function public.trade_doc(k text, doc_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid text; d jsonb; ls jsonb; o public.orders; i public.invoices; co jsonb; pa jsonb; credit_days int; br jsonb; cbr jsonb; dn public.dispatch_notes; qc jsonb; oid text; tax numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if k = 'invoice' then
    select * into i from public.invoices where id = doc_id;
    if i.id is null then raise exception 'Document not found'; end if;
    pid := i.partner_id; oid := i.order_id; select * into o from public.orders where id = i.order_id;
    d := jsonb_build_object('number', i.id, 'date', i.issued_on, 'order_id', i.order_id, 'supply_state', i.supply_state, 'taxable', i.taxable, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst, 'total', i.total, 'discount', o.discount, 'ref', o.id);
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', l.name, 'hsn', coalesce(s.hsn,'340130'), 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls
      from public.invoice_lines l left join public.skus s on s.sku = l.sku where l.invoice_id = i.id;
  elsif k in ('po','proforma','challan') then
    select * into o from public.orders where id = doc_id;
    if o.id is null then raise exception 'Document not found'; end if;
    pid := o.partner_id; oid := o.id;
    d := jsonb_build_object('number', case k when 'challan' then 'DC-' || o.id else o.id end, 'date', o.created_at::date, 'status', o.status, 'taxable', o.taxable, 'discount', o.discount, 'net', o.net, 'gst', o.gst, 'total', o.total, 'eta_from', o.eta_from, 'eta_to', o.eta_to, 'applied', coalesce(o.applied, '[]'::jsonb), 'order_id', o.id);
    if k = 'challan' then
      select * into dn from public.dispatch_notes where order_id = o.id order by dispatched_at desc limit 1;
      if dn.id is null then raise exception 'This order has not been dispatched yet'; end if;
      d := d || jsonb_build_object('date', dn.dispatched_at::date, 'vehicle', dn.vehicle, 'lr_no', dn.lr_no, 'batch_ref', dn.batch_ref);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', s.name, 'hsn', coalesce(s.hsn,'340130'), 'cartons', l.cartons, 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls
      from public.order_lines l join public.skus s on s.sku = l.sku where l.order_id = o.id;
  else raise exception 'Unknown document'; end if;
  if not (public.is_staff() or pid = public.my_partner()) then raise exception 'Document not found'; end if;
  select jsonb_object_agg(key, value) into co from public.company_profile;
  select to_jsonb(b) into cbr from public.issuer_branding b where owner_id = 'COMPANY';
  select to_jsonb(b) into br from public.issuer_branding b where owner_id = pid;
  select jsonb_build_object('id', p.id, 'type', p.type_code, 'name', p.name, 'contact', p.contact_name, 'phone', p.phone, 'email', p.email, 'gstin', p.gstin, 'address', p.address, 'state', p.state, 'district', p.district) into pa from public.partners p where p.id = pid;
  select coalesce((e ->> 'days')::int, 0) into credit_days from public.partners p, lateral (select value -> p.credit_level as e from public.settings where key = 'credit_ladder') x where p.id = pid;
  if (d ->> 'batch_ref') is not null then select to_jsonb(q) into qc from public.batch_qc_cache q where q.batch_ref = d ->> 'batch_ref'; end if;
  return jsonb_build_object('kind', k, 'company', coalesce(co, '{}'::jsonb) || coalesce(cbr, '{}'::jsonb), 'partner', pa, 'doc', d, 'lines', ls, 'credit_days', coalesce(credit_days, 0),
    'partner_brand', coalesce(br, '{}'::jsonb), 'qc', coalesce(qc, 'null'::jsonb));
end $$;
revoke all on function public.trade_doc(text, text) from public, anon;
grant execute on function public.trade_doc(text, text) to authenticated;
