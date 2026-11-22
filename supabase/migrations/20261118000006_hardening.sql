-- EPDMS 006: hardening found in the architecture review
-- 1) Super Admin bootstrap is a one-time, race-safe switch instead of "whoever signs up first"
insert into public.settings(key,value) values ('bootstrap_open','true') on conflict (key) do nothing;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_ boolean;
begin
  select (value)::text = 'true' into open_ from public.settings where key = 'bootstrap_open' for update;  -- row lock: two simultaneous sign-ups cannot both win
  if coalesce(open_, false) and not exists (select 1 from public.profiles where role = 'super_admin') then
    insert into public.profiles(id, role, full_name, active) values (new.id, 'super_admin', coalesce(new.raw_user_meta_data ->> 'full_name',''), true);
    update public.settings set value = 'false' where key = 'bootstrap_open';
  else
    insert into public.profiles(id, role, full_name, active) values (new.id, 'dealer', coalesce(new.raw_user_meta_data ->> 'full_name',''), false);
  end if;
  return new;
end $$;

-- 2) The audit trail can never be edited or deleted, even by Super Admin
create or replace function public.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'The audit trail cannot be changed'; end $$;
create trigger audit_no_update before update or delete on public.audit_log for each row execute function public.audit_immutable();
revoke update, delete, truncate on public.audit_log from anon, authenticated;

-- 3) Public registration flood guard (the edge layer adds per-IP limits and a bot check on top)
create or replace function public.submit_application(t text, biz text, contact text, ph text, mail text, st text, dist text, gst text, ans jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not exists (select 1 from public.partner_types where code = t and registration_open) then raise exception 'Registration for this partner type is not open'; end if;
  if length(trim(biz)) < 2 or length(trim(ph)) < 8 or position('@' in mail) < 2 then raise exception 'Please fill business name, phone and a valid e-mail'; end if;
  if (select count(*) from public.applications a where a.created_at > now() - interval '1 hour') >= 60 then raise exception 'Too many applications right now. Please try again later'; end if;
  if exists (select 1 from public.applications a where lower(a.email) = lower(mail) and a.status in ('Submitted','More info needed','Field verification') and a.created_at > now() - interval '1 day' and a.type_code = t) then raise exception 'You already have an application in progress'; end if;
  insert into public.applications(type_code,business_name,contact_name,phone,email,state,district,gstin,answers)
  values (t, trim(biz), trim(contact), trim(ph), trim(mail), coalesce(nullif(st,''),'Gujarat'), dist, nullif(gst,''), coalesce(ans,'{}')) returning applications.id into id;
  return id;
end $$;
grant execute on function public.submit_application(text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;

-- 4) Indexes for the lists and look-ups used at 1,000+ users
create index if not exists applications_email_idx on public.applications(lower(email));
create index if not exists partners_status_idx on public.partners(status);
create index if not exists partners_name_trgm_idx on public.partners(lower(name));
create index if not exists change_requests_user_idx on public.change_requests(requested_by);

-- 5) Private file storage (payment proofs, MOUs, certificates). Files live under a folder named after the Partner ID.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public) values ('payment-proofs','payment-proofs',false),('agreements','agreements',false),('certificates','certificates',false) on conflict (id) do nothing;
    execute $p$create policy "partner reads own files" on storage.objects for select to authenticated using (bucket_id in ('payment-proofs','agreements','certificates') and ((storage.foldername(name))[1] = public.my_partner() or public.is_staff()))$p$;
    execute $p$create policy "partner uploads own proofs" on storage.objects for insert to authenticated with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = public.my_partner())$p$;
    execute $p$create policy "staff manage agreements and certificates" on storage.objects for all to authenticated using (bucket_id in ('agreements','certificates') and public.my_role() in ('super_admin','sales')) with check (bucket_id in ('agreements','certificates') and public.my_role() in ('super_admin','sales'))$p$;
  end if;
end $$;
