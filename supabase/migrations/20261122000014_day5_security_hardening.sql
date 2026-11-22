-- EPDMS 014 (Day 5 security review). Found by the attack tests in tests/build8_test.sql.
-- 1) Warehouse is internal staff but has no business seeing margins, price lists or schemes: limit to Super Admin, Sales, Accounts.
drop policy if exists margins_read on public.sku_margins;
create policy margins_read on public.sku_margins for select using (public.my_role() in ('super_admin','sales','accounts'));
drop policy if exists slabs_read on public.margin_slabs;
create policy slabs_read on public.margin_slabs for select using (public.my_role() in ('super_admin','sales','accounts'));
drop policy if exists schemes_read on public.schemes;
create policy schemes_read on public.schemes for select using (public.my_role() in ('super_admin','sales','accounts') or public.scheme_for_me(schemes.*));
create or replace function public.price_list()
 returns table(sku text, name text, category text, mrp numeric, status text, type_code text, margin_pct numeric, price numeric)
 language sql stable security definer set search_path = public as $$
  select k.sku, k.name, k.category, k.mrp, k.status, t.code,
         coalesce(m.margin_pct, d.margin_pct, 0),
         round(k.mrp / 1.18 * (1 - coalesce(m.margin_pct, d.margin_pct, 0) / 100.0), 4)
  from public.skus k cross join public.partner_types t
  left join public.sku_margins m on m.sku = k.sku and m.type_code = t.code
  left join public.margin_slabs d on d.type_code = t.code and d.slab = k.slab
  where public.my_role() in ('super_admin','sales','accounts') and t.code <> 'INS' and coalesce(m.margin_pct, d.margin_pct) is not null
  order by k.sku, t.level
$$;

-- 2) Logged-out (anon) role: no table privileges at all except reading which registration types are open, and execute only on the
--    three public functions. Row-level security already blocked the rest; this removes the second layer's single point of failure.
revoke all on all tables in schema public from anon;
grant select on public.partner_types to anon;
revoke all on all sequences in schema public from anon;
do $$ declare f record; keep oid[] := '{}'; begin
  -- remember what signed-in users may run today (migration 013 removed some internal functions on purpose), then drop the PUBLIC/anon grant
  select coalesce(array_agg(p.oid), '{}') into keep from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute');
  revoke execute on all functions in schema public from public, anon;
  for f in select p.oid::regprocedure as sig from pg_proc p where p.oid = any(keep) loop execute format('grant execute on function %s to authenticated', f.sig); end loop;
end $$;
grant execute on function public.submit_application(text,text,text,text,text,text,text,text,jsonb), public.track_application(uuid,text), public.verify_certificate(text) to anon;
-- future objects: same rule, so a forgotten grant cannot reopen the door
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 3) A disclosed "all partners" scheme was readable by vendors and any signed-in non-partner. Only partners may see partner schemes.
create or replace function public.scheme_for_me(s public.schemes) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_partner() is not null and s.active and s.disclosed and current_date between s.valid_from and s.valid_to and (
    s.audience_mode = 'all'
    or (s.audience_mode = 'types' and (select type_code from public.partners where id = public.my_partner()) = any (s.audience_types))
    or (s.audience_mode = 'partners' and public.my_partner() = any (s.audience_partners)))
$$;
