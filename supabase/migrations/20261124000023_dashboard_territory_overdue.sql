-- EPDMS 023: dashboard "Territory performance" and "Overdue" cards. Read-only functions; nothing existing changes.
-- Overdue rule (stated so it can be checked): a partner's balance (ledger debit - credit) is attributed to the newest invoices first;
-- an invoice portion is overdue when issued_on + the credit days of the partner's level (credit_ladder setting) is before today.
create or replace function public.dashboard_territory() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() not in ('super_admin','sales','accounts') then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(t order by t.sales desc, t.district) from (
    select p.district,
           count(*) filter (where p.status = 'Active') as partners,
           coalesce((select sum(o.taxable) from public.orders o join public.partners q on q.id = o.partner_id
                      where q.district = p.district and o.status <> 'Cancelled' and date_trunc('month', o.created_at) = date_trunc('month', now())), 0) as sales,
           (select round(avg(s.score)::numeric, 1) from public.partners q join lateral
              (select score from public.partner_scores x where x.partner_id = q.id and x.score is not null order by x.month desc limit 1) s on true
            where q.district = p.district) as avg_score
    from public.partners p group by p.district) t), '[]'::jsonb);
end $$;

create or replace function public.dashboard_overdue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lad jsonb;
begin
  if public.my_role() not in ('super_admin','accounts') then raise exception 'Not allowed'; end if;
  select value into lad from public.settings where key = 'credit_ladder';
  return coalesce((select jsonb_agg(x order by x.days_late desc, x.amount desc) from (
    select * from (
      select i.partner_id, p.name, i.id as invoice_id, i.issued_on,
             coalesce((lad -> least(p.credit_level, greatest(jsonb_array_length(lad) - 1, 0)) ->> 'days')::int, 0) as terms,
             least(i.total, greatest(b.bal - coalesce(sum(i.total) over (partition by i.partner_id order by i.issued_on desc, i.id desc rows between unbounded preceding and 1 preceding), 0), 0)) as amount
      from public.invoices i
      join public.partners p on p.id = i.partner_id
      join (select partner_id, sum(debit - credit) as bal from public.ledger_entries group by partner_id) b on b.partner_id = i.partner_id and b.bal > 0
    ) y
    cross join lateral (select (current_date - (y.issued_on + y.terms)) as days_late) d
    where y.amount > 0 and d.days_late > 0
  ) x limit 50), '[]'::jsonb);
end $$;
revoke execute on function public.dashboard_territory(), public.dashboard_overdue() from public, anon;
grant execute on function public.dashboard_territory(), public.dashboard_overdue() to authenticated;
