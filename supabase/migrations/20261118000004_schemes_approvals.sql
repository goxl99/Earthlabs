-- EPDMS 004: partner-wise schemes (hidden until disclosed) and the approvals centre
create table public.schemes (
  id text primary key,
  name text not null,
  description text not null default '',
  kind text not null check (kind in ('pct','flat','free','kit')),
  value numeric(10,2) not null default 0,
  buy int, get int,
  min_cartons int not null default 0,
  min_value numeric(12,2) not null default 0,
  first_order_only boolean not null default false,
  stackable boolean not null default true,
  skus text[],                                  -- null = all products
  audience_mode text not null default 'all' check (audience_mode in ('all','types','partners')),
  audience_types text[] not null default '{}',
  audience_partners text[] not null default '{}',
  valid_from date not null,
  valid_to date not null check (valid_to >= valid_from),
  budget numeric(12,2) not null default 0,
  active boolean not null default false,
  disclosed boolean not null default false,     -- partners see it only when true
  proposed_by uuid,
  created_at timestamptz not null default now()
);
create index schemes_live_idx on public.schemes(active, disclosed, valid_to);
alter table public.schemes enable row level security;

create or replace function public.scheme_for_me(s public.schemes) returns boolean
language sql stable security definer set search_path = public as $$
  select s.active and s.disclosed and current_date between s.valid_from and s.valid_to and (
    s.audience_mode = 'all'
    or (s.audience_mode = 'types' and (select type_code from public.partners where id = public.my_partner()) = any (s.audience_types))
    or (s.audience_mode = 'partners' and public.my_partner() = any (s.audience_partners)))
$$;
create policy schemes_read on public.schemes for select using (public.is_staff() or public.scheme_for_me(schemes));
create policy schemes_write on public.schemes for all using (public.is_super()) with check (public.is_super());
create trigger audit_schemes after insert or update or delete on public.schemes for each row execute function public.audit_row('id');

-- who may disclose schemes besides Super Admin (set by Super Admin)
create table public.settings (key text primary key, value jsonb not null);
insert into public.settings(key,value) values
 ('scheme_disclosers','["sales"]'),
 ('lead_time','{"confirm":1,"dispatch":1,"make":7,"transit_in":2,"transit_out":5,"show":true}'),
 ('pay_and_carry','{"enabled":true,"advance_pct":100}');
alter table public.settings enable row level security;
create policy settings_read on public.settings for select using (public.is_staff() or key = 'lead_time');
create policy settings_write on public.settings for all using (public.is_super()) with check (public.is_super());
create trigger audit_settings after update on public.settings for each row execute function public.audit_row('key');

create table public.change_requests (                  -- non-super users propose; Super Admin decides
  id bigint generated always as identity primary key,
  kind text not null,                                  -- sku_add, sku_retire, sku_access, scheme_new, scheme_disclose, credit_level, release_order ...
  payload jsonb not null,
  summary text not null,
  requested_by uuid not null default auth.uid(),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index change_requests_status_idx on public.change_requests(status, created_at desc);
alter table public.change_requests enable row level security;
create policy cr_insert on public.change_requests for insert with check (public.is_staff() and status = 'Pending' and requested_by = auth.uid());
create policy cr_read on public.change_requests for select using (public.is_super() or requested_by = auth.uid());
create policy cr_decide on public.change_requests for update using (public.is_super()) with check (public.is_super());
create trigger audit_cr after insert or update on public.change_requests for each row execute function public.audit_row('id');
