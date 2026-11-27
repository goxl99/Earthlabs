-- EarthLabs: bulk purchases from Excel that also add to raw-material / packaging stock.
-- Run once in the Supabase SQL editor (after db/accounts.sql). Admin only.
-- rows: [{exp_date, vendor, bill_no, description, category(raw_material|packaging), raw_material_id, qty, unit, rate, gst_amount, amount, paid_by, payment_mode, notes}]
-- Rows are grouped into one supplier bill per vendor + bill number (no bill number = one bill per row). Each bill is saved,
-- added to stock (receipt), sets the last purchase rate, and creates a linked expense under the chosen label.
create or replace function public.bulk_import_purchases(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g record; v_inv uuid; v_no text; v_vendor text; v_date date; v_lines jsonb; v_tot numeric; v_tax numeric; v_sub numeric;
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
      v_inv := save_supplier_invoice(jsonb_build_object('supplier', v_vendor, 'invoice_no', v_no, 'invoice_date', v_date, 'subtotal', v_sub, 'tax_amount', v_tax, 'total', v_tot, 'notes', 'Imported from Excel'), v_lines);
      lines_n := lines_n + post_invoice_to_stock(v_inv);
      perform save_expense(jsonb_build_object('exp_date', v_date, 'vendor', v_vendor, 'description', 'Purchase bill ' || v_no, 'category', coalesce(nullif(g.rws->0->>'category', ''), 'raw_material'),
        'amount', v_tot, 'gst_amount', v_tax, 'paid_by', coalesce(nullif(g.rws->0->>'paid_by', ''), 'Company'), 'payment_mode', coalesce(nullif(g.rws->0->>'payment_mode', ''), 'bank'),
        'supplier_invoice_id', v_inv, 'source', 'excel', 'notes', nullif(g.rws->0->>'notes', '')));
      n := n + 1;
    exception when others then
      bad := bad || jsonb_build_object('row', g.fo, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('bills', n, 'stock_lines', lines_n, 'failed', bad);
end $$;
revoke all on function public.bulk_import_purchases(jsonb) from public, anon;
grant execute on function public.bulk_import_purchases(jsonb) to authenticated;
