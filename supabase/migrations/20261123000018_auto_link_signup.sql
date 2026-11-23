-- EPDMS 018: a person who signs up with the e-mail of an approved partner or active vendor is linked and activated at once.
-- Everyone else still waits for Super Admin. Also links logins that were created earlier but never linked.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean; p record; v record; r public.app_role; act boolean := false; pid text; vid text;
begin
  first_user := not exists (select 1 from public.profiles);
  if first_user then r := 'super_admin'; act := true;
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

do $$ declare u record; p record; v record; begin
  for u in select pr.id, au.email from public.profiles pr join auth.users au on au.id = pr.id
           where pr.partner_id is null and pr.vendor_id is null and pr.role in ('dealer','distributor') loop
    select id, type_code into p from public.partners where lower(email) = lower(u.email) limit 1;
    if found then
      update public.profiles set partner_id = p.id, active = true, role = case when p.type_code = 'DST' then 'distributor'::public.app_role else 'dealer'::public.app_role end where id = u.id;
    else
      select id into v from public.vendors where lower(email) = lower(u.email) limit 1;
      if found then update public.profiles set vendor_id = v.id, active = true, role = 'vendor' where id = u.id; end if;
    end if;
  end loop;
end $$;
