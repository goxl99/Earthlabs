-- EPDMS 012 (build 7): Performance Matrix (monthly score, weights, bands, direction), promotion assessments with hold rules,
-- growth ladder, credit-step score minimum (closes the gap noted in build 6), and role-gated Reports and Exports.
-- No real data: weights and promotion rules below are the policy defaults from the review prototype; Super Admin edits them in settings.

-- ============ 0) Policy in settings (Super Admin edits; staff read; validated by a trigger) ============
insert into public.settings(key,value) values
 ('score_weights','[{"n":"Sales target achievement","w":25},{"n":"Retail / dealer network development","w":15},{"n":"Payment discipline","w":15},{"n":"Secondary sales","w":15},{"n":"New customer acquisition","w":10},{"n":"Repeat orders and retention","w":10},{"n":"Inventory and operational discipline","w":5},{"n":"Brand and policy compliance","w":5}]'),
 ('promotion_rules','{
  "DLR":{"n":"Dealer to Authorized Distributor","next":"DST","promote":0.80,"hold":0.60,"q":2,"items":[
    {"n":"Volume vs MOU target","w":0.30,"lo":60,"hi":100,"min":0.50},{"n":"Growth (QoQ, avg 2 qtrs)","w":0.15,"lo":0,"hi":10,"min":0},
    {"n":"On-time payment","w":0.20,"lo":70,"hi":100,"min":0.75},{"n":"Active outlets","w":0.20,"lo":50,"hi":90,"min":0.40},{"n":"Brand and pricing compliance","w":0.15,"lo":0,"hi":1,"min":0.60}]},
  "DST":{"n":"Distributor to Circle Stockist","next":"STK","promote":0.80,"hold":0.65,"q":4,"items":[
    {"n":"Distributor record (4 qtrs)","w":0.25,"lo":70,"hi":110,"min":0.50},{"n":"Warehouse and working capital","w":0.20,"lo":50,"hi":100,"min":0.60},
    {"n":"Delivery reliability","w":0.20,"lo":80,"hi":98,"min":0.60},{"n":"Payment discipline","w":0.15,"lo":80,"hi":100,"min":0.75},{"n":"Distributors supplied","w":0.20,"lo":3,"hi":8,"min":0.40}]},
  "STK":{"n":"Circle Stockist to Circle Master Stockist","next":"MST","promote":0.85,"hold":0.70,"q":4,"items":[
    {"n":"Consistent growth","w":0.25,"lo":0,"hi":8,"min":0.50},{"n":"Team and systems","w":0.20,"lo":0,"hi":1,"min":0.60},
    {"n":"Clean payment records","w":0.20,"lo":85,"hi":100,"min":0.80},{"n":"Clean stock records (variance, lower is better)","w":0.20,"lo":5,"hi":0.5,"min":0.60},{"n":"Circles served","w":0.15,"lo":1,"hi":3,"min":0.50}]},
  "MST":{"n":"Circle Master Stockist to Super Stockist","next":"SST","promote":0.85,"hold":0.70,"q":4,"items":[
    {"n":"Master-circle results","w":0.30,"lo":80,"hi":110,"min":0.60},{"n":"Financial strength","w":0.20,"lo":60,"hi":100,"min":0.60},
    {"n":"Logistics reach","w":0.15,"lo":50,"hi":95,"min":0.50},{"n":"Values and quality alignment","w":0.20,"lo":0,"hi":1,"min":0.80},{"n":"Joint plan delivery","w":0.15,"lo":50,"hi":100,"min":0.50}]},
  "INS":{"n":"Institutional Dealer to Distributor","next":"DST","promote":0.80,"hold":0.60,"q":2,"items":[
    {"n":"5-litre volume vs target","w":0.30,"lo":60,"hi":100,"min":0.50},{"n":"Active institutional accounts","w":0.25,"lo":5,"hi":25,"min":0.40},
    {"n":"Repeat orders","w":0.20,"lo":40,"hi":85,"min":0.50},{"n":"On-time payment","w":0.15,"lo":80,"hi":100,"min":0.75},{"n":"Site and reference feedback","w":0.10,"lo":0,"hi":1,"min":0.50}]}
 }')
on conflict (key) do nothing;

-- the weights must be eight and total 100; every promotion rule needs weights totalling 1, promote above hold
create or replace function public.settings_policy_check() returns trigger language plpgsql as $$
declare t numeric; r record;
begin
  if new.key = 'score_weights' then
    if jsonb_typeof(new.value) <> 'array' or jsonb_array_length(new.value) <> 8 then raise exception 'The score has exactly 8 parameters'; end if;
    select coalesce(sum((e->>'w')::numeric),0) into t from jsonb_array_elements(new.value) e;
    if t <> 100 then raise exception 'Score weights must total 100 (now %)', t; end if;
    if exists (select 1 from jsonb_array_elements(new.value) e where (e->>'w')::numeric < 0) then raise exception 'A weight cannot be negative'; end if;
  elsif new.key = 'promotion_rules' then
    for r in select key k, value v from jsonb_each(new.value) loop
      select coalesce(sum((e->>'w')::numeric),0) into t from jsonb_array_elements(r.v->'items') e;
      if abs(t - 1) > 0.001 then raise exception 'Promotion rule % weights must total 1 (now %)', r.k, t; end if;
      if (r.v->>'promote')::numeric <= (r.v->>'hold')::numeric then raise exception 'Promotion rule %: promote score must be above hold score', r.k; end if;
      if (r.v->>'q')::int < 1 then raise exception 'Promotion rule %: at least one quarter', r.k; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger settings_policy_check_t before insert or update on public.settings for each row execute function public.settings_policy_check();

-- ============ 1) Monthly partner scores ============
create or replace function public.score_band(s numeric) returns text language sql immutable as $$
  select case when s is null then null when s >= 90 then 'Outstanding' when s >= 80 then 'Excellent' when s >= 70 then 'Good' when s >= 60 then 'Needs Improvement' else 'Underperforming' end $$;

-- params: array of 8 values 0..1 or null. null = unverified: kept OUT of the score (never counted as zero).
create or replace function public.compute_score(params jsonb, weights jsonb) returns jsonb language plpgsql immutable as $$
declare i int; w numeric; v numeric; sw numeric := 0; sv numeric := 0;
begin
  for i in 0..jsonb_array_length(weights)-1 loop
    w := (weights->i->>'w')::numeric;
    if jsonb_typeof(params->i) = 'null' or params->i is null then continue; end if;
    v := (params->>i)::numeric;
    sw := sw + w; sv := sv + w * v;
  end loop;
  return jsonb_build_object('score', case when sw > 0 then round(sv / sw * 100, 1) end, 'verified_weight', sw);
end $$;

create table public.partner_scores (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  month date not null check (month = date_trunc('month', month)::date),
  params jsonb not null,
  weights jsonb not null,                 -- the weights in force when the score was recorded
  score numeric(5,1),                     -- null = nothing verified yet
  verified_weight numeric not null default 0,
  band text,
  note text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (partner_id, month)
);
create index partner_scores_partner_idx on public.partner_scores(partner_id, month desc);
alter table public.partner_scores enable row level security;
create policy scores_read on public.partner_scores for select using (public.my_role() in ('super_admin','sales','accounts') or partner_id = public.my_partner());
revoke insert, update, delete, truncate on public.partner_scores from anon, authenticated;
create trigger audit_partner_scores after insert or update on public.partner_scores for each row execute function public.audit_row('id');

create or replace function public.record_partner_score(pid text, m date, p jsonb, why text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare w jsonb; c jsonb; i int; sid bigint; ps public.partners; mm date := date_trunc('month', m)::date;
begin
  if public.my_role() not in ('super_admin','sales','accounts') then raise exception 'Only Super Admin, Sales or Accounts can record a partner score'; end if;
  select * into ps from public.partners where id = pid;
  if ps.id is null then raise exception 'Partner % not found', pid; end if;
  if ps.status not in ('Active','Suspended') then raise exception 'Only an active or suspended partner has a performance profile'; end if;
  if mm > date_trunc('month', current_date)::date then raise exception 'A score cannot be recorded for a future month'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 8 then raise exception 'A score needs 8 values (null where unverified)'; end if;
  for i in 0..7 loop
    if jsonb_typeof(p->i) not in ('null','number') or (jsonb_typeof(p->i) = 'number' and ((p->>i)::numeric < 0 or (p->>i)::numeric > 1)) then
      raise exception 'Value % must be between 0 and 1, or null when unverified', i + 1;
    end if;
  end loop;
  select value into w from public.settings where key = 'score_weights';
  c := public.compute_score(p, w);
  insert into public.partner_scores(partner_id, month, params, weights, score, verified_weight, band, note)
  values (pid, mm, p, w, (c->>'score')::numeric, (c->>'verified_weight')::numeric, public.score_band((c->>'score')::numeric), why)
  on conflict (partner_id, month) do update set params = excluded.params, weights = excluded.weights, score = excluded.score,
    verified_weight = excluded.verified_weight, band = excluded.band, note = excluded.note, recorded_by = auth.uid()
  returning id into sid;
  return sid;
end $$;

create or replace function public.partner_latest_score(pid text) returns numeric
language sql stable security definer set search_path = public as $$
  select score from public.partner_scores where partner_id = pid and score is not null order by month desc limit 1 $$;
revoke execute on function public.partner_latest_score(text) from public, anon, authenticated;

-- staff overview, one page at a time (50 rows by default, never more than 200)
create or replace function public.performance_overview(lim int default 50, off int default 0)
returns table(partner_id text, name text, type_code text, status text, month date, score numeric, band text, prev_score numeric, direction text, unverified int)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','sales','accounts') then raise exception 'Performance Matrix is not available for your role'; end if;
  return query
  select p.id, p.name, p.type_code, p.status, l.month, l.score, l.band, v.score,
         case when p.status = 'Suspended' then 'Suspended'
              when l.score is null then 'Inactive'
              when l.score < 60 then 'At risk'
              when v.score is null then 'Consistent'
              when l.score - v.score >= 2 then 'Improving'
              when l.score - v.score <= -2 then 'Declining'
              else 'Consistent' end,
         case when l.params is null then 8 else (select count(*)::int from jsonb_array_elements(l.params) e where jsonb_typeof(e) = 'null') end
  from public.partners p
  left join lateral (select s.month, s.score, s.band, s.params from public.partner_scores s where s.partner_id = p.id order by s.month desc limit 1) l on true
  left join lateral (select s.score from public.partner_scores s where s.partner_id = p.id order by s.month desc offset 1 limit 1) v on true
  where p.status in ('Active','Suspended')
  order by p.id
  limit least(greatest(coalesce(lim,50),1),200) offset greatest(coalesce(off,0),0);
end $$;

-- ============ 2) Promotion assessments (quarterly; management decides) ============
create table public.promotion_assessments (
  id bigint generated always as identity primary key,
  partner_id text not null references public.partners(id),
  quarter text not null check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  from_type text not null, to_type text not null,
  actuals jsonb not null,
  weighted numeric,                                   -- null = not enough data
  gates_ok boolean not null default false,
  quarters_ok int not null default 0,                 -- quarters in a row at or above the promote score, including this one
  state text not null,                                -- Eligible for assessment / Hold ... / Hold and develop / Corrective plan / Not enough data
  status text not null default 'Recorded' check (status in ('Recorded','Pending','Approved','Deferred','Rejected')),
  assessed_by uuid default auth.uid(), decided_by uuid, decided_at timestamptz, note text,
  created_at timestamptz not null default now(),
  unique (partner_id, quarter)
);
create index promotion_status_idx on public.promotion_assessments(status, created_at);
alter table public.promotion_assessments enable row level security;
create policy promo_read on public.promotion_assessments for select using (public.my_role() in ('super_admin','sales','accounts') or partner_id = public.my_partner());
revoke insert, update, delete, truncate on public.promotion_assessments from anon, authenticated;
create trigger audit_promotion_assessments after insert or update on public.promotion_assessments for each row execute function public.audit_row('id');

-- one partner's profile: a partner reads only their own; staff (super, sales, accounts) read any
create or replace function public.partner_performance(pid text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare target text; r public.app_role := public.my_role();
begin
  if r in ('dealer','distributor') then
    target := public.my_partner();
    if pid is not null and pid <> target then raise exception 'You can see only your own performance'; end if;
  elsif r in ('super_admin','sales','accounts') then
    target := pid;
  else raise exception 'Performance is not available for your role';
  end if;
  if target is null then raise exception 'Choose a partner'; end if;
  return jsonb_build_object(
    'partner_id', target,
    'history', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'score', score, 'band', band, 'params', params, 'weights', weights) order by month desc)
                         from (select * from public.partner_scores where partner_id = target order by month desc limit 12) h), '[]'::jsonb),
    'assessment', (select jsonb_build_object('quarter', quarter, 'to_type', to_type, 'state', state, 'status', status, 'weighted', weighted, 'quarters_ok', quarters_ok)
                   from public.promotion_assessments where partner_id = target order by id desc limit 1));
end $$;

-- growth ladder for the partner: the next step, what it needs, and where they stand (own record only; staff may pass a partner id)
create or replace function public.growth_ladder(pid text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare target text; r public.app_role := public.my_role(); t text; rule jsonb; a public.promotion_assessments;
begin
  if r in ('dealer','distributor') then
    target := public.my_partner();
    if pid is not null and pid <> target then raise exception 'You can see only your own growth ladder'; end if;
  elsif r in ('super_admin','sales','accounts') then target := pid;
  else raise exception 'Growth ladder is not available for your role'; end if;
  if target is null then raise exception 'Choose a partner'; end if;
  select type_code into t from public.partners where id = target;
  select value->t into rule from public.settings where key = 'promotion_rules';
  if rule is null then return jsonb_build_object('partner_id', target, 'top', true); end if;
  select * into a from public.promotion_assessments where partner_id = target and from_type = t order by public.quarter_index(quarter) desc limit 1;
  return jsonb_build_object('partner_id', target, 'top', false, 'step', rule->>'n', 'next_type', rule->>'next', 'quarters_needed', (rule->>'q')::int,
    'promote_at', (rule->>'promote')::numeric,
    'criteria', (select jsonb_agg(jsonb_build_object('n', e->>'n', 'w', (e->>'w')::numeric, 'full_score_at', (e->>'hi')::numeric, 'gate', (e->>'min')::numeric) order by ord)
                 from jsonb_array_elements(rule->'items') with ordinality as x(e, ord)),
    'latest', case when a.id is null then null else jsonb_build_object('quarter', a.quarter, 'state', a.state, 'status', a.status, 'weighted', a.weighted, 'quarters_ok', a.quarters_ok, 'actuals', a.actuals) end);
end $$;

create or replace function public.quarter_index(q text) returns int language sql immutable as $$
  select substr(q,1,4)::int * 4 + substr(q,7,1)::int $$;

create or replace function public.assess_promotion(pid text, q text, actuals jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare ps public.partners; rule jsonb; n int; i int; a numeric; lo numeric; hi numeric; s numeric; w numeric; known numeric := 0; tot numeric := 0;
        gates boolean := true; promote numeric; hold numeric; need int; qs int := 0; wt numeric; st text; stat text; prev record; expect int; aid bigint;
begin
  if public.my_role() not in ('super_admin','sales') then raise exception 'Only Super Admin or Sales can record a promotion assessment'; end if;
  if q !~ '^[0-9]{4}-Q[1-4]$' then raise exception 'Quarter looks like 2026-Q4'; end if;
  select * into ps from public.partners where id = pid;
  if ps.id is null then raise exception 'Partner % not found', pid; end if;
  if ps.status <> 'Active' then raise exception 'Only an active partner can be assessed for promotion'; end if;
  select value->ps.type_code into rule from public.settings where key = 'promotion_rules';
  if rule is null then raise exception 'There is no next step for this category'; end if;
  n := jsonb_array_length(rule->'items');
  if jsonb_typeof(actuals) <> 'array' or jsonb_array_length(actuals) <> n then raise exception 'This step needs % actual values (null where unknown)', n; end if;
  promote := (rule->>'promote')::numeric; hold := (rule->>'hold')::numeric; need := (rule->>'q')::int;
  for i in 0..n-1 loop
    if jsonb_typeof(actuals->i) = 'null' then continue; end if;
    if jsonb_typeof(actuals->i) <> 'number' then raise exception 'Actual values must be numbers or null'; end if;
    a := (actuals->>i)::numeric; lo := (rule->'items'->i->>'lo')::numeric; hi := (rule->'items'->i->>'hi')::numeric; w := (rule->'items'->i->>'w')::numeric;
    s := case when hi = lo then 1 else greatest(0, least(1, (a - lo) / (hi - lo))) end;
    tot := tot + w * s; known := known + w;
    if s < (rule->'items'->i->>'min')::numeric then gates := false; end if;
  end loop;
  wt := case when known > 0 then round(tot / known, 4) end;
  -- quarters in a row at or above the promote score with every gate passed (adjacent quarters only)
  if wt is not null and wt >= promote and gates then
    qs := 1; expect := public.quarter_index(q) - 1;
    for prev in select * from public.promotion_assessments where partner_id = pid and from_type = ps.type_code and quarter <> q order by public.quarter_index(quarter) desc loop
      exit when public.quarter_index(prev.quarter) <> expect or prev.weighted is null or prev.weighted < promote or not prev.gates_ok;
      qs := qs + 1; expect := expect - 1;
    end loop;
  end if;
  if wt is null then st := 'Not enough data';
  elsif wt >= promote and gates and qs >= need then st := 'Eligible for assessment';
  elsif wt >= promote and gates then st := 'Hold – needs ' || (need - qs) || ' more quarter(s) at the promote score';
  elsif wt >= hold then st := 'Hold and develop';
  else st := 'Corrective plan'; end if;
  stat := case when st = 'Eligible for assessment' then 'Pending' else 'Recorded' end;
  if exists (select 1 from public.promotion_assessments where partner_id = pid and quarter = q and status in ('Approved','Deferred','Rejected')) then
    raise exception 'This quarter was already decided';
  end if;
  insert into public.promotion_assessments(partner_id, quarter, from_type, to_type, actuals, weighted, gates_ok, quarters_ok, state, status)
  values (pid, q, ps.type_code, rule->>'next', actuals, wt, gates, qs, st, stat)
  on conflict (partner_id, quarter) do update set actuals = excluded.actuals, weighted = excluded.weighted, gates_ok = excluded.gates_ok,
    quarters_ok = excluded.quarters_ok, state = excluded.state, status = excluded.status, from_type = excluded.from_type, to_type = excluded.to_type, assessed_by = auth.uid()
  returning id into aid;
  return aid;
end $$;

-- management decision. Approving promotes the partner; the Partner ID, orders, invoices and history stay attached.
create or replace function public.decide_promotion(aid bigint, decision text, why text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.promotion_assessments; cur text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can decide a promotion'; end if;
  if decision not in ('Approved','Deferred','Rejected') then raise exception 'Decision must be Approved, Deferred or Rejected'; end if;
  select * into a from public.promotion_assessments where id = aid for update;
  if a.id is null then raise exception 'Assessment not found'; end if;
  if a.status <> 'Pending' then raise exception 'Only an assessment that is eligible and pending can be decided (this one is %)', a.status; end if;
  if decision <> 'Approved' and length(trim(coalesce(why,''))) < 3 then raise exception 'Give a reason for deferring or rejecting'; end if;
  if decision = 'Approved' then
    select type_code into cur from public.partners where id = a.partner_id for update;
    if cur <> a.from_type then raise exception 'The partner category changed since this assessment. Assess again'; end if;
    if exists (select 1 from public.territory_claims m join public.territory_claims c on c.state = m.state and c.district = m.district and c.partner_id <> m.partner_id
               join public.partners p on p.id = c.partner_id where m.partner_id = a.partner_id and p.type_code = a.to_type and (m.exclusive or c.exclusive)) then
      raise exception 'Territory conflict: another % partner is exclusive in, or shares, this partner''s district', a.to_type;
    end if;
    update public.partners set type_code = a.to_type where id = a.partner_id;
    perform public.notify_partner(a.partner_id, 'You have moved up', 'Congratulations. Your category has been upgraded. A new agreement will follow.', '/partner/dashboard/');
  end if;
  update public.promotion_assessments set status = decision, decided_by = auth.uid(), decided_at = now(), note = why where id = aid;
end $$;

-- ============ 3) Credit steps need the score (closes the build 6 gap) ============
create or replace function public.credit_score_check(k text, i text, to_lvl int) returns void
language plpgsql security definer set search_path = public as $$
declare need numeric; got numeric; ladder jsonb;
begin
  if k <> 'partner' or to_lvl <= public.entity_credit_level(k, i) then return; end if;
  select value into ladder from public.settings where key = 'credit_ladder';
  need := coalesce((ladder->to_lvl->>'min')::numeric, 0);
  if need <= 0 then return; end if;
  got := public.partner_latest_score(i);
  if got is null then raise exception 'No verified performance score yet: credit cannot open until the partner is scored'; end if;
  if got < need then raise exception 'Performance score % is below the % needed for this credit level', got, need; end if;
end $$;
revoke execute on function public.credit_score_check(text,text,int) from public, anon, authenticated;

create or replace function public.insert_credit_proposal(k text, i text, to_lvl int, why text, src text, uid uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare cur int := public.entity_credit_level(k, i); pid bigint;
begin
  if to_lvl < 0 or to_lvl >= public.ladder_len() then raise exception 'That credit level does not exist'; end if;
  if to_lvl = cur then raise exception 'Already at that level'; end if;
  if to_lvl > cur + 1 then raise exception 'Credit moves up one step at a time'; end if;
  if length(trim(coalesce(why,''))) < 3 then raise exception 'Give the reason for the change'; end if;
  perform public.credit_score_check(k, i, to_lvl);
  insert into public.credit_proposals(entity_kind, entity_id, from_level, to_level, reason, source, proposed_by) values (k, i, cur, to_lvl, why, src, uid) returning id into pid;
  return pid;
end $$;
revoke execute on function public.insert_credit_proposal(text,text,int,text,text,uuid) from public, anon, authenticated;

create or replace function public.apply_credit_level(k text, i text, lvl int) returns void
language plpgsql security definer set search_path = public as $$
declare pc jsonb;
begin
  select value into pc from public.settings where key = 'pay_and_carry';
  if lvl > 0 and coalesce((pc->>'enabled')::boolean, true) then raise exception 'Pay-and-carry is switched on. Switch it off in settings before any credit is opened'; end if;
  perform public.credit_score_check(k, i, lvl);   -- the score can fall between proposal and approval
  perform set_config('epdms.credit_apply','on',true);
  if k = 'partner' then update public.partners set credit_level = lvl where id = i; else update public.vendors set credit_level = lvl where id = i; end if;
  perform set_config('epdms.credit_apply','off',true);
end $$;
revoke execute on function public.apply_credit_level(text,text,int) from public, anon, authenticated;

-- ============ 4) Reports and exports ============
-- One function, one role table. Every run is written to the audit trail. Rows are capped at 5000 per run.
create or replace function public.report_roles(kind text) returns text[] language sql immutable as $$
  select case kind
    when 'partners' then array['super_admin','sales','accounts']
    when 'applications' then array['super_admin','sales']
    when 'territory' then array['super_admin','sales']
    when 'agreements' then array['super_admin','sales']
    when 'certificates' then array['super_admin','sales']
    when 'exclusivity' then array['super_admin','sales']
    when 'primary_sales' then array['super_admin','sales','accounts']
    when 'monthly_performance' then array['super_admin','sales','accounts']
    when 'scorecards' then array['super_admin','sales','accounts']
    when 'partner_evolution' then array['super_admin','sales','accounts']
    when 'promotion' then array['super_admin','sales','accounts']
    when 'orders' then array['super_admin','sales','accounts','warehouse']
    when 'dispatch' then array['super_admin','warehouse']
    when 'invoices' then array['super_admin','accounts']
    when 'collections' then array['super_admin','accounts']
    when 'outstanding' then array['super_admin','accounts']
    when 'inventory' then array['super_admin','warehouse']
    when 'vendors' then array['super_admin','accounts','warehouse']
    when 'release_orders' then array['super_admin','warehouse']
  end $$;

create or replace function public.report_catalogue() returns table(kind text, title text, module text)
language plpgsql stable security definer set search_path = public as $$
declare r text := public.my_role()::text;
begin
  if r is null or r in ('dealer','distributor','vendor') then raise exception 'Reports are for staff'; end if;
  return query select v.k, v.t, v.m from (values
    ('partners','Partner directory','Partners'),('applications','Dealer / distributor applications','Applications'),('territory','Territory coverage','Territory Explorer'),
    ('agreements','Agreement report','Agreements'),('certificates','Certificate report','Agreements'),('exclusivity','Exclusivity report','Agreements'),
    ('primary_sales','Primary sales by partner','Performance Matrix'),('monthly_performance','Monthly performance','Performance Matrix'),
    ('scorecards','Partner scorecards','Performance Matrix'),('partner_evolution','Partner evolution (12 months)','Performance Matrix'),('promotion','Promotion eligibility','Performance Matrix'),
    ('orders','Orders','Orders'),('dispatch','Dispatch','Inventory'),('invoices','Invoices','Invoices & Payments'),('collections','Collections','Invoices & Payments'),
    ('outstanding','Outstanding receivables','Invoices & Payments'),('inventory','Inventory','Inventory'),('vendors','Vendor directory','Vendors'),('release_orders','Release orders','Procurement')
  ) as v(k,t,m) where r = any(public.report_roles(v.k));
end $$;

create or replace function public.run_report(kind text, d_from date default null, d_to date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.my_role()::text; res jsonb; lo date := coalesce(d_from, date '2000-01-01'); hi date := coalesce(d_to, date '2100-01-01');
begin
  if r is null or public.report_roles(kind) is null then raise exception 'Unknown report'; end if;
  if not (r = any(public.report_roles(kind))) then raise exception 'Your role cannot run this report'; end if;
  if lo > hi then raise exception 'The start date is after the end date'; end if;
  res := case kind
   when 'partners' then (select coalesce(jsonb_agg(x),'[]') from (select p.id "PartnerID", p.name "Name", t.name "Category", p.district "District", p.status "Status", p.exclusive "Exclusive" from public.partners p join public.partner_types t on t.code = p.type_code order by p.id limit 5000) x)
   when 'applications' then (select coalesce(jsonb_agg(x),'[]') from (select a.id "ID", a.business_name "Name", a.type_code "Category", a.district "District", a.status "Status", a.created_at::date "Submitted" from public.applications a where a.created_at::date between lo and hi order by a.created_at desc limit 5000) x)
   when 'territory' then (select coalesce(jsonb_agg(x),'[]') from (select c.state "State", c.district "District", p.type_code "Category", count(*)::int "Partners", max(case when c.exclusive then p.id end) "ExclusivePartner" from public.territory_claims c join public.partners p on p.id = c.partner_id group by c.state, c.district, p.type_code order by 1,2,3 limit 5000) x)
   when 'agreements' then (select coalesce(jsonb_agg(x),'[]') from (select g.partner_id "PartnerID", g.status "Status", g.sent_at::date "Sent", g.signed_at::date "Signed" from public.agreements g order by g.created_at desc limit 5000) x)
   when 'certificates' then (select coalesce(jsonb_agg(x),'[]') from (select c.code "Certificate", c.partner_id "PartnerID", c.issued_at::date "Issued", c.revoked "Revoked" from public.certificates c order by c.issued_at desc limit 5000) x)
   when 'exclusivity' then (select coalesce(jsonb_agg(x),'[]') from (select p.id "PartnerID", p.name "Name", c.district "District", t.name "Category" from public.territory_claims c join public.partners p on p.id = c.partner_id join public.partner_types t on t.code = p.type_code where c.exclusive order by c.district limit 5000) x)
   when 'primary_sales' then (select coalesce(jsonb_agg(x),'[]') from (select p.id "PartnerID", p.name "Name", count(i.id)::int "Invoices", coalesce(sum(i.taxable),0) "InvoicedBeforeGST" from public.partners p left join public.invoices i on i.partner_id = p.id and i.issued_on between lo and hi where p.status = 'Active' group by p.id, p.name order by p.id limit 5000) x)
   when 'monthly_performance' then (select coalesce(jsonb_agg(x),'[]') from (select o.partner_id "PartnerID", o.name "Name", o.month "Month", coalesce(o.score::text,'unverified') "Score", o.band "Band", o.direction "Direction" from public.performance_overview(200, 0) o order by o.partner_id) x)
   when 'scorecards' then (select coalesce(jsonb_agg(x),'[]') from (
        select s.partner_id "PartnerID", s.month "Month", coalesce(s.score::text,'unverified') "Score",
               (select jsonb_object_agg(t.w->>'n', case when jsonb_typeof(s.params->(t.ord::int - 1)) = 'null' then 'unverified' else round((s.params->>(t.ord::int - 1))::numeric * 100)::text end) from jsonb_array_elements(s.weights) with ordinality as t(w, ord)) "Parameters"
        from public.partner_scores s where s.month between date_trunc('month', lo)::date and hi order by s.month desc, s.partner_id limit 5000) x)
   when 'partner_evolution' then (select coalesce(jsonb_agg(x),'[]') from (select s.partner_id "PartnerID", s.month "Month", s.score "Score", s.band "Band" from public.partner_scores s where s.month >= (date_trunc('month', current_date) - interval '11 months')::date order by s.partner_id, s.month limit 5000) x)
   when 'promotion' then (select coalesce(jsonb_agg(x),'[]') from (select a.partner_id "PartnerID", a.quarter "Quarter", a.from_type "From", a.to_type "To", a.weighted "Weighted", a.quarters_ok "QuartersInARow", a.state "State", a.status "Decision" from public.promotion_assessments a order by a.created_at desc limit 5000) x)
   when 'orders' then (select coalesce(jsonb_agg(x),'[]') from (select o.id "Order", o.partner_id "PartnerID", o.created_at::date "Date", o.status "Status", o.total "Total" from public.orders o where o.created_at::date between lo and hi order by o.created_at desc limit 5000) x)
   when 'dispatch' then (select coalesce(jsonb_agg(x),'[]') from (select d.id "Dispatch", d.order_id "Order", d.vehicle "Vehicle", d.lr_no "LR", d.batch_ref "Batches", d.dispatched_at::date "Date" from public.dispatch_notes d where d.dispatched_at::date between lo and hi order by d.dispatched_at desc limit 5000) x)
   when 'invoices' then (select coalesce(jsonb_agg(x),'[]') from (select i.id "Invoice", i.partner_id "PartnerID", i.issued_on "Date", i.taxable "Taxable", i.cgst "CGST", i.sgst "SGST", i.igst "IGST", i.total "Total" from public.invoices i where i.issued_on between lo and hi order by i.issued_on desc limit 5000) x)
   when 'collections' then (select coalesce(jsonb_agg(x),'[]') from (select l.partner_id "PartnerID", l.at::date "Date", l.kind "Kind", l.utr "UTR", l.credit "Amount" from public.ledger_entries l where l.credit > 0 and l.at::date between lo and hi order by l.at desc limit 5000) x)
   when 'outstanding' then (select coalesce(jsonb_agg(x),'[]') from (select l.partner_id "PartnerID", sum(l.debit - l.credit) "Outstanding" from public.ledger_entries l group by l.partner_id having sum(l.debit - l.credit) <> 0 order by 2 desc limit 5000) x)
   when 'inventory' then (select coalesce(jsonb_agg(x),'[]') from (select s.sku "SKU", k.name "Product", s.available "Available", s.reserved "Reserved", s.reorder_level "Reorder" from public.stock s join public.skus k on k.sku = s.sku order by s.sku limit 5000) x)
   when 'vendors' then (select coalesce(jsonb_agg(x),'[]') from (select v.id "ID", v.name "Name", v.supplies "Supplies", v.status "Status" from public.vendors v order by v.id limit 5000) x)
   when 'release_orders' then (select coalesce(jsonb_agg(x),'[]') from (select o.id "ID", o.vendor_id "Vendor", o.rm_id "Item", o.qty "Qty", o.status "Status", o.pay_status "Payment", o.created_at::date "Date" from public.release_orders o where o.created_at::date between lo and hi order by o.created_at desc limit 5000) x)
  end;
  insert into public.audit_log(actor, actor_role, action, table_name, row_key, new_row)
  values (auth.uid(), public.my_role(), 'EXPORT', 'report', kind, jsonb_build_object('rows', jsonb_array_length(res), 'from', d_from, 'to', d_to));
  return res;
end $$;
