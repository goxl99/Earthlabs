-- EPDMS 005: public application tracking, application workflow guards, partner profile view helpers
-- Tracking by reference + email only; returns status and a safe message, never other applicants' data.
create or replace function public.track_application(ref uuid, mail text)
returns table(status text, business_name text, type_code text, reason text, partner_id text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.status, a.business_name, a.type_code,
         case when a.status in ('More info needed','Rejected') then a.reason end,
         a.partner_id, a.created_at
  from public.applications a where a.id = ref and lower(a.email) = lower(mail)
$$;
grant execute on function public.track_application(uuid, text) to anon, authenticated;

-- Anyone can submit, but we need the new reference back without letting anon read the table.
create or replace function public.submit_application(t text, biz text, contact text, ph text, mail text, st text, dist text, gst text, ans jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not exists (select 1 from public.partner_types where code = t and registration_open) then
    raise exception 'Registration for this partner type is not open';
  end if;
  if length(trim(biz)) < 2 or length(trim(ph)) < 8 or position('@' in mail) < 2 then
    raise exception 'Please fill business name, phone and a valid e-mail';
  end if;
  if exists (select 1 from public.applications a where lower(a.email) = lower(mail) and a.status in ('Submitted','More info needed','Field verification') and a.created_at > now() - interval '1 day' and a.type_code = t) then
    raise exception 'You already have an application in progress';
  end if;
  insert into public.applications(type_code,business_name,contact_name,phone,email,state,district,gstin,answers)
  values (t, trim(biz), trim(contact), trim(ph), trim(mail), coalesce(nullif(st,''),'Gujarat'), dist, nullif(gst,''), coalesce(ans,'{}'))
  returning applications.id into id;
  return id;
end $$;
grant execute on function public.submit_application(text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
-- direct inserts by anon are no longer needed
drop policy if exists apps_insert on public.applications;

-- Workflow: a reason is required to reject or ask for more information; nothing leaves Approved/Rejected
create or replace function public.applications_guard() returns trigger language plpgsql as $$
begin
  if old.status in ('Approved','Rejected') and new.status is distinct from old.status then
    raise exception 'A finished application cannot change status';
  end if;
  if new.status in ('Rejected','More info needed') and coalesce(trim(new.reason),'') = '' then
    raise exception 'A reason is required';
  end if;
  if new.status = 'Approved' and old.status <> 'Approved' and current_setting('epdms.approving', true) is distinct from 'on' then
    raise exception 'Approve through approve_application() so the Partner ID is issued';
  end if;
  return new;
end $$;
create trigger applications_guard_t before update on public.applications for each row execute function public.applications_guard();

create or replace function public.approve_application(app uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a public.applications; pid text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve'; end if;
  select * into a from public.applications where id = app for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.partner_id is not null then return a.partner_id; end if;
  if a.status = 'Rejected' then raise exception 'A rejected application cannot be approved'; end if;
  perform set_config('epdms.approving','on',true);
  pid := public.next_partner_id(a.type_code);
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin)
  values (pid,a.type_code,a.business_name,a.contact_name,a.phone,a.email,a.state,a.district,a.gstin);
  update public.applications set status='Approved', partner_id=pid where id = app;
  return pid;
end $$;
revoke execute on function public.approve_application(uuid) from public, anon;

-- Super Admin links a login to a partner when the application is approved
create or replace function public.link_user_to_partner(uid uuid, pid text) returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can link users'; end if;
  select type_code into t from public.partners where id = pid;
  if t is null then raise exception 'Partner not found'; end if;
  update public.profiles set partner_id = pid, active = true,
    role = case when t = 'DST' then 'distributor'::public.app_role else 'dealer'::public.app_role end
  where id = uid;
end $$;
revoke execute on function public.link_user_to_partner(uuid,text) from public, anon;
