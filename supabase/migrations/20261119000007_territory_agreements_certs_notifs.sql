-- EPDMS 007: territory rules and map, agreements and MOU templates, certificates with public verify, notifications
-- 1) Territory: one exclusive holder per partner type per district; nobody of that type may share an exclusive district
create or replace function public.territory_conflict() returns trigger language plpgsql as $$
declare t text;
begin
  select type_code into t from public.partners where id = new.partner_id;
  if exists (select 1 from public.territory_claims c join public.partners p on p.id = c.partner_id
             where c.exclusive and c.state = new.state and c.district = new.district
               and p.type_code = t and c.partner_id <> new.partner_id) then
    raise exception 'District % already has an exclusive % partner', new.district, t;
  end if;
  if new.exclusive and exists (select 1 from public.territory_claims c join public.partners p on p.id = c.partner_id
             where c.state = new.state and c.district = new.district and p.type_code = t and c.partner_id <> new.partner_id) then
    raise exception 'Cannot make % exclusive: other % partners already operate there', new.district, t;
  end if;
  return new;
end $$;

-- coverage map: one row per Gujarat district and partner type, for staff
create or replace function public.territory_map()
returns table(state text, district text, type_code text, partners int, exclusive_partner text)
language sql stable security definer set search_path = public as $$
  select c.state, c.district, p.type_code, count(*)::int, max(case when c.exclusive then p.id end)
  from public.territory_claims c join public.partners p on p.id = c.partner_id
  where public.is_staff() and p.status <> 'Terminated'
  group by c.state, c.district, p.type_code
$$;
grant execute on function public.territory_map() to authenticated;

-- exclusivity check before assigning: who holds this district for this partner type
create or replace function public.check_territory(st text, dist text, t text)
returns table(available boolean, exclusive_holder text, other_partners int)
language sql stable security definer set search_path = public as $$
  select not coalesce(bool_or(c.exclusive),false), max(case when c.exclusive then p.id end), count(*)::int
  from public.territory_claims c join public.partners p on p.id = c.partner_id
  where public.is_staff() and c.state = st and c.district = dist and p.type_code = t and p.status <> 'Terminated'
$$;
grant execute on function public.check_territory(text,text,text) to authenticated;

-- 2) MOU templates and agreements
create table public.mou_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) >= 3),
  version int not null default 1,
  type_code text references public.partner_types(code),   -- null = all partner types
  storage_path text not null,                              -- file in the private 'agreements' bucket, folder _templates
  field_map jsonb not null default '{}',                   -- placeholder in the file -> partner field
  active boolean not null default true,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create or replace function public.mou_field_map_ok() returns trigger language plpgsql as $$
declare k text; v text;
begin
  for k, v in select * from jsonb_each_text(new.field_map) loop
    if v not in ('partner_name','partner_id','contact_name','district','state','gstin','type_name','date','territory') then
      raise exception 'Unknown MOU field "%". Allowed: partner_name, partner_id, contact_name, district, state, gstin, type_name, date, territory', v;
    end if;
  end loop;
  if new.storage_path like '%..%' then raise exception 'Bad file path'; end if;
  return new;
end $$;
create trigger mou_field_map_t before insert or update on public.mou_templates for each row execute function public.mou_field_map_ok();

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partners(id),
  template_id uuid references public.mou_templates(id),
  status text not null default 'Draft' check (status in ('Draft','Sent','Signed','Void')),
  sent_at timestamptz, signed_at timestamptz, signed_path text,
  created_at timestamptz not null default now()
);
create index agreements_partner_idx on public.agreements(partner_id, status);
create unique index agreements_one_open_idx on public.agreements(partner_id) where status in ('Draft','Sent');

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  partner_id text not null references public.partners(id),
  agreement_id uuid references public.agreements(id),
  issued_at timestamptz not null default now(),
  revoked boolean not null default false
);
create index certificates_partner_idx on public.certificates(partner_id);

alter table public.mou_templates enable row level security;
alter table public.agreements enable row level security;
alter table public.certificates enable row level security;
create policy mou_staff_read on public.mou_templates for select using (public.is_staff());
create policy mou_super_write on public.mou_templates for all using (public.is_super()) with check (public.is_super());
create policy agr_read on public.agreements for select using (public.is_staff() or partner_id = public.my_partner());
create policy agr_write on public.agreements for all using (public.my_role() in ('super_admin','sales')) with check (public.my_role() in ('super_admin','sales'));
create policy cert_read on public.certificates for select using (public.is_staff() or partner_id = public.my_partner());
create policy cert_super_write on public.certificates for update using (public.is_super()) with check (public.is_super());
create trigger audit_mou after insert or update or delete on public.mou_templates for each row execute function public.audit_row('id');
create trigger audit_agr after insert or update or delete on public.agreements for each row execute function public.audit_row('id');
create trigger audit_cert after insert or update on public.certificates for each row execute function public.audit_row('id');

-- a signed agreement cannot be reopened; a partner goes Active only with a signed agreement
create or replace function public.agreements_guard() returns trigger language plpgsql as $$
begin
  if old.status in ('Signed','Void') and new.status is distinct from old.status then raise exception 'A finished agreement cannot change status'; end if;
  if new.status = 'Signed' and old.status <> 'Signed' and coalesce(new.signed_path,'') = '' then raise exception 'Upload the signed copy first'; end if;
  return new;
end $$;
create trigger agreements_guard_t before update on public.agreements for each row execute function public.agreements_guard();
create or replace function public.partner_activation_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'Active' and old.status <> 'Active' and not exists (select 1 from public.agreements a where a.partner_id = new.id and a.status = 'Signed') then
    raise exception 'A partner can be activated only after the agreement is signed';
  end if;
  return new;
end $$;
create trigger partner_activation_guard_t before update on public.partners for each row execute function public.partner_activation_guard();

-- 3) Notifications: in-app plus an e-mail outbox that an Edge Function delivers
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, body text, link text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null, subject text not null, body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts int not null default 0, created_at timestamptz not null default now(), sent_at timestamptz
);
create index email_outbox_queue_idx on public.email_outbox(status, created_at);
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
create policy notif_own_read on public.notifications for select using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete, truncate on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.email_outbox from anon, authenticated;   -- only the service role (Edge Function) reads it

create or replace function public.notify_partner(pid text, ttl text, msg text, lnk text) returns void
language plpgsql security definer set search_path = public as $$
declare mail text;
begin
  insert into public.notifications(user_id,title,body,link) select id, ttl, msg, lnk from public.profiles where partner_id = pid and active;
  select email into mail from public.partners where id = pid;
  if mail is not null then insert into public.email_outbox(to_email,subject,body) values (mail, ttl, msg); end if;
end $$;
revoke execute on function public.notify_partner(text,text,text,text) from public, anon, authenticated;

-- 4) Agreement flow
create or replace function public.create_agreement(pid text, tpl uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; pt text; tt text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can prepare agreements'; end if;
  select type_code into pt from public.partners where id = pid;
  if pt is null then raise exception 'Partner not found'; end if;
  select type_code into tt from public.mou_templates where id = tpl and active;
  if not found then raise exception 'Template not found or retired'; end if;
  if tt is not null and tt <> pt then raise exception 'This template is for another partner type'; end if;
  if exists (select 1 from public.agreements where partner_id = pid and status in ('Draft','Sent')) then raise exception 'This partner already has an open agreement'; end if;
  insert into public.agreements(partner_id, template_id) values (pid, tpl) returning id into a;
  return a;
end $$;
create or replace function public.send_agreement(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can send agreements'; end if;
  update public.agreements set status='Sent', sent_at=now() where id = aid and status = 'Draft' returning partner_id into pid;
  if pid is null then raise exception 'Only a draft agreement can be sent'; end if;
  perform public.notify_partner(pid, 'Your EarthLabs agreement is ready', 'Please review and sign the partnership agreement. After signing, your account is activated.', '/partner/agreements/');
end $$;
-- Super Admin records the signed copy: agreement signed, partner activated, certificate issued, partner told
create or replace function public.record_signed_agreement(aid uuid, path text) returns text
language plpgsql security definer set search_path = public as $$
declare pid text; code text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can record a signed agreement'; end if;
  update public.agreements set status='Signed', signed_at=now(), signed_path=path where id = aid and status = 'Sent' returning partner_id into pid;
  if pid is null then raise exception 'Only a sent agreement can be signed'; end if;
  update public.partners set status='Active' where id = pid and status = 'Agreement Pending';
  insert into public.certificates(partner_id, agreement_id) values (pid, aid) returning certificates.code into code;
  perform public.notify_partner(pid, 'Welcome to EarthLabs', 'Your agreement is signed and your partner certificate is issued.', '/partner/agreements/');
  return code;
end $$;
revoke execute on function public.create_agreement(text,uuid), public.send_agreement(uuid), public.record_signed_agreement(uuid,text) from public, anon;
grant execute on function public.create_agreement(text,uuid), public.send_agreement(uuid), public.record_signed_agreement(uuid,text) to authenticated;

-- 5) Public certificate verification (QR points here): no contact data, no prices
create or replace function public.verify_certificate(c text)
returns table(valid boolean, partner_id text, partner_name text, type_name text, district text, issued_at timestamptz)
language sql stable security definer set search_path = public as $$
  select (not x.revoked and p.status = 'Active'), p.id, p.name, t.name, p.district, x.issued_at
  from public.certificates x join public.partners p on p.id = x.partner_id join public.partner_types t on t.code = p.type_code
  where x.code = upper(trim(c))
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
