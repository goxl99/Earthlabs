-- EPDMS 018b: restore the race-safe, one-time Super Admin bootstrap that migration 20261123000018 dropped.
-- 20261123000018 decided "first user" with "no profiles yet" and no row lock, so two simultaneous first sign-ups could both
-- become Super Admin, and the `bootstrap_open` switch from migration 006 stopped being closed. This keeps the auto-link behaviour
-- of 018 (an approved partner or active vendor e-mail is linked and activated) and puts the lock back. Additive and idempotent.
insert into public.settings(key,value) values ('bootstrap_open','true') on conflict (key) do nothing;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_ boolean; p record; v record; r public.app_role; act boolean := false; pid text; vid text;
begin
  select (value)::text = 'true' into open_ from public.settings where key = 'bootstrap_open' for update;   -- row lock: two sign-ups cannot both win
  if coalesce(open_, false) and not exists (select 1 from public.profiles where role = 'super_admin') then
    r := 'super_admin'; act := true;
    update public.settings set value = 'false' where key = 'bootstrap_open';
  else
    select id, type_code into p from public.partners where lower(email) = lower(new.email) and status <> 'Terminated' order by created_at limit 1;
    if found then
      pid := p.id; act := true;
      r := case when p.type_code = 'DST' then 'distributor'::public.app_role else 'dealer'::public.app_role end;
    else
      select id into v from public.vendors where lower(email) = lower(new.email) and status <> 'Suspended' order by created_at limit 1;
      if found then vid := v.id; act := true; r := 'vendor'; else r := 'dealer'; end if;
    end if;
  end if;
  insert into public.profiles(id, role, full_name, active, partner_id, vendor_id)
  values (new.id, r, coalesce(new.raw_user_meta_data ->> 'full_name',''), act, pid, vid);
  return new;
end $$;
-- A database that already has a Super Admin must not leave the bootstrap switch open.
update public.settings set value = 'false' where key = 'bootstrap_open' and exists (select 1 from public.profiles where role = 'super_admin');
