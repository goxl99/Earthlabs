-- EPDMS 020: fixes found in the end-to-end test.
-- 1) the old uuid-only track_application overload made the new text one ambiguous for the portal
drop function if exists public.track_application(uuid, text);
-- 2) application_mail: real line breaks in the progress block (applied in the database; see the function there)
-- 3) a login created by Super Admin is confirmed just after it is inserted, so link the profile when the e-mail becomes confirmed
create or replace function public.link_confirmed_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; v record;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    if exists (select 1 from public.profiles where id = new.id and partner_id is null and vendor_id is null and active = false and role in ('dealer','distributor')) then
      select id, type_code into p from public.partners where lower(email) = lower(new.email) and status <> 'Terminated' order by created_at limit 1;
      if found then
        update public.profiles set partner_id = p.id, active = true, role = case when p.type_code = 'DST' then 'distributor'::public.app_role else 'dealer'::public.app_role end where id = new.id;
      else
        select id into v from public.vendors where lower(email) = lower(new.email) and status <> 'Suspended' order by created_at limit 1;
        if found then update public.profiles set vendor_id = v.id, active = true, role = 'vendor' where id = new.id; end if;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users for each row execute function public.link_confirmed_user();
