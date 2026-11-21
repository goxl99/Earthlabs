-- EPDMS 001: roles, profiles, audit trail
create type public.app_role as enum ('super_admin','sales','accounts','warehouse','dealer','distributor','vendor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'dealer',
  full_name text not null default '',
  phone text,
  partner_id text,
  vendor_id text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_partner_idx on public.profiles(partner_id);

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function public.my_partner() returns text
language sql stable security definer set search_path = public as $$
  select partner_id from public.profiles where id = auth.uid() and active
$$;
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'super_admin', false)
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('super_admin','sales','accounts','warehouse'), false)
$$;

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_role public.app_role,
  action text not null,
  table_name text not null,
  row_key text,
  old_row jsonb,
  new_row jsonb
);
create index audit_at_idx on public.audit_log(at desc);
create index audit_table_idx on public.audit_log(table_name, row_key);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := coalesce((to_jsonb(coalesce(new, old)) ->> tg_argv[0]), '');
  insert into public.audit_log(actor, actor_role, action, table_name, row_key, old_row, new_row)
  values (auth.uid(), public.my_role(), tg_op, tg_table_name, k,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_admin_write on public.profiles for all using (public.is_super()) with check (public.is_super());
create policy audit_read on public.audit_log for select using (public.is_super());
-- audit rows are written only by the trigger (security definer); nobody inserts directly

-- the first account becomes Super Admin; every later sign-up is inactive until approved
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, role, full_name, active)
  values (new.id,
          case when not exists (select 1 from public.profiles) then 'super_admin'::public.app_role else 'dealer'::public.app_role end,
          coalesce(new.raw_user_meta_data ->> 'full_name',''),
          not exists (select 1 from public.profiles));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- users must not promote themselves
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super() and (new.role is distinct from old.role or new.active is distinct from old.active
     or new.partner_id is distinct from old.partner_id or new.vendor_id is distinct from old.vendor_id) then
    raise exception 'Only Super Admin can change role, status or links';
  end if;
  return new;
end $$;
create trigger profiles_guard_t before update on public.profiles for each row execute function public.profiles_guard();
