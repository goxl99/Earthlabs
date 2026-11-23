-- Raw material inventory for EarthLabs Batch Management (Supabase project hgdltduqwayfepzuurke).
-- NOT auto-applied: run once in Supabase SQL editor (or via migration). The app degrades gracefully until then.
-- All quantities are stored in the raw material's own base unit (mL or g).

create table if not exists public.raw_material_stock (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references public.raw_materials(id),
  movement text not null check (movement in ('receipt','adjustment','consumption')),
  qty numeric not null,
  lot_no text,
  supplier text,
  expiry_date date,
  batch_id uuid references public.batches(id),
  note text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (movement <> 'receipt' or qty > 0),
  check (movement <> 'consumption' or qty < 0)
);
create index if not exists raw_material_stock_rm_idx on public.raw_material_stock(raw_material_id);
create index if not exists raw_material_stock_batch_idx on public.raw_material_stock(batch_id);
alter table public.raw_material_stock enable row level security;

create policy read_rm_stock on public.raw_material_stock
  for select using ((select app_role()) is not null);
create policy write_rm_stock_ins on public.raw_material_stock
  for insert with check ((select app_role()) in ('admin','qc_officer'));
create policy admin_rm_stock_upd on public.raw_material_stock
  for update using ((select app_role()) = 'admin') with check ((select app_role()) = 'admin');
create policy admin_rm_stock_del on public.raw_material_stock
  for delete using ((select app_role()) = 'admin');

create or replace view public.raw_material_levels
with (security_invoker = true) as
select rm.id as raw_material_id, rm.name, rm.unit,
       coalesce(sum(s.qty), 0) as on_hand,
       max(s.created_at) as last_movement
from public.raw_materials rm
left join public.raw_material_stock s on s.raw_material_id = rm.id
where rm.active
group by rm.id, rm.name, rm.unit;

-- Deduct actual consumption when a batch is submitted; reverse it if sent back for rework or rejected.
create or replace function public.consume_stock_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending_approval' and old.status is distinct from 'pending_approval' then
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
    select bm.raw_material_id, 'consumption',
           -sum(bm.actual_qty * (case when bm.unit in ('mL','g') then 1 else 1000 end)
                              / (case when rm.unit in ('mL','g') then 1 else 1000 end)),
           new.id, 'Batch ' || new.temp_ref
    from batch_materials bm join raw_materials rm on rm.id = bm.raw_material_id
    where bm.batch_id = new.id and bm.actual_qty > 0
    group by bm.raw_material_id;
  elsif old.status = 'pending_approval' and new.status in ('rework','rejected') then
    insert into raw_material_stock(raw_material_id, movement, qty, batch_id, note)
    select s.raw_material_id, 'adjustment', -sum(s.qty), new.id,
           'Reversal: batch ' || new.temp_ref || ' ' || new.status
    from raw_material_stock s
    where s.batch_id = new.id
    group by s.raw_material_id
    having sum(s.qty) < 0;
  end if;
  return new;
end $$;

drop trigger if exists trg_consume_stock on public.batches;
create trigger trg_consume_stock after update of status on public.batches
  for each row execute function public.consume_stock_on_status();
