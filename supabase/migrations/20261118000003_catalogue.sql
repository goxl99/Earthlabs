-- EPDMS 003: SKUs, partner-wise access, SKU-wise margins, partner price
create table public.skus (
  sku text primary key,
  name text not null,
  category text not null,
  mrp numeric(10,2) not null check (mrp > 0),            -- MRP incl. GST
  pack_size int not null check (pack_size > 0),
  unit text not null default 'units / carton',
  moq int not null default 5,
  make_days int,                                         -- made-to-order days, null = default
  status text not null default 'draft' check (status in ('draft','active','retired')),
  restricted boolean not null default false,            -- true: only partners in sku_access may see it
  created_at timestamptz not null default now()
);
create table public.sku_access (
  sku text not null references public.skus(sku) on delete cascade,
  partner_id text not null references public.partners(id) on delete cascade,
  primary key (sku, partner_id)
);
create index sku_access_partner_idx on public.sku_access(partner_id);

create table public.margin_slabs (                        -- default slab by partner type and SKU group
  type_code text not null references public.partner_types(code),
  slab int not null check (slab in (0,1)),               -- 0 sachet-type, 1 bottle-type
  margin_pct numeric(5,2) not null check (margin_pct between 0 and 40),
  primary key (type_code, slab)
);
alter table public.skus add column slab int not null default 1 check (slab in (0,1));
create table public.sku_margins (                         -- per-SKU override
  sku text not null references public.skus(sku) on delete cascade,
  type_code text not null references public.partner_types(code),
  margin_pct numeric(5,2) not null check (margin_pct between 0 and 40),
  primary key (sku, type_code)
);

create table public.stock (
  sku text primary key references public.skus(sku) on delete cascade,
  available int not null default 0 check (available >= 0),
  reserved int not null default 0 check (reserved >= 0),
  reorder_level int not null default 0
);

alter table public.skus enable row level security;
alter table public.sku_access enable row level security;
alter table public.margin_slabs enable row level security;
alter table public.sku_margins enable row level security;
alter table public.stock enable row level security;

create or replace function public.sku_visible(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.skus k where k.sku = s and k.status = 'active'
         and (not k.restricted or exists (select 1 from public.sku_access a where a.sku = k.sku and a.partner_id = public.my_partner())))
$$;

create policy skus_read on public.skus for select using (public.is_staff() or public.sku_visible(sku));
create policy skus_write on public.skus for all using (public.is_super()) with check (public.is_super());
create policy access_read on public.sku_access for select using (public.is_staff() or partner_id = public.my_partner());
create policy access_write on public.sku_access for all using (public.is_super()) with check (public.is_super());
-- margins are commercial: staff only. Partners get their own price through my_unit_price().
create policy slabs_read on public.margin_slabs for select using (public.is_staff());
create policy slabs_write on public.margin_slabs for all using (public.is_super()) with check (public.is_super());
create policy margins_read on public.sku_margins for select using (public.is_staff());
create policy margins_write on public.sku_margins for all using (public.is_super()) with check (public.is_super());
create policy stock_read on public.stock for select using (public.is_staff());
create policy stock_write on public.stock for all using (public.my_role() in ('super_admin','warehouse')) with check (public.my_role() in ('super_admin','warehouse'));

create trigger audit_skus after insert or update or delete on public.skus for each row execute function public.audit_row('sku');
create trigger audit_sku_margins after insert or update or delete on public.sku_margins for each row execute function public.audit_row('sku');
create trigger audit_margin_slabs after update on public.margin_slabs for each row execute function public.audit_row('type_code');
create trigger audit_sku_access after insert or delete on public.sku_access for each row execute function public.audit_row('sku');

-- unit price ex-GST for the signed-in partner: MRP / 1.18 * (1 - margin)
create or replace function public.unit_price(p text, s text) returns numeric
language sql stable security definer set search_path = public as $$
  select round(k.mrp / 1.18 * (1 - coalesce(m.margin_pct, d.margin_pct, 0) / 100.0), 4)
  from public.skus k
  join public.partners pt on pt.id = p
  left join public.sku_margins m on m.sku = k.sku and m.type_code = pt.type_code
  left join public.margin_slabs d on d.type_code = pt.type_code and d.slab = k.slab
  where k.sku = s
$$;
revoke execute on function public.unit_price(text,text) from public, anon, authenticated;
create or replace function public.my_unit_price(s text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when public.sku_visible(s) then public.unit_price(public.my_partner(), s) end
$$;
grant execute on function public.my_unit_price(text) to authenticated;
