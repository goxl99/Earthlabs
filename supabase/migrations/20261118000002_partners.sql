-- EPDMS 002: partner types, applications, partners (permanent ID), territories, registration switches
create table public.partner_types (
  code text primary key check (code in ('DLR','DST','STK','MST','SST','INS')),
  name text not null,
  level int not null,
  registration_open boolean not null default false  -- Super Admin switch; only DLR and DST start open
);
insert into public.partner_types(code,name,level,registration_open) values
 ('DLR','Authorized Dealer',1,true),('DST','Authorized Distributor',2,true),
 ('STK','Circle Stockist',3,false),('MST','Circle Master Stockist',4,false),
 ('SST','Super Stockist',5,false),('INS','Institutional Partner',0,false);

create table public.id_counters (code text primary key, last int not null default 0);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  type_code text not null references public.partner_types(code),
  business_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  state text not null default 'Gujarat',
  district text not null,
  gstin text,
  answers jsonb not null default '{}',
  status text not null default 'Submitted' check (status in ('Submitted','More info needed','Field verification','Approved','Rejected')),
  reason text,
  partner_id text,
  created_at timestamptz not null default now()
);
create index applications_status_idx on public.applications(status, created_at desc);

create table public.partners (
  id text primary key,                       -- permanent Partner ID, e.g. ELP-DLR-0001
  type_code text not null references public.partner_types(code),
  name text not null,
  contact_name text,
  phone text,
  email text,
  state text not null default 'Gujarat',
  district text not null,
  gstin text,
  status text not null default 'Agreement Pending' check (status in ('Agreement Pending','Active','Suspended','Terminated')),
  exclusive boolean not null default false,
  credit_level int not null default 0,       -- 0 = pay and carry
  created_at timestamptz not null default now()
);
create index partners_type_idx on public.partners(type_code);
create index partners_district_idx on public.partners(state, district);

-- a partner ID is for life
create or replace function public.partners_id_lock() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id then raise exception 'Partner ID can never change'; end if;
  return new;
end $$;
create trigger partners_id_lock_t before update on public.partners for each row execute function public.partners_id_lock();

create or replace function public.next_partner_id(t text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.id_counters(code,last) values (t,1)
  on conflict (code) do update set last = public.id_counters.last + 1 returning last into n;
  return 'ELP-' || t || '-' || lpad(n::text, 4, '0');
end $$;
revoke execute on function public.next_partner_id(text) from public, anon, authenticated;

create table public.territory_claims (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  state text not null,
  district text not null,
  exclusive boolean not null default false,
  created_at timestamptz not null default now(),
  unique (partner_id, state, district)
);
-- two exclusive partners of the same type may not hold one district
create or replace function public.territory_conflict() returns trigger language plpgsql as $$
declare t text;
begin
  if new.exclusive then
    select type_code into t from public.partners where id = new.partner_id;
    if exists (select 1 from public.territory_claims c join public.partners p on p.id = c.partner_id
               where c.exclusive and c.state = new.state and c.district = new.district
                 and p.type_code = t and c.partner_id <> new.partner_id) then
      raise exception 'District % already has an exclusive % partner', new.district, t;
    end if;
  end if;
  return new;
end $$;
create trigger territory_conflict_t before insert or update on public.territory_claims for each row execute function public.territory_conflict();

alter table public.partner_types enable row level security;
alter table public.applications enable row level security;
alter table public.partners enable row level security;
alter table public.territory_claims enable row level security;
alter table public.id_counters enable row level security;

create policy ptypes_read on public.partner_types for select using (true);
create policy ptypes_write on public.partner_types for update using (public.is_super()) with check (public.is_super());
-- anyone may apply (public registration); only open types are accepted; only staff read applications
create policy apps_insert on public.applications for insert to anon, authenticated
  with check (status = 'Submitted' and partner_id is null and exists (select 1 from public.partner_types t where t.code = type_code and t.registration_open));
create policy apps_staff_read on public.applications for select using (public.is_staff());
create policy apps_staff_update on public.applications for update using (public.my_role() in ('super_admin','sales')) with check (public.my_role() in ('super_admin','sales'));
create policy partners_read on public.partners for select using (public.is_staff() or id = public.my_partner());
create policy partners_write on public.partners for all using (public.is_super()) with check (public.is_super());
create policy claims_read on public.territory_claims for select using (public.is_staff() or partner_id = public.my_partner());
create policy claims_write on public.territory_claims for all using (public.is_super()) with check (public.is_super());

create trigger audit_partners after insert or update or delete on public.partners for each row execute function public.audit_row('id');
create trigger audit_ptypes after update on public.partner_types for each row execute function public.audit_row('code');
create trigger audit_apps after update on public.applications for each row execute function public.audit_row('id');

-- Approve an application: only Super Admin, issues the permanent ID in one step
create or replace function public.approve_application(app uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a public.applications; pid text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve'; end if;
  select * into a from public.applications where id = app for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.partner_id is not null then return a.partner_id; end if;
  pid := public.next_partner_id(a.type_code);
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin)
  values (pid,a.type_code,a.business_name,a.contact_name,a.phone,a.email,a.state,a.district,a.gstin);
  update public.applications set status='Approved', partner_id=pid where id = app;
  return pid;
end $$;
revoke execute on function public.approve_application(uuid) from public, anon;
