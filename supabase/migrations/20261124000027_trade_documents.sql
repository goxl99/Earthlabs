-- Build 12: printable Tax Invoice and Purchase Order. One read-only function returns everything a document needs.
-- Staff may open any document; a partner may open only their own. Company details are staff-only in the table, so they come through here.
create or replace function public.trade_doc(k text, doc_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid text; d jsonb; ls jsonb; o public.orders; i public.invoices; co jsonb; pa jsonb; credit_days int; stt text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if k = 'invoice' then
    select * into i from public.invoices where id = doc_id;
    if i.id is null then raise exception 'Document not found'; end if;
    pid := i.partner_id; select * into o from public.orders where id = i.order_id;
    d := jsonb_build_object('number', i.id, 'date', i.issued_on, 'order_id', i.order_id, 'supply_state', i.supply_state, 'taxable', i.taxable, 'cgst', i.cgst, 'sgst', i.sgst, 'igst', i.igst, 'total', i.total, 'discount', o.discount);
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', l.name, 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls from public.invoice_lines l where l.invoice_id = i.id;
  elsif k = 'po' then
    select * into o from public.orders where id = doc_id;
    if o.id is null then raise exception 'Document not found'; end if;
    pid := o.partner_id;
    d := jsonb_build_object('number', o.id, 'date', o.created_at::date, 'status', o.status, 'taxable', o.taxable, 'discount', o.discount, 'net', o.net, 'gst', o.gst, 'total', o.total, 'eta_from', o.eta_from, 'eta_to', o.eta_to, 'applied', coalesce(o.applied, '[]'::jsonb));
    select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'name', s.name, 'cartons', l.cartons, 'units', l.units, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sku), '[]') into ls
      from public.order_lines l join public.skus s on s.sku = l.sku where l.order_id = o.id;
  else raise exception 'Unknown document'; end if;
  if not (public.is_staff() or pid = public.my_partner()) then raise exception 'Document not found'; end if;
  select jsonb_object_agg(key, value) into co from public.company_profile;
  select jsonb_build_object('id', p.id, 'type', p.type_code, 'name', p.name, 'contact', p.contact_name, 'phone', p.phone, 'email', p.email, 'gstin', p.gstin, 'address', p.address, 'state', p.state, 'district', p.district) into pa from public.partners p where p.id = pid;
  select coalesce((e ->> 'days')::int, 0) into credit_days from public.partners p, lateral (select value -> p.credit_level as e from public.settings where key = 'credit_ladder') x where p.id = pid;
  return jsonb_build_object('kind', k, 'company', coalesce(co, '{}'::jsonb), 'partner', pa, 'doc', d, 'lines', ls, 'credit_days', coalesce(credit_days, 0));
end $$;
revoke all on function public.trade_doc(text, text) from public, anon;
grant execute on function public.trade_doc(text, text) to authenticated;
