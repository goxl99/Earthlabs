-- EPDMS 022: AI Intelligence "Defer". A deferred recommendation stays open and can still be approved or dismissed later.
-- Additive: the only change to existing behaviour is that decide_ai_recommendation also accepts a Deferred item.
alter table public.ai_recommendations drop constraint if exists ai_recommendations_status_check;
alter table public.ai_recommendations add constraint ai_recommendations_status_check check (status in ('Pending','Deferred','Approved','Dismissed'));

create or replace function public.defer_ai_recommendation(rid bigint, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'AI recommends. Only Super Admin can defer'; end if;
  update public.ai_recommendations set status = 'Deferred', note = nullif(trim(coalesce(why,'')),''), decided_by = auth.uid(), decided_at = now() where id = rid and status = 'Pending';
  if not found then raise exception 'Only a pending recommendation can be deferred'; end if;
end $$;

create or replace function public.decide_ai_recommendation(rid bigint, approve boolean, why text) returns text
language plpgsql security definer set search_path = public as $$
declare a public.ai_recommendations; res text := 'Dismissed';
begin
  if not public.is_super() then raise exception 'AI recommends. Only Super Admin can approve'; end if;
  select * into a from public.ai_recommendations where id = rid for update;
  if a.id is null then raise exception 'Recommendation not found'; end if;
  if a.status not in ('Pending','Deferred') then raise exception 'Already %', a.status; end if;
  if approve then
    res := 'Approved';
    if a.kind = 'credit' then
      perform public.apply_credit_level(a.target_kind, a.target_id, (a.payload->>'to_level')::int);
    elsif a.kind = 'reorder' then
      res := 'Approved: release order ' || public.raise_release_order(a.target_id, (a.payload->>'qty')::numeric) || ' raised';
    elsif a.kind = 'lead_time' then
      update public.raw_materials set lead_days = (a.payload->>'lead_days')::int where id = a.target_id;
    end if;
  end if;
  update public.ai_recommendations set status = case when approve then 'Approved' else 'Dismissed' end, decided_by = auth.uid(), decided_at = now(), note = why where id = rid;
  return res;
end $$;

revoke execute on function public.defer_ai_recommendation(bigint,text) from public, anon;
grant execute on function public.defer_ai_recommendation(bigint,text) to authenticated;
