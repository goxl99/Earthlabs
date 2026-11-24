-- Build 9: Dashboard overview matching the approved prototype (15 tiles, two charts, top/bottom partners, watch lists).
-- New: monthly target per partner (set at approval), a delivery/quality issue note on dispatches, and one read function.
-- Money figures are returned to Super Admin, Sales and Accounts only; Warehouse gets operational figures.

alter table public.partners add column if not exists monthly_target numeric(10,2) not null default 0 check (monthly_target >= 0);   -- rupees in lakh
comment on column public.partners.monthly_target is 'Monthly sales target in lakh, set by Super Admin at approval';
alter table public.dispatch_notes add column if not exists issue text;
alter table public.dispatch_notes add column if not exists issue_at timestamptz;

create or replace function public.report_dispatch_issue(oid text, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','warehouse') then raise exception 'Only Super Admin or Warehouse can report a dispatch issue'; end if;
  if coalesce(length(trim(note)),0) < 3 then raise exception 'Describe the issue'; end if;
  update public.dispatch_notes set issue = trim(note), issue_at = now() where order_id = oid;
  if not found then raise exception 'No dispatch found for order %', oid; end if;
  insert into public.audit_log(actor, actor_role, action, table_name, row_key, new_row)
  values (auth.uid(), public.my_role(), 'UPDATE', 'dispatch_notes', oid, jsonb_build_object('issue', trim(note)));
end $$;
revoke all on function public.report_dispatch_issue(text, text) from public, anon;
grant execute on function public.report_dispatch_issue(text, text) to authenticated;

-- p_cat: null or one of DLR, DST, STK, INS (filters partners and everything derived from them).
create or replace function public.dashboard_overview(p_cat text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.app_role := public.my_role();
  money boolean := r in ('super_admin','sales','accounts');
  m0 date := date_trunc('month', current_date)::date;
  j jsonb;
begin
  if not public.is_staff() then raise exception 'Dashboard overview is for staff'; end if;
  if p_cat is not null and p_cat not in ('DLR','DST','STK','INS') then raise exception 'Unknown category'; end if;

  with ps as (select * from public.partners where p_cat is null or type_code = p_cat),
       act as (select * from ps where status = 'Active'),
       lastscore as (
         select distinct on (s.partner_id) s.partner_id, s.score, s.band from public.partner_scores s
         join act a on a.id = s.partner_id where s.score is not null order by s.partner_id, s.month desc),
       months as (select generate_series(m0 - interval '3 months', m0, interval '1 month')::date as m)
  select jsonb_build_object(
    'category', p_cat, 'money', money,
    'apps_open', (select count(*) from public.applications where status <> 'Rejected' and partner_id is null and (p_cat is null or type_code = p_cat)),
    'apps_rejected', (select count(*) from public.applications where status = 'Rejected' and (p_cat is null or type_code = p_cat)),
    'partners_total', (select count(*) from ps),
    'partners_not_active', (select count(*) from ps where status <> 'Active'),
    'active_dlr', (select count(*) from act where type_code = 'DLR'),
    'active_dst', (select count(*) from act where type_code = 'DST'),
    'active_stk', (select count(*) from act where type_code = 'STK'),
    'active_ins', (select count(*) from act where type_code = 'INS'),
    'vendors_active', (select count(*) from public.vendors where status = 'Active'),
    'vendors_pending', (select count(*) from public.vendors where status <> 'Active'),
    'pending_apps', (select count(*) from public.applications where status in ('Submitted','Documents submitted','Field verification') and (p_cat is null or type_code = p_cat)),
    'pending_orders_approval', (select count(*) from public.orders o where o.status = 'Pending Approval' and exists (select 1 from ps where ps.id = o.partner_id)),
    'pending_agreements', (select count(*) from public.agreements a where a.status in ('Draft','Sent') and exists (select 1 from ps where ps.id = a.partner_id)),
    'proofs_to_verify', (select count(*) from public.payment_proofs x where x.status = 'Submitted' and exists (select 1 from ps where ps.id = x.partner_id)),
    'promotion_eligible', (select count(*) from public.promotion_assessments a where a.status = 'Pending' and exists (select 1 from ps where ps.id = a.partner_id)),
    'unverified_partners', (select count(*) from act where type_code <> 'INS' and not exists (select 1 from lastscore l where l.partner_id = act.id)),
    'orders_pipeline', (select count(*) from public.orders o where o.status in ('Pending Approval','Approved','Payment Confirmed') and exists (select 1 from ps where ps.id = o.partner_id)),
    'in_transit', (select count(*) from public.orders o where o.status = 'Dispatched' and exists (select 1 from ps where ps.id = o.partner_id)),
    'delivery_issues', (select count(*) from public.dispatch_notes d join public.orders o on o.id = d.order_id where d.issue is not null and exists (select 1 from ps where ps.id = o.partner_id)),
    'ai_pending', (select count(*) from public.ai_recommendations where status = 'Pending'),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('sku', k.sku, 'name', k.name, 'left', s.available - s.reserved, 'reorder', s.reorder_level) order by k.sku), '[]')
                  from public.stock s join public.skus k on k.sku = s.sku
                  where k.status = 'active' and s.available - s.reserved <= s.reorder_level),
    'lowest_vendor', null
  ) into j;

  if money then
    j := j || (
      with ps as (select * from public.partners where p_cat is null or type_code = p_cat),
           act as (select * from ps where status = 'Active'),
           lastscore as (
             select distinct on (s.partner_id) s.partner_id, s.score, s.band from public.partner_scores s
             join act a on a.id = s.partner_id where s.score is not null order by s.partner_id, s.month desc),
           inv as (select i.* from public.invoices i where exists (select 1 from ps where ps.id = i.partner_id)),
           pay as (select l.* from public.ledger_entries l where l.kind = 'payment' and exists (select 1 from ps where ps.id = l.partner_id)),
           months as (select generate_series(m0 - interval '3 months', m0, interval '1 month')::date as m)
      select jsonb_build_object(
        'primary_sales_month', (select coalesce(sum(taxable),0) from inv where date_trunc('month', issued_on) = m0),
        'collections_month', (select coalesce(round(sum(credit) / 1.18, 2),0) from pay where date_trunc('month', at) = m0),
        'outstanding', (select coalesce(sum(greatest(b,0)),0) from (select sum(debit - credit) b from public.ledger_entries l where exists (select 1 from ps where ps.id = l.partner_id) group by partner_id) x),
        'invoiced_total', (select coalesce(sum(taxable),0) from inv),
        'invoice_count', (select count(*) from inv),
        'credit_used_pct', (select case when sum(credit_limit) > 0 then round(sum(greatest(b,0)) / sum(credit_limit) * 100) end from (
              select p.id, (select coalesce(sum(debit - credit),0) from public.ledger_entries l where l.partner_id = p.id) b, 0::numeric credit_limit from act p) y),
        'secondary_sales', null,
        'chart_months', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'),
              'invoiced', round((select coalesce(sum(taxable),0) from inv where date_trunc('month', issued_on) = m) / 100000, 1),
              'collected', round((select coalesce(sum(credit),0) from pay where date_trunc('month', at) = m) / 1.18 / 100000, 1)) order by m) from months),
        'chart_targets', (select jsonb_agg(jsonb_build_object('cat', t.c,
              'target', (select coalesce(sum(monthly_target),0) from act where type_code = t.c),
              'achieved', round((select coalesce(sum(i.taxable),0) from inv i join act a on a.id = i.partner_id where a.type_code = t.c and date_trunc('month', i.issued_on) = m0) / 100000, 1)) order by t.o)
              from (values ('DLR',1),('DST',2),('STK',3),('INS',4)) t(c,o)),
        'top5', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'score', score, 'band', band) order by score desc), '[]')
                 from (select a.id, a.name, l.score, l.band from lastscore l join act a on a.id = l.partner_id order by l.score desc, a.id limit 5) t),
        'bottom5', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'score', score, 'band', band) order by score asc), '[]')
                 from (select a.id, a.name, l.score, l.band from lastscore l join act a on a.id = l.partner_id order by l.score asc, a.id limit 5) t),
        'promotion_list', (select coalesce(jsonb_agg(jsonb_build_object('id', a.partner_id, 'name', p.name, 'from', a.from_type, 'to', a.to_type)), '[]')
                 from public.promotion_assessments a join ps p on p.id = a.partner_id where a.status = 'Pending')
      ));
  end if;
  return j;
end $$;
revoke all on function public.dashboard_overview(text) from public, anon;
grant execute on function public.dashboard_overview(text) to authenticated;

-- Counts shown as badges beside side-menu items (as in the prototype). Staff only; each figure is limited to what the role may see.
create or replace function public.nav_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.app_role := public.my_role();
begin
  if not public.is_staff() then return '{}'::jsonb; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'apps',   case when r in ('super_admin','sales') then (select count(*) from public.applications where status in ('Submitted','Documents submitted','Field verification')) end,
    'agree',  case when r in ('super_admin','sales','accounts') then (select count(*) from public.agreements where status in ('Draft','Sent')) end,
    'orders', (select count(*) from public.orders where status = case when r = 'warehouse' then 'Payment Confirmed' when r = 'accounts' then 'Approved' else 'Pending Approval' end),
    'fin',    case when r in ('super_admin','accounts') then (select count(*) from public.payment_proofs where status = 'Submitted') end,
    'ai',     (select count(*) from public.ai_recommendations where status = 'Pending'),
    'proc',   case when r in ('super_admin','accounts','warehouse') then (select count(*) from public.release_orders where status = 'Pending approval') end,
    'appr',   case when r = 'super_admin' then jsonb_array_length(public.approval_queue()) end));
end $$;
revoke all on function public.nav_counts() from public, anon;
grant execute on function public.nav_counts() to authenticated;
