-- The built-in Dealer MOU needs no uploaded template: allow an agreement without one.
create or replace function public.create_agreement(pid text, tpl uuid default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare a uuid; pt text; tt text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can prepare agreements'; end if;
  select type_code into pt from public.partners where id = pid;
  if pt is null then raise exception 'Partner not found'; end if;
  if tpl is not null then
    select type_code into tt from public.mou_templates where id = tpl and active;
    if not found then raise exception 'Template not found or retired'; end if;
    if tt is not null and tt <> pt then raise exception 'This template is for another partner type'; end if;
  end if;
  if exists (select 1 from public.agreements where partner_id = pid and status in ('Draft','Sent')) then raise exception 'This partner already has an open agreement'; end if;
  insert into public.agreements(partner_id, template_id) values (pid, tpl) returning id into a;
  return a;
end $$;
