-- EPDMS 020b: "Offers & credit" for the partner portal (walkthrough: Partner portal > Offers & credit).
-- A partner may not read the settings table, so the credit ladder and the partner's own level are served by one narrow function.
-- Schemes need no new function: the schemes_read policy already shows a partner only disclosed, qualifying schemes.
create or replace function public.my_credit() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid text := public.my_partner(); lvl int; lad jsonb; pc boolean; sc numeric;
begin
  if pid is null then raise exception 'Offers & credit is for partners only'; end if;
  select credit_level into lvl from public.partners where id = pid;
  select value into lad from public.settings where key = 'credit_ladder';
  select coalesce((value ->> 'enabled')::boolean, true) into pc from public.settings where key = 'pay_and_carry';
  select score into sc from public.partner_scores where partner_id = pid and score is not null order by month desc limit 1;
  return jsonb_build_object('partner_id', pid, 'level', coalesce(lvl, 0), 'pay_and_carry', coalesce(pc, true), 'score', sc,
    'ladder', coalesce(lad, '[]'::jsonb));
end $$;
revoke execute on function public.my_credit() from public, anon;
grant execute on function public.my_credit() to authenticated;
