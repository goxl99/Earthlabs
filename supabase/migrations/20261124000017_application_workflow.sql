-- EPDMS 017: application review as in the walkthrough, on top of the staged onboarding already live.
-- Additive and idempotent. On the live project the status list, ref_no, partners.address and application_documents already exist;
-- the create-if-missing statements below only matter for a fresh database.
alter table public.applications add column if not exists ref_no text;
alter table public.partners add column if not exists address text;
alter table public.partners add column if not exists monthly_target numeric(10,2) not null default 0 check (monthly_target >= 0);
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('Submitted','Documents requested','Documents submitted','More info needed','Field verification','Agreement pending','MOU signed','Approved','Rejected'));
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null, file_path text, file_name text, size_bytes integer,
  status text not null default 'Uploaded' check (status in ('Uploaded','Accepted','Rejected')),
  note text, uploaded_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz,
  is_current boolean not null default true, partner_id text, not_applicable boolean not null default false, reused_from uuid
);
alter table public.application_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='application_documents' and policyname='appdocs_staff_read') then
    create policy appdocs_staff_read on public.application_documents for select using (public.is_staff());
  end if;
end $$;

-- Field-verification record and an automatic history trail
alter table public.applications
  add column if not exists reg_verified boolean,
  add column if not exists reputation numeric(2,1) check (reputation is null or reputation between 0 and 1),
  add column if not exists field_note text,
  add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.agreements add column if not exists term_years int not null default 1 check (term_years between 1 and 5);

create or replace function public.applications_history() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.history := old.history || jsonb_build_array(jsonb_build_object('at', now(), 'status', new.status,
      'note', coalesce(nullif(trim(new.reason),''), nullif(trim(new.field_note),'')),
      'by', coalesce(nullif((select full_name from public.profiles where id = auth.uid()),''), 'System')));
  end if;
  return new;
end $$;
revoke execute on function public.applications_history() from public, anon, authenticated;
drop trigger if exists applications_history_t on public.applications;
create trigger applications_history_t before update on public.applications for each row execute function public.applications_history();

-- Approval with decisions (Super Admin). The one-argument version stays for existing callers.
create or replace function public.approve_application(app uuid, cat text, dist text, excl boolean, years int, target numeric, tpl uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare a public.applications; pid text; clash text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve'; end if;
  select * into a from public.applications where id = app for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.partner_id is not null then return a.partner_id; end if;
  if a.status in ('Rejected','Approved','Agreement pending','MOU signed') then raise exception 'This application is already finished'; end if;
  if not exists (select 1 from public.partner_types where code = cat) then raise exception 'Unknown partner category'; end if;
  if coalesce(trim(dist),'') = '' then raise exception 'Territory is required'; end if;
  if years not between 1 and 5 then raise exception 'Agreement length must be 1 to 5 years'; end if;
  if coalesce(target,0) < 0 then raise exception 'Target cannot be negative'; end if;
  if excl then
    select p.name || ' (' || p.id || ')' into clash from public.partners p
     where p.district = dist and p.status not in ('Terminated','Suspended') and (p.type_code = cat or p.exclusive) limit 1;
    if clash is not null then raise exception 'Exclusive territory blocked: % already operates in %', clash, dist; end if;
  end if;
  perform set_config('epdms.approving','on',true);
  pid := public.next_partner_id(cat);
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin,address,exclusive,monthly_target)
  values (pid,cat,a.business_name,a.contact_name,a.phone,a.email,a.state,dist,a.gstin,a.answers->>'address',excl,target);
  insert into public.territory_claims(partner_id,state,district,exclusive) values (pid,a.state,dist,excl);
  update public.application_documents set partner_id = pid where application_id = app;
  update public.applications set status='Agreement pending', partner_id=pid where id = app;
  if tpl is not null and not exists (select 1 from public.agreements where partner_id = pid and status in ('Draft','Sent')) then
    perform public.create_agreement(pid, tpl);
  end if;
  update public.agreements set term_years = years where partner_id = pid and status in ('Draft','Sent');
  return pid;
end $$;
revoke execute on function public.approve_application(uuid,text,text,boolean,int,numeric,uuid) from public, anon;
grant execute on function public.approve_application(uuid,text,text,boolean,int,numeric,uuid) to authenticated;
