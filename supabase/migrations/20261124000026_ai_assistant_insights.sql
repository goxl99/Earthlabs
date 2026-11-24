-- Build 12: AI capabilities the walkthrough lists but the build lacked.
--  * ai_insights(): the four AI Intelligence cards (top performer, at-risk, inactive, collection forecast).
--  * ai_assist(topic): the Procurement "AI assistant" quick questions (reorder, delay risk, earned credit, scheme, pay and carry).
-- Both are rule-based and read-only: they compute from live stock, orders, ledger and scores, return numbers and ids, and change nothing.
-- Acting on an answer still goes through the normal screens and approvals ("AI recommends, management approves").

create or replace function public.ai_insights() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  with act as (select id, name, type_code, district from public.partners where status = 'Active'),
  o30 as (select partner_id, sum(total) v from public.orders where status <> 'Cancelled' and created_at > now() - interval '30 days' group by 1),
  o60 as (select partner_id, sum(total) v from public.orders where status <> 'Cancelled' and created_at <= now() - interval '30 days' and created_at > now() - interval '60 days' group by 1),
  o90 as (select partner_id, sum(total) v, count(*) n from public.orders where status <> 'Cancelled' and created_at > now() - interval '90 days' group by 1),
  lastany as (select partner_id, max(created_at) last_at from public.orders where status <> 'Cancelled' group by 1),
  bal as (select partner_id, sum(debit - credit) b from public.ledger_entries group by 1)
  select jsonb_build_object(
    'top', (select jsonb_build_object('id', a.id, 'name', a.name, 'value90', o90.v, 'orders90', o90.n) from act a join o90 on o90.partner_id = a.id order by o90.v desc limit 1),
    'at_risk', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'last30', coalesce(o30.v, 0), 'prev30', o60.v) order by o60.v desc)
        from act a join o60 on o60.partner_id = a.id left join o30 on o30.partner_id = a.id where coalesce(o30.v, 0) < o60.v * 0.5), '[]'),
    'inactive', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'last_order', l.last_at) order by l.last_at nulls first)
        from act a left join lastany l on l.partner_id = a.id where l.last_at is null or l.last_at < now() - interval '60 days'), '[]'),
    'forecast', jsonb_build_object(
        'outstanding', coalesce((select sum(b) from bal join act on act.id = bal.partner_id where b > 0), 0),
        'partners_owing', (select count(*) from bal join act on act.id = bal.partner_id where b > 0),
        'orders_in_hand', coalesce((select sum(total) from public.orders where status not in ('Cancelled', 'Delivered')), 0))
  ) into r;
  return r;
end $$;

create or replace function public.ai_assist(topic text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  buf int := coalesce((select (value ->> 'lead_buffer')::int from public.settings where key = 'procurement'), 2);
  lad jsonb := (select value from public.settings where key = 'credit_ladder');
  pc jsonb := (select value from public.settings where key = 'pay_and_carry');
  rows jsonb; n int;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if topic = 'reorder' then
    select coalesce(jsonb_agg(x order by (x ->> 'cover_days')::numeric), '[]') into rows from (
      select jsonb_build_object('item', m.id, 'name', m.name, 'unit', m.unit, 'on_hand', m.on_hand, 'incoming', inc.q, 'reorder_level', m.reorder_level, 'lead_days', m.lead_days,
        'cover_days', case when m.per_day > 0 then round((m.on_hand + inc.q) / m.per_day, 1) else 999 end,
        'suggest_qty', ceil(greatest(m.per_day * (m.lead_days + buf + 14) - (m.on_hand + inc.q), m.reorder_level * 2 - (m.on_hand + inc.q), 0))) x
      from public.raw_materials m
      cross join lateral (select coalesce(sum(qty), 0) q from public.release_orders r where r.rm_id = m.id and r.status in ('Approved', 'Acknowledged', 'Dispatched')) inc
      where m.active and m.vendor_id is not null and ((m.on_hand + inc.q) <= m.reorder_level or (m.per_day > 0 and (m.on_hand + inc.q) / m.per_day < m.lead_days + buf))) t;
    n := jsonb_array_length(rows);
    return jsonb_build_object('topic', topic, 'title', 'What should we reorder this week?', 'rows', rows,
      'summary', case when n = 0 then 'Nothing needs reordering. Every active material with a vendor has stock and incoming orders that cover its lead time plus the buffer.'
        else n || ' material(s) will run short before a new order could arrive. The suggested quantity covers lead time, the ' || buf || '-day buffer and 14 days of use.' end,
      'note', 'A release order is raised from Procurement and still needs approval. Money is released only in a separate payment step.');
  elsif topic = 'delay' then
    select coalesce(jsonb_agg(x order by (x ->> 'late_orders')::int desc), '[]') into rows from (
      select jsonb_build_object('vendor', v.id, 'name', v.name,
        'late_orders', (select count(*) from public.release_orders r where r.vendor_id = v.id and r.status in ('Approved', 'Acknowledged', 'Dispatched') and r.eta < current_date),
        'avg_days_taken', (select round(avg(actual_days), 1) from public.release_orders r where r.vendor_id = v.id and r.status = 'Received'),
        'avg_days_promised', (select round(avg(lead_days), 1) from public.release_orders r where r.vendor_id = v.id and r.status = 'Received')) x
      from public.vendors v where v.status = 'Active') t
    where (x ->> 'late_orders')::int > 0 or coalesce((x ->> 'avg_days_taken')::numeric, 0) > coalesce((x ->> 'avg_days_promised')::numeric, 0);
    n := jsonb_array_length(rows);
    return jsonb_build_object('topic', topic, 'title', 'Which vendors are a delay risk?', 'rows', rows,
      'summary', case when n = 0 then 'No vendor is late and none takes longer than promised on received orders.' else n || ' vendor(s) are late on open orders or take longer than they promise.' end,
      'note', 'Consider a lead-time correction (Procurement, Raw-material inventory) or a second quotation through RFQs.');
  elsif topic = 'credit' then
    select coalesce(jsonb_agg(x order by (x ->> 'score')::numeric desc), '[]') into rows from (
      select jsonb_build_object('partner', p.id, 'name', p.name, 'level', p.credit_level, 'next_level', lad -> (p.credit_level + 1) ->> 'n',
        'score', sc.score, 'needed', (lad -> (p.credit_level + 1) ->> 'min')::numeric,
        'orders_90d', (select count(*) from public.orders o where o.partner_id = p.id and o.status <> 'Cancelled' and o.created_at > now() - interval '90 days')) x
      from public.partners p
      cross join lateral (select score from public.partner_scores s where s.partner_id = p.id order by month desc, id desc limit 1) sc
      where p.status = 'Active' and lad -> (p.credit_level + 1) is not null
        and sc.score >= (lad -> (p.credit_level + 1) ->> 'min')::numeric
        and coalesce((select sum(debit - credit) from public.ledger_entries l where l.partner_id = p.id), 0) <= 0
        and (select count(*) from public.orders o where o.partner_id = p.id and o.status <> 'Cancelled' and o.created_at > now() - interval '90 days') >= 2
        and not exists (select 1 from public.credit_proposals c where c.entity_kind = 'partner' and c.entity_id = p.id and c.status = 'Pending')) t;
    n := jsonb_array_length(rows);
    return jsonb_build_object('topic', topic, 'title', 'Who has earned credit?', 'rows', rows,
      'summary', case when n = 0 then 'No partner qualifies for the next credit step yet. A partner needs the score for that step, no dues, and at least two orders in 90 days.'
        else n || ' partner(s) qualify for the next credit step. Credit rises one step at a time and only when Super Admin approves.' end,
      'note', 'Open Credit & reminders to raise a proposal. Nothing is changed by this answer.');
  elsif topic = 'scheme' then
    select coalesce(jsonb_agg(jsonb_build_object('scheme', s.id, 'name', s.name, 'kind', s.kind, 'value', s.value, 'valid_to', s.valid_to) order by s.created_at), '[]') into rows
      from public.schemes s where s.active and not s.disclosed and (s.valid_to is null or s.valid_to >= current_date);
    n := jsonb_array_length(rows);
    return jsonb_build_object('topic', topic, 'title', 'Which scheme should we show?', 'rows', rows,
      'summary', case when n = 0 then 'Every active scheme is already visible to partners, or none is active. Nothing is waiting to be disclosed.'
        else n || ' active scheme(s) are still hidden from partners. Show one when stock or a slow month makes it worthwhile: ' ||
          (select count(*) from public.partners p where p.status = 'Active' and not exists (select 1 from public.orders o where o.partner_id = p.id and o.status <> 'Cancelled' and o.created_at > now() - interval '60 days')) || ' active partner(s) have not ordered in 60 days.' end,
      'note', 'Schemes stay hidden until the people allowed to disclose them do so. This answer does not disclose anything.');
  elsif topic = 'paycarry' then
    return jsonb_build_object('topic', topic, 'title', 'How does pay and carry work?', 'rows', coalesce((select jsonb_agg(jsonb_build_object('level', ord - 1, 'name', e ->> 'n', 'credit_days', e ->> 'days', 'limit', e ->> 'limit', 'score_needed', e ->> 'min')) from jsonb_array_elements(lad) with ordinality t(e, ord)), '[]'),
      'summary', case when coalesce((pc ->> 'enabled')::boolean, false) then 'Pay and carry is on: a new partner pays ' || coalesce(pc ->> 'advance_pct', '100') || '% in advance and the goods are dispatched after Accounts verifies the payment.' else 'Pay and carry is switched off in settings.' end
        || ' Credit is raised one step at a time, only when Super Admin approves.',
      'note', 'The same rule applies to vendors: they ship after the advance is released, unless on an approved credit level.');
  end if;
  raise exception 'Unknown question';
end $$;

revoke all on function public.ai_insights() from public, anon;
revoke all on function public.ai_assist(text) from public, anon;
grant execute on function public.ai_insights() to authenticated;
grant execute on function public.ai_assist(text) to authenticated;
