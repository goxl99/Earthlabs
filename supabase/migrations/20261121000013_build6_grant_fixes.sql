-- EPDMS 012 (build 6 follow-up, found by the live Supabase security advisor): the new functions were still executable by the
-- logged-out `anon` role through the default PUBLIC grant. Close it; signed-in users keep execute (the functions check roles inside).
revoke execute on function
  public.create_vendor(text,text,text,text,text,text), public.set_vendor_status(text,text), public.upsert_raw_material(text,text,text,text,numeric,numeric,int,numeric),
  public.adjust_raw_material(text,numeric,text), public.submit_vendor_stock_report(jsonb), public.decide_vendor_stock_report(text,boolean,text),
  public.propose_credit_change(text,text,int,text), public.decide_credit_change(bigint,boolean,text),
  public.raise_release_order(text,numeric), public.approve_release_order(text), public.reject_release_order(text,text), public.vendor_acknowledge_ro(text),
  public.release_vendor_payment(text,text,numeric), public.vendor_dispatch_ro(text), public.receive_release_order(text), public.decide_ai_recommendation(bigint,boolean,text),
  public.approval_queue(), public.ai_facts(), public.my_vendor_items(), public.my_vendor(), public.is_procurement(), public.ladder_len()
  from public, anon;
grant execute on function
  public.create_vendor(text,text,text,text,text,text), public.set_vendor_status(text,text), public.upsert_raw_material(text,text,text,text,numeric,numeric,int,numeric),
  public.adjust_raw_material(text,numeric,text), public.submit_vendor_stock_report(jsonb), public.decide_vendor_stock_report(text,boolean,text),
  public.propose_credit_change(text,text,int,text), public.decide_credit_change(bigint,boolean,text),
  public.raise_release_order(text,numeric), public.approve_release_order(text), public.reject_release_order(text,text), public.vendor_acknowledge_ro(text),
  public.release_vendor_payment(text,text,numeric), public.vendor_dispatch_ro(text), public.receive_release_order(text), public.decide_ai_recommendation(bigint,boolean,text),
  public.approval_queue(), public.ai_facts(), public.my_vendor_items(), public.my_vendor(), public.is_procurement()
  to authenticated;
alter function public.credit_level_guard() set search_path = public;
revoke execute on function public.credit_level_guard(), public.ladder_len() from public, anon, authenticated;
