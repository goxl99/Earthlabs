-- EPDMS 015 (Day 5 load test, 50,000 orders / 1,000 partners): every row-level-security policy called the role helpers
-- (is_staff, my_partner, my_role, ...) once PER ROW. Each call is a small query, so listing 50 orders cost ~1.4 s because the
-- whole table was scanned. Wrapping the helper in (select ...) makes Postgres evaluate it once per statement and lets the
-- indexes on partner_id / created_at do the work. Meaning of every policy is unchanged (the full test suite is the proof).
-- Supabase performance advisor (multiple_permissive_policies): a "FOR ALL" write policy next to a SELECT policy makes Postgres run both for
-- every read. Split each FOR ALL policy into INSERT / UPDATE / DELETE. Super Admin read access is already covered by every SELECT policy.
do $$ declare p record; n int := 0; begin
  for p in select * from pg_policies where schemaname = 'public' and cmd = 'ALL'
           and exists (select 1 from pg_policies s where s.schemaname = 'public' and s.tablename = pg_policies.tablename and s.cmd = 'SELECT') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('create policy %I on %I.%I for insert with check (%s)', p.policyname || '_ins', p.schemaname, p.tablename, coalesce(p.with_check, p.qual));
    execute format('create policy %I on %I.%I for update using (%s) with check (%s)', p.policyname || '_upd', p.schemaname, p.tablename, p.qual, coalesce(p.with_check, p.qual));
    execute format('create policy %I on %I.%I for delete using (%s)', p.policyname || '_del', p.schemaname, p.tablename, p.qual);
    n := n + 1;
  end loop;
  raise notice 'FOR ALL policies split: %', n;
end $$;

-- Foreign keys without a covering index (performance advisor, unindexed_foreign_keys)
create index if not exists credit_notes_partner_idx on public.credit_notes (partner_id);
create index if not exists payment_proofs_partner_idx on public.payment_proofs (partner_id);
create index if not exists release_orders_rm_idx on public.release_orders (rm_id);
create index if not exists ro_events_ro_idx on public.ro_events (ro_id);
create index if not exists vendor_stock_lines_rm_idx on public.vendor_stock_lines (rm_id);
create index if not exists vendor_stock_reports_vendor_idx on public.vendor_stock_reports (vendor_id);

-- Row-level security helpers evaluated once per statement:
do $$ declare p record; q text; w text; n int := 0;
  fn text := '(is_staff|is_super|my_partner|my_role|my_vendor|is_procurement)';
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual; w := p.with_check;
    if q is not null then
      q := regexp_replace(q, '(?<!SELECT )(?<![A-Za-z0-9_.])' || fn || '\(\)', '(select \1())', 'g');
      q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if w is not null then
      w := regexp_replace(w, '(?<!SELECT )(?<![A-Za-z0-9_.])' || fn || '\(\)', '(select \1())', 'g');
      w := regexp_replace(w, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if q is distinct from p.qual or w is distinct from p.with_check then
      execute format('alter policy %I on %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
        case when q is not null then ' using (' || q || ')' else '' end,
        case when w is not null then ' with check (' || w || ')' else '' end);
      n := n + 1;
    end if;
  end loop;
  raise notice 'policies rewritten: %', n;
end $$;
