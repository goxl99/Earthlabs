-- EPDMS 017: application review workflow as shown in the walkthrough
-- Adds the two missing stages (Under Verification, Management Review), the field-verification record,
-- an automatic history trail, and an approval step that records category, territory, exclusivity, term and target.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('Submitted','Under Verification','More info needed','Field verification','Management Review','Approved','Rejected'));
alter table public.applications
  add column if not exists reg_verified boolean,
  add column if not exists reputation numeric(2,1) check (reputation is null or reputation between 0 and 1),
  add column if not exists field_note text,
  add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.agreements add column if not exists term_years int not null default 1 check (term_years between 1 and 5);

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
  if new.status = 'Management Review' and old.status <> 'Management Review' and old.status = 'Submitted' then
    raise exception 'Start verification before sending to management review';
  end if;
  if new.status is distinct from old.status then
    new.history := old.history || jsonb_build_array(jsonb_build_object('at', now(), 'status', new.status,
      'note', coalesce(nullif(trim(new.reason),''), nullif(trim(new.field_note),'')),
      'by', coalesce(nullif((select full_name from public.profiles where id = auth.uid()),''), 'System')));
  end if;
  return new;
end $$;

-- Approval with decisions: only from Management Review, Super Admin only
create or replace function public.approve_application(app uuid, cat text, dist text, excl boolean, years int, target numeric, tpl uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare a public.applications; pid text; clash text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve'; end if;
  select * into a from public.applications where id = app for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if a.partner_id is not null then return a.partner_id; end if;
  if a.status <> 'Management Review' then raise exception 'Only an application in management review can be approved'; end if;
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
  insert into public.partners(id,type_code,name,contact_name,phone,email,state,district,gstin,exclusive,monthly_target)
  values (pid,cat,a.business_name,a.contact_name,a.phone,a.email,a.state,dist,a.gstin,excl,target);
  insert into public.territory_claims(partner_id,state,district,exclusive) values (pid,a.state,dist,excl);
  update public.applications set status='Approved', partner_id=pid where id = app;
  if tpl is not null then
    perform public.create_agreement(pid, tpl);
    update public.agreements set term_years = years where partner_id = pid and status = 'Draft';
  end if;
  return pid;
end $$;
revoke execute on function public.approve_application(uuid,text,text,boolean,int,numeric,uuid) from public, anon;
grant execute on function public.approve_application(uuid,text,text,boolean,int,numeric,uuid) to authenticated;
