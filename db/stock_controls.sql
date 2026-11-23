-- EarthLabs stock controls: correct wrong stock entries, undo a bill's stock, and block batch approval when raw material is short.
-- Run once in the Supabase SQL editor (project hgdltduqwayfepzuurke). Safe to re-run.

alter table public.raw_material_stock add column if not exists reverses_id uuid references public.raw_material_stock(id) on delete set null;
alter table public.raw_material_stock add column if not exists reversed_by uuid references public.raw_material_stock(id) on delete set null;
alter table public.raw_material_stock add column if not exists invoice_id uuid references public.supplier_invoices(id) on delete set null;

-- bills remember which stock entries they created (so they can be undone)
create or replace function public.post_invoice_to_stock(p_invoice uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare i supplier_invoices; l record; v_n integer := 0;
begin
  if coalesce((select app_role())::text, '') not in ('admin','qc_officer') then raise exception 'Only admin or QA/QC can add stock'; end if;
  select * into i from supplier_invoices where id = p_invoice for update;
  if not found then raise exception 'Bill not found'; end if;
  if i.stock_posted then raise exception 'This bill has already been added to stock'; end if;
  for l in select sl.*, rm.unit as base_unit from supplier_invoice_lines sl join raw_materials rm on rm.id = sl.raw_material_id
           where sl.invoice_id = p_invoice and sl.qty > 0 loop
    insert into raw_material_stock(raw_material_id, movement, qty, supplier, note, invoice_id)
      values (l.raw_material_id, 'receipt', round(convert_qty(l.qty, coalesce(l.unit, l.base_unit), l.base_unit), 3), i.supplier,
              'Bill ' || coalesce(i.invoice_no, '(no number)'), p_invoice);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'No lines are matched to an item with a quantity'; end if;
  update supplier_invoices set stock_posted = true where id = p_invoice;
  return v_n;
end $function$;

-- reverse one stock entry (admin). Batch usage is handled by the batch itself.
create or replace function public.reverse_stock_entry(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o raw_material_stock; v_new uuid;
begin
  if coalesce((select app_role())::text, '') <> 'admin' then raise exception 'Only admin can correct stock entries'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into o from raw_material_stock where id = p_id for update;
  if not found then raise exception 'Stock entry not found'; end if;
  if o.batch_id is not null then raise exception 'Entries made by a batch are corrected on the batch, not here'; end if;
  if o.reverses_id is not null then raise exception 'This entry is already a correction'; end if;
  if o.reversed_by is not null then raise exception 'This entry has already been corrected'; end if;
  insert into raw_material_stock(raw_material_id, movement, qty, note, reverses_id, invoice_id, supplier)
    values (o.raw_material_id, 'adjustment', -o.qty, 'Reversed entry: ' || btrim(p_reason), o.id, o.invoice_id, o.supplier) returning id into v_new;
  update raw_material_stock set reversed_by = v_new where id = o.id;
  if o.invoice_id is not null and not exists (select 1 from raw_material_stock where invoice_id = o.invoice_id and movement = 'receipt' and reversed_by is null) then
    update supplier_invoices set stock_posted = false where id = o.invoice_id;
  end if;
  return v_new;
end $$;

-- fix the quantity of one entry (p_new_qty is in the item's own unit)
create or replace function public.correct_stock_entry(p_id uuid, p_new_qty numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o raw_material_stock; v_new uuid;
begin
  if coalesce((select app_role())::text, '') <> 'admin' then raise exception 'Only admin can correct stock entries'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into o from raw_material_stock where id = p_id for update;
  if not found then raise exception 'Stock entry not found'; end if;
  if o.batch_id is not null then raise exception 'Entries made by a batch are corrected on the batch, not here'; end if;
  if o.reverses_id is not null then raise exception 'This entry is already a correction'; end if;
  if o.reversed_by is not null then raise exception 'This entry has already been corrected'; end if;
  if p_new_qty is null or round(p_new_qty, 3) = o.qty then raise exception 'Enter a different quantity'; end if;
  insert into raw_material_stock(raw_material_id, movement, qty, note, reverses_id, invoice_id, supplier)
    values (o.raw_material_id, 'adjustment', round(p_new_qty, 3) - o.qty, 'Corrected ' || o.qty || ' to ' || round(p_new_qty, 3) || ': ' || btrim(p_reason), o.id, o.invoice_id, o.supplier) returning id into v_new;
  update raw_material_stock set reversed_by = v_new where id = o.id;
  return v_new;
end $$;

-- take a bill back out of stock (reverses every receipt it created)
create or replace function public.unpost_invoice_from_stock(p_invoice uuid, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare i supplier_invoices; r raw_material_stock; v_new uuid; n int := 0;
begin
  if coalesce((select app_role())::text, '') <> 'admin' then raise exception 'Only admin can undo stock entries'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into i from supplier_invoices where id = p_invoice for update;
  if not found then raise exception 'Bill not found'; end if;
  for r in select * from raw_material_stock where movement = 'receipt' and reversed_by is null and batch_id is null
           and (invoice_id = p_invoice or (invoice_id is null and note = 'Bill ' || coalesce(i.invoice_no, '(no number)') and supplier is not distinct from i.supplier)) loop
    insert into raw_material_stock(raw_material_id, movement, qty, note, reverses_id, invoice_id, supplier)
      values (r.raw_material_id, 'adjustment', -r.qty, 'Bill ' || coalesce(i.invoice_no, '(no number)') || ' taken out of stock: ' || btrim(p_reason), r.id, p_invoice, r.supplier) returning id into v_new;
    update raw_material_stock set reversed_by = v_new where id = r.id;
    n := n + 1;
  end loop;
  update supplier_invoices set stock_posted = false where id = p_invoice;
  return n;
end $$;

-- is there enough raw material for this batch?  short > 0 means NOT enough.
-- Stock is deducted when a batch is sent for approval, so for those batches a negative balance means the stock was not there.
create or replace function public.batch_stock_check(p_batch uuid)
returns table(raw_material_id uuid, name text, unit text, needed numeric, on_hand numeric, short numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_consumed boolean;
begin
  v_consumed := exists (select 1 from raw_material_stock s where s.batch_id = p_batch and s.movement = 'consumption' and s.note like 'Batch %');
  if v_consumed then
    return query
      select rm.id, rm.name, rm.unit, -sum(s.qty), coalesce(lv.on_hand, 0), least(-sum(s.qty), greatest(0, -coalesce(lv.on_hand, 0)))
      from raw_material_stock s join raw_materials rm on rm.id = s.raw_material_id left join raw_material_levels lv on lv.raw_material_id = rm.id
      where s.batch_id = p_batch and s.note like 'Batch %' and s.movement in ('consumption', 'adjustment')
      group by rm.id, rm.name, rm.unit, lv.on_hand having -sum(s.qty) > 0;
  else
    return query
      select rm.id, rm.name, rm.unit, n.qty, coalesce(lv.on_hand, 0), greatest(0, n.qty - coalesce(lv.on_hand, 0))
      from (select bm.raw_material_id as rid, sum(bm.actual_qty * (case when bm.unit in ('mL','g') then 1 else 1000 end)) as base from batch_materials bm where bm.batch_id = p_batch and bm.actual_qty > 0 group by bm.raw_material_id) x
      join raw_materials rm on rm.id = x.rid
      cross join lateral (select x.base / (case when rm.unit in ('mL','g') then 1 else 1000 end) as qty) n
      left join raw_material_levels lv on lv.raw_material_id = rm.id;
  end if;
end $$;

-- approval is blocked while any raw material used by the batch is short
create or replace function public._review_batch_impl(p_batch uuid, p_decision text, p_remarks text DEFAULT NULL::text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare b public.batches%rowtype; n int; code text; short_txt text;
begin
  perform set_config('app.rpc','1',true);
  if public.app_role() not in ('qc_officer','admin') then raise exception 'Only Admin or QA/QC can approve batches'; end if;
  select * into b from public.batches where id = p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  if b.status <> 'pending_approval' then raise exception 'Batch is not pending approval'; end if;
  if b.operator_id = auth.uid() then raise exception 'You cannot review your own batch'; end if;
  if p_decision not in ('approve','reject','rework') then raise exception 'Invalid decision'; end if;
  if p_decision in ('reject','rework') and coalesce(btrim(p_remarks),'') = '' then raise exception 'Remarks are required for rejection or rework'; end if;
  if p_decision = 'approve' then
    select string_agg(c.name || ' (short by ' || round(c.short, 3) || ' ' || c.unit || ')', ', ') into short_txt from public.batch_stock_check(p_batch) c where c.short > 0.0005;
    if short_txt is not null then raise exception 'Cannot approve: not enough raw material in stock: %. Record the purchase bill or correct the stock first.', short_txt; end if;
  end if;

  insert into public.batch_reviews(batch_id, officer_id, decision, remarks) values (p_batch, auth.uid(), p_decision, p_remarks);

  if p_decision = 'approve' then
    insert into public.batch_code_counters(code_date, last_seq) values (b.mfg_date, 1)
      on conflict (code_date) do update set last_seq = public.batch_code_counters.last_seq + 1 returning last_seq into n;
    code := 'EL-' || to_char(b.mfg_date,'YYYYMMDD') || '-' || lpad(n::text, 3, '0');
    update public.batches set status='approved', batch_code=code, approved_by=auth.uid(), approved_at=now(), locked=true, officer_remarks=p_remarks where id = p_batch;
    perform public.notify('batch_approved', b.temp_ref||' approved as '||code||' – released for filling', p_batch, null);
    return code;
  elsif p_decision = 'reject' then
    update public.batches set status='rejected', officer_remarks=p_remarks where id = p_batch;
    perform public.notify('batch_rejected', b.temp_ref||' rejected: '||p_remarks, p_batch, null);
  else
    update public.batches set status='rework', officer_remarks=p_remarks where id = p_batch;
    perform public.notify('batch_rework', b.temp_ref||' sent back for rework: '||p_remarks, p_batch, null);
  end if;
  return null;
end $function$;

-- Excel / scanned purchases: also keep the bill file with the bill and the expense
create or replace function public.bulk_import_purchases(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g record; v_inv uuid; v_no text; v_vendor text; v_date date; v_lines jsonb; v_tot numeric; v_tax numeric; v_sub numeric; v_file text;
  n int := 0; lines_n int := 0; bad jsonb := '[]'::jsonb;
begin
  if not acct_ok() then raise exception 'Only admin can import purchases'; end if;
  for g in
    select min(ord) as fo, jsonb_agg(v order by ord) as rws
    from (select value as v, ord from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(value, ord)) r
    group by case when nullif(trim(coalesce(v->>'bill_no', '')), '') is null then 'row' || ord::text
                  else lower(trim(coalesce(v->>'vendor', ''))) || '|' || lower(trim(v->>'bill_no')) || '|' || coalesce(v->>'category', '') end
    order by min(ord)
  loop
    begin
      v_vendor := coalesce(nullif(trim(g.rws->0->>'vendor'), ''), 'Excel upload');
      v_date := coalesce(nullif(g.rws->0->>'exp_date', '')::date, current_date);
      v_file := nullif(g.rws->0->>'file_path', '');
      v_no := nullif(trim(coalesce(g.rws->0->>'bill_no', '')), '');
      if v_no is null then v_no := 'XL-' || to_char(v_date, 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 5); end if;
      if exists (select 1 from jsonb_array_elements(g.rws) x where nullif(x->>'raw_material_id', '') is null or coalesce(nullif(x->>'qty', '')::numeric, 0) <= 0 or coalesce(nullif(x->>'amount', '')::numeric, 0) <= 0) then
        raise exception 'Every stock row needs an item, a quantity and an amount';
      end if;
      select jsonb_agg(jsonb_build_object('raw_material_id', x->>'raw_material_id', 'description', coalesce(nullif(x->>'description', ''), 'Excel row'), 'qty', (x->>'qty')::numeric, 'unit', nullif(x->>'unit', ''),
               'rate', coalesce(nullif(x->>'rate', '')::numeric, round(((x->>'amount')::numeric - coalesce(nullif(x->>'gst_amount', '')::numeric, 0)) / (x->>'qty')::numeric, 4)), 'amount', (x->>'amount')::numeric - coalesce(nullif(x->>'gst_amount', '')::numeric, 0))),
             sum((x->>'amount')::numeric), sum(coalesce(nullif(x->>'gst_amount', '')::numeric, 0))
        into v_lines, v_tot, v_tax from jsonb_array_elements(g.rws) x;
      v_sub := v_tot - v_tax;
      v_inv := save_supplier_invoice(jsonb_build_object('supplier', v_vendor, 'invoice_no', v_no, 'invoice_date', v_date, 'subtotal', v_sub, 'tax_amount', v_tax, 'total', v_tot, 'file_path', v_file, 'notes', 'Imported from Excel / scan'), v_lines);
      lines_n := lines_n + post_invoice_to_stock(v_inv);
      perform save_expense(jsonb_build_object('exp_date', v_date, 'vendor', v_vendor, 'description', 'Purchase bill ' || v_no, 'category', coalesce(nullif(g.rws->0->>'category', ''), 'raw_material'),
        'amount', v_tot, 'gst_amount', v_tax, 'paid_by', coalesce(nullif(g.rws->0->>'paid_by', ''), 'Company'), 'payment_mode', coalesce(nullif(g.rws->0->>'payment_mode', ''), 'bank'),
        'supplier_invoice_id', v_inv, 'file_path', v_file, 'source', coalesce(nullif(g.rws->0->>'source', ''), 'excel'), 'notes', nullif(g.rws->0->>'notes', '')));
      n := n + 1;
    exception when others then
      bad := bad || jsonb_build_object('row', g.fo, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('bills', n, 'stock_lines', lines_n, 'failed', bad);
end $$;

revoke all on function public.reverse_stock_entry(uuid,text), public.correct_stock_entry(uuid,numeric,text), public.unpost_invoice_from_stock(uuid,text), public.batch_stock_check(uuid) from public, anon;
grant execute on function public.reverse_stock_entry(uuid,text), public.correct_stock_entry(uuid,numeric,text), public.unpost_invoice_from_stock(uuid,text), public.batch_stock_check(uuid) to authenticated;
