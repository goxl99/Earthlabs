-- Fix: actual mixing % ignored units (e.g. 375 mL counted the same as 17.3 L), so percentages and deviations were wrong.
-- Quantities are now converted to a common base (g / mL) before the percentage is worked out.
create or replace function public.mix_base(q numeric, u text) returns numeric language sql immutable as $$
  select q * case when u in ('mL','g') then 1 else 1000 end $$;

do $mig$
declare src text; fixed text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = '_submit_batch_impl';
  fixed := replace(src, 'select sum(actual_qty) into tot from public.batch_materials where batch_id = p_batch;',
                        'select sum(public.mix_base(actual_qty, unit)) into tot from public.batch_materials where batch_id = p_batch;');
  fixed := replace(fixed, 'select m.id, m.raw_material_id, m.actual_qty, m.required_pct, rm.name from',
                          'select m.id, m.raw_material_id, public.mix_base(m.actual_qty, m.unit) as actual_qty, m.required_pct, rm.name from');
  if fixed = src or position('mix_base(m.actual_qty' in fixed) = 0 or position('sum(public.mix_base' in fixed) = 0 then
    raise exception 'Could not patch _submit_batch_impl';
  end if;
  execute fixed;
end $mig$;

-- Recalculate batches that are waiting for approval so QA/QC sees the right figures.
do $fix$
declare b record; tot numeric; r record; tol numeric; pct numeric; devs jsonb; mixdev boolean;
begin
  perform set_config('app.rpc', '1', true);
  for b in select id, param_deviations from public.batches where status = 'pending_approval' loop -- approved batches are left untouched
    select sum(public.mix_base(actual_qty, unit)) into tot from public.batch_materials where batch_id = b.id;
    if coalesce(tot, 0) <= 0 then continue; end if;
    devs := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(coalesce(b.param_deviations, '[]'::jsonb)) x where x->>'parameter' not like 'Mix:%');
    mixdev := false;
    for r in select m.id, m.actual_qty, m.unit, m.required_pct, m.raw_material_id, rm.name from public.batch_materials m
             join public.raw_materials rm on rm.id = m.raw_material_id where m.batch_id = b.id loop
      pct := round(public.mix_base(r.actual_qty, r.unit) / tot * 100, 3);
      select coalesce((select tolerance_pct from public.formulations f where f.product_id = (select product_id from public.batches where id = b.id) and f.raw_material_id = r.raw_material_id), 0.5) into tol;
      update public.batch_materials set actual_pct = pct, deviation = (r.required_pct is not null and abs(pct - r.required_pct) > tol) where id = r.id;
      if r.required_pct is not null and abs(pct - r.required_pct) > tol then
        mixdev := true;
        devs := devs || jsonb_build_object('parameter', 'Mix: ' || r.name, 'value', pct, 'limit', r.required_pct || ' ±' || tol);
      end if;
    end loop;
    update public.batches set param_deviations = devs, mix_deviation = mixdev where id = b.id;
  end loop;
end $fix$;
