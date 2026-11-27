-- Batch database.  Average / lowest / highest purchase rate per item, from every saved bill line.
-- Read-only view; the Raw Material Stock table uses it for the "Average rate" column.
create or replace view public.v_rm_rate_stats with (security_invoker = true) as
with x as (
  select l.raw_material_id, rm.unit as base_unit, l.qty, l.rate,
         safe_conv(1, coalesce(nullif(trim(l.unit), ''), rm.unit), rm.unit) as c      -- 1 bill unit = c base units
  from supplier_invoice_lines l
  join raw_materials rm on rm.id = l.raw_material_id
  where l.raw_material_id is not null and l.rate is not null and l.rate > 0
)
select raw_material_id, base_unit as unit, count(*)::int as bills,
       round(case when sum(coalesce(qty, 0)) > 0 then sum(rate * coalesce(qty, 0)) / sum(coalesce(qty, 0) * c) else avg(rate / c) end, 4) as avg_rate,   -- weighted by quantity bought
       round(min(rate / c), 4) as min_rate, round(max(rate / c), 4) as max_rate
from x where c is not null and c > 0
group by raw_material_id, base_unit;
grant select on public.v_rm_rate_stats to authenticated;
