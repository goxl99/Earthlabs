\set ON_ERROR_STOP on
-- Build 7 tests: monthly performance score (weights, unverified is not zero, bands, direction), policy validation,
-- promotion assessments (hold rules, gates, adjacency, management decision, Partner ID unchanged), credit-step score minimum,
-- reports and exports per role (and audit), plus an extra order payment-gate regression (Delivered cannot be forced).
-- Users: ...01 super, ...02 sales, ...03 dealer1 ELP-DLR-0001, ...04 dealer2 ELP-DLR-0002, ...05 accounts, ...06 warehouse.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); end $$;
create or replace function pg_temp.fails(q text, pat text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', q;
exception when others then
  if sqlerrm like 'EXPECTED_FAILURE_DID_NOT_HAPPEN%' then raise; end if;
  if sqlerrm !~* pat then raise exception 'Wrong error for [%]: got [%], wanted [%]', q, sqlerrm, pat; end if;
end $$;
reset role;
-- ===================== A. MONTHLY SCORE =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0002', current_date, '[1,1,1,1,1,1,1]')$q$, '8 values');
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0002', current_date, '[1,1,1,1,1,1,1,1.5]')$q$, 'between 0 and 1');
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0002', current_date, '[1,1,1,1,1,1,1,"x"]')$q$, 'between 0 and 1');
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0002', (current_date + interval '40 days')::date, '[1,1,1,1,1,1,1,1]')$q$, 'future month');
select pg_temp.fails($q$select record_partner_score('ELP-NOPE-0001', current_date, '[1,1,1,1,1,1,1,1]')$q$, 'not found');
select pg_temp.fails($q$insert into partner_scores(partner_id,month,params,weights) values ('ELP-DLR-0002',date_trunc('month',current_date),'[]','[]')$q$, 'permission denied');   -- no direct writes
reset role;
-- credit cannot open without a score (dealer 2 has none yet)
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0002',1,'steady buyer')$q$, 'No verified performance score');
-- missing data is kept out of the score, never counted as zero: only the 25-weight item is verified
select record_partner_score('ELP-DLR-0002', current_date, '[0.8,null,null,null,null,null,null,null]', 'only sales verified') as s1 \gset
reset role;
do $$ declare r partner_scores; begin
  select * into r from partner_scores where partner_id='ELP-DLR-0002' and month=date_trunc('month',current_date)::date;
  assert r.score = 80.0, 'unverified items are left out, not zero: got ' || r.score;
  assert r.verified_weight = 25, 'verified weight is 25';
  assert r.band = 'Excellent', 'band follows the score';
  assert jsonb_array_length(r.weights) = 8, 'the weights in force are stored with the score';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select record_partner_score('ELP-DLR-0002', current_date, '[null,null,null,null,null,null,null,null]', 'nothing verified');           -- accounts may record; re-record replaces the month
reset role;
do $$ declare r partner_scores; begin
  select * into r from partner_scores where partner_id='ELP-DLR-0002' and month=date_trunc('month',current_date)::date;
  assert r.score is null and r.band is null, 'all unverified gives no score at all, not zero';
  assert (select count(*) from partner_scores where partner_id='ELP-DLR-0002')=1, 'one row per partner per month';
  assert (select count(*) from audit_log where table_name='partner_scores')>=2, 'score changes are audited';
end $$;
-- who may record
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0002', current_date, '[1,1,1,1,1,1,1,1]')$q$, 'Only Super Admin, Sales or Accounts');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select record_partner_score('ELP-DLR-0001', current_date, '[1,1,1,1,1,1,1,1]')$q$, 'Only Super Admin, Sales or Accounts');   -- a partner cannot score themselves
reset role;
-- dealer 1: last month 70, this month 80 -> Improving; dealer 2: 50 -> At risk
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select record_partner_score('ELP-DLR-0001', (date_trunc('month',current_date) - interval '1 month')::date, '[0.7,0.7,0.7,0.7,0.7,0.7,0.7,0.7]');
select record_partner_score('ELP-DLR-0001', current_date, '[0.8,0.8,0.8,0.8,0.8,0.8,0.8,0.8]');
select record_partner_score('ELP-DLR-0002', current_date, '[0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5]', 'rescored');
do $$ begin
  assert (select direction from performance_overview() where partner_id='ELP-DLR-0001')='Improving', 'a rise of 2 points or more is Improving';
  assert (select band from performance_overview() where partner_id='ELP-DLR-0001')='Excellent', 'band 80-89 is Excellent';
  assert (select direction from performance_overview() where partner_id='ELP-DLR-0002')='At risk', 'below 60 is At risk';
  assert (select count(*) from performance_overview(1,0))=1, 'pages are honoured';
  assert (select count(*) from performance_overview(100000,0)) <= 200, 'a page never exceeds 200 rows';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select * from performance_overview()$q$, 'not available for your role');
reset role;
-- partners see only their own profile
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin
  assert (select count(*) from partner_scores where partner_id <> 'ELP-DLR-0001')=0, 'a partner sees only own scores';
  assert (select count(*) from partner_scores where partner_id = 'ELP-DLR-0001')=2, 'and all of their own';
  assert jsonb_array_length(partner_performance()->'history')=2, 'my performance returns own history';
end $$;
select pg_temp.fails($q$select partner_performance('ELP-DLR-0002')$q$, 'only your own');
select pg_temp.fails($q$select * from performance_overview()$q$, 'not available for your role');
do $$ begin assert (select count(*) from promotion_assessments where partner_id <> 'ELP-DLR-0001')=0, 'partners never see other partners'' assessments'; end $$;
reset role;

-- ===================== B. POLICY VALIDATION (Super Admin edits, the database checks) =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails($q$update settings set value='[{"n":"a","w":50},{"n":"b","w":49}]' where key='score_weights'$q$, 'exactly 8');
select pg_temp.fails($q$update settings set value='[{"n":"1","w":13},{"n":"2","w":13},{"n":"3","w":13},{"n":"4","w":13},{"n":"5","w":13},{"n":"6","w":13},{"n":"7","w":13},{"n":"8","w":13}]' where key='score_weights'$q$, 'total 100');
select pg_temp.fails($q$update settings set value='{"DLR":{"n":"x","next":"DST","promote":0.5,"hold":0.6,"q":2,"items":[{"n":"a","w":1,"lo":0,"hi":1,"min":0}]}}' where key='promotion_rules'$q$, 'promote score must be above hold');
select pg_temp.fails($q$update settings set value='{"DLR":{"n":"x","next":"DST","promote":0.8,"hold":0.6,"q":2,"items":[{"n":"a","w":0.5,"lo":0,"hi":1,"min":0}]}}' where key='promotion_rules'$q$, 'must total 1');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
update settings set value='[]' where key='score_weights';   -- policy hides the row from a non-Super user: nothing changes
reset role;
do $$ begin assert (select jsonb_array_length(value) from settings where key='score_weights')=8, 'weights unchanged after failed edits'; end $$;
-- a partner cannot read the policy settings
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin assert (select count(*) from settings where key in ('score_weights','promotion_rules'))=0, 'partners do not read scoring policy'; end $$;
reset role;

-- ===================== C. PROMOTION ASSESSMENTS =====================
-- Dealer rule: promote at 0.80, hold from 0.60, 2 quarters in a row, every gate must pass.
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0001','2026-Q2','[100,10,100,90,1]')$q$, 'Only Super Admin or Sales');          -- accounts view only
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0001','2026-Q2','[100,10,100,90,1]')$q$, 'Only Super Admin or Sales');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0001','2026Q2','[100,10,100,90,1]')$q$, 'Quarter looks like');
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0001','2026-Q2','[100,10,100]')$q$, 'needs 5 actual values');
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0001','2026-Q2','[100,10,100,90,"a"]')$q$, 'numbers or null');
select assess_promotion('ELP-DLR-0001','2026-Q2','[100,10,100,90,1]') as a1 \gset
do $$ declare r promotion_assessments; begin
  select * into r from promotion_assessments where partner_id='ELP-DLR-0001' and quarter='2026-Q2';
  assert r.weighted = 1 and r.gates_ok and r.quarters_ok = 1, 'full marks, gates pass, first quarter';
  assert r.state like 'Hold – needs 1 more quarter%', 'one quarter is not enough: ' || r.state;
  assert r.status = 'Recorded', 'a hold is only recorded, nothing to decide';
end $$;
select pg_temp.fails(format($q$select decide_promotion(%s,'Approved')$q$, :'a1'), 'Only Super Admin');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select decide_promotion(%s,'Approved')$q$, :'a1'), 'eligible and pending');                          -- a hold cannot be approved
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select assess_promotion('ELP-DLR-0001','2026-Q3','[100,10,100,90,1]') as a2 \gset
select set_config('t.a2', :'a2', false);
do $$ declare r promotion_assessments; begin
  select * into r from promotion_assessments where partner_id='ELP-DLR-0001' and quarter='2026-Q3';
  assert r.quarters_ok = 2 and r.state = 'Eligible for assessment' and r.status = 'Pending', 'two adjacent quarters at the promote score: eligible, pending management';
  assert (select type_code from partners where id='ELP-DLR-0001') = 'DLR', 'eligibility alone changes nothing';
end $$;
reset role;
-- a failed gate resets the chain (dealer 2): on-time payment 70% is below its gate even though the weighted score is 0.80
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select assess_promotion('ELP-DLR-0002','2025-Q3','[null,null,null,null,null]');
select assess_promotion('ELP-DLR-0002','2025-Q4','[100,10,70,90,1]');
select assess_promotion('ELP-DLR-0002','2026-Q1','[100,10,100,90,1]');
select assess_promotion('ELP-DLR-0002','2026-Q2','[100,10,100,90,1]') as b2 \gset
do $$ begin
  assert (select state from promotion_assessments where partner_id='ELP-DLR-0002' and quarter='2025-Q3')='Not enough data', 'no data is not a pass';
  assert (select state from promotion_assessments where partner_id='ELP-DLR-0002' and quarter='2025-Q4')='Hold and develop', 'a failed gate cannot be bought with other scores';
  assert (select quarters_ok from promotion_assessments where partner_id='ELP-DLR-0002' and quarter='2026-Q1')=1, 'the chain restarts after a failed gate';
  assert (select state from promotion_assessments where partner_id='ELP-DLR-0002' and quarter='2026-Q2')='Eligible for assessment', 'two clean quarters in a row';
end $$;
-- a weak quarter is a corrective plan
select assess_promotion('ELP-DLR-0002','2026-Q3','[60,0,70,50,0]');
do $$ begin assert (select state from promotion_assessments where partner_id='ELP-DLR-0002' and quarter='2026-Q3')='Corrective plan', 'below the hold score is a corrective plan'; end $$;
reset role;
-- management decides: only Super Admin; reasons are needed for reject and defer; one decision only
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails(format($q$select decide_promotion(%s,'Approved')$q$, :'a2'), 'Only Super Admin');                                 -- AI and staff recommend, management decides
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select decide_promotion(%s,'Rejected')$q$, :'b2'), 'reason');
select pg_temp.fails(format($q$select decide_promotion(%s,'Maybe','x y z')$q$, :'b2'), 'Decision must be');
select decide_promotion(:'b2','Rejected','not yet ready in the field');
select pg_temp.fails(format($q$select decide_promotion(%s,'Approved')$q$, :'b2'), 'eligible and pending');                            -- decided once
select pg_temp.fails($q$select assess_promotion('ELP-DLR-0002','2026-Q2','[100,10,100,90,1]')$q$, 'already decided');
reset role;
do $$ begin assert (select type_code from partners where id='ELP-DLR-0002')='DLR', 'a rejection changes nothing'; end $$;
-- approval promotes; the Partner ID stays; the partner is notified (dealer 1 moves to a free district first)
delete from territory_claims where partner_id='ELP-DLR-0001';
insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-0001','Gujarat','Rajkot',false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_promotion(:'a2','Approved','meets every gate');
reset role;
do $$ begin
  assert (select type_code from partners where id='ELP-DLR-0001')='DST', 'approval moves the partner up one step';
  assert (select count(*) from partners where id='ELP-DLR-0001')=1, 'the Partner ID is unchanged';
  assert (select count(*) from notifications where user_id='00000000-0000-0000-0000-000000000003' and title='You have moved up')>=1, 'the partner is told';
  assert (select count(*) from audit_log where table_name='promotion_assessments' and row_key=current_setting('t.a2'))>=2, 'assessment and decision are audited';
end $$;
-- an exclusive district blocks a promotion into a type that already has an exclusive holder (fixture ELP-DST-0001 holds Anand)
insert into partners(id,type_code,name,district,status) values ('ELP-DLR-9002','DLR','Local dealer','Anand','Active');
insert into territory_claims(partner_id,state,district,exclusive) values ('ELP-DLR-9002','Gujarat','Anand',false);
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select assess_promotion('ELP-DLR-9002','2026-Q2','[100,10,100,90,1]');
select assess_promotion('ELP-DLR-9002','2026-Q3','[100,10,100,90,1]') as c2 \gset
select pg_temp.fails(format($q$select decide_promotion(%s,'Approved')$q$, :'c2'), 'Territory conflict');
reset role;
do $$ begin assert (select type_code from partners where id='ELP-DLR-9002')='DLR', 'blocked promotion changes nothing'; end $$;

-- growth ladder: a partner sees only their own; staff may look up any partner
select pg_temp.as_user('00000000-0000-0000-0000-000000000004'); set role authenticated;
do $$ declare g jsonb; begin
  g := growth_ladder();
  assert g->>'partner_id' = 'ELP-DLR-0002' and (g->>'top')::boolean = false, 'own ladder';
  assert g->>'next_type' = 'DST' and jsonb_array_length(g->'criteria') = 5, 'next step and its five criteria';
  assert g->'latest'->>'quarter' = '2026-Q3', 'latest assessment shown';
end $$;
select pg_temp.fails($q$select growth_ladder('ELP-DLR-0001')$q$, 'only your own');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails($q$select growth_ladder('ELP-DLR-0001')$q$, 'not available for your role');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin assert growth_ladder('ELP-DLR-0001')->>'next_type' = 'STK', 'staff can look up a partner (now a Distributor, next is Circle Stockist)'; end $$;
reset role;

-- ===================== D. CREDIT STEP NEEDS THE SCORE =====================
-- ladder minimum for level 1 is 75. Dealer 2 is at 50 (above test), so it cannot even be proposed.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select pg_temp.fails($q$select propose_credit_change('partner','ELP-DLR-0002',1,'steady buyer')$q$, 'below the 75');
select record_partner_score('ELP-DLR-0002', current_date, '[0.8,0.8,0.8,0.8,0.8,0.8,0.8,0.8]', 'improved');
select propose_credit_change('partner','ELP-DLR-0002',1,'score now 80') as cp \gset
reset role;
-- the AI path obeys the same rule (service key: no user)
select set_config('request.jwt.claim.sub','',false);
select pg_temp.fails($q$select ai_propose_credit('partner','ELP-DLR-9002',1,'ai says so')$q$, 'permission denied|No verified');
reset role;
-- the score falls between proposal and approval: approval is refused
update settings set value = jsonb_set(value,'{enabled}','false') where key='pay_and_carry';
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select record_partner_score('ELP-DLR-0002', current_date, '[0.6,0.6,0.6,0.6,0.6,0.6,0.6,0.6]', 'dropped');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select pg_temp.fails(format($q$select decide_credit_change(%s,true,null)$q$, :'cp'), 'below the 75');
reset role;
do $$ begin assert (select credit_level from partners where id='ELP-DLR-0002')=0, 'credit stays shut while the score is low'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select record_partner_score('ELP-DLR-0002', current_date, '[0.8,0.8,0.8,0.8,0.8,0.8,0.8,0.8]', 'back up');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
select decide_credit_change(:'cp', true, 'score is 80');
reset role;
do $$ begin assert (select credit_level from partners where id='ELP-DLR-0002')=1, 'with the score and pay-and-carry off, the step opens'; end $$;
update settings set value = jsonb_set(value,'{enabled}','true') where key='pay_and_carry';

-- ===================== E. REPORTS AND EXPORTS =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select pg_temp.fails($q$select * from report_catalogue()$q$, 'for staff');
select pg_temp.fails($q$select run_report('partners')$q$, 'Unknown report|cannot run');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
do $$ begin
  assert (select count(*) from report_catalogue() where kind in ('invoices','collections','outstanding'))=0, 'warehouse does not see finance reports';
  assert (select count(*) from report_catalogue() where kind='inventory')=1, 'warehouse sees inventory';
end $$;
select pg_temp.fails($q$select run_report('invoices')$q$, 'cannot run this report');
select pg_temp.fails($q$select run_report('monthly_performance')$q$, 'cannot run this report');
select pg_temp.fails($q$select run_report('no_such_report')$q$, 'Unknown report');
select run_report('inventory');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000005'); set role authenticated;
select pg_temp.fails($q$select run_report('inventory')$q$, 'cannot run this report');
select pg_temp.fails($q$select run_report('orders', current_date, current_date - 1)$q$, 'start date is after');
do $$ begin
  assert jsonb_typeof(run_report('invoices'))='array', 'accounts runs finance reports';
  assert jsonb_typeof(run_report('outstanding'))='array';
  assert jsonb_typeof(run_report('collections', current_date - 30, current_date))='array';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select record_partner_score('ELP-DLR-0001', (date_trunc('month',current_date) - interval '2 months')::date, '[0.9,null,0.9,null,0.9,0.9,0.9,0.9]', 'partly verified');
do $$ declare r jsonb; begin
  assert (select count(*) from report_catalogue() where kind in ('invoices','collections','vendors'))=0, 'sales sees no finance or vendor reports';
  r := run_report('scorecards');
  assert jsonb_array_length(r) >= 3, 'scorecard rows exist';
  assert exists (select 1 from jsonb_array_elements(r) e where e->'Parameters'->>'Retail / dealer network development' = 'unverified'), 'unverified stays unverified in exports';
  assert jsonb_array_length(run_report('monthly_performance')) >= 2;
  assert jsonb_array_length(run_report('promotion')) >= 3;
  assert jsonb_array_length(run_report('partners')) >= 2;
  assert jsonb_array_length(run_report('partner_evolution')) >= 3;
  assert (run_report('partners')->0) ? 'PartnerID', 'column names are stable';
end $$;
select pg_temp.fails($q$select run_report('release_orders')$q$, 'cannot run this report');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare k record; n int := 0; begin
  for k in select * from report_catalogue() loop
    assert jsonb_typeof(run_report(k.kind))='array', 'every report runs for Super Admin: ' || k.kind;
    n := n + 1;
  end loop;
  assert n = 19, 'Super Admin sees all 19 reports, saw ' || n;
end $$;
reset role;
do $$ begin
  assert (select count(*) from audit_log where action='EXPORT' and table_name='report')>=10, 'every report run is audited';
  assert (select count(*) from audit_log where action='EXPORT' and row_key='inventory' and actor_role='warehouse')>=1, 'with the role of the person who ran it';
end $$;

-- ===================== F. ORDER PAYMENT GATE: Delivered cannot be forced either =====================
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select adjust_stock('N1', 20, 'build7 gate regression');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003'); set role authenticated;
select place_order('[{"sku":"N1","cartons":5}]') as og7 \gset
select set_config('t.og7', :'og7', false);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
select approve_order(:'og7');
reset role;
select pg_temp.fails(format($q$update orders set status='Delivered' where id=%L$q$, :'og7'), 'Payment gate|cannot move');
select pg_temp.fails(format($q$update orders set status='Payment Confirmed' where id=%L$q$, :'og7'), 'Payment gate');
select pg_temp.as_user('00000000-0000-0000-0000-000000000006'); set role authenticated;
select pg_temp.fails(format($q$select dispatch_order(%L,'GJ01','LR7','B7')$q$, :'og7'), 'Payment is not confirmed');
reset role;
do $$ begin assert (select status from orders where id=current_setting('t.og7'))='Approved', 'the order did not move without verified payment'; end $$;

select 'BUILD 7 DB TESTS PASSED' as result;
