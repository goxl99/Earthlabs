-- EPDMS 019b: migrations 017-024 (staged onboarding, e-mails, certificates) created helper and trigger functions that anon could execute.
-- Only submit_application, track_application and verify_certificate are meant for the public (build 8 attack test). Additive and idempotent.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('applications_set_ref','applications_mail_t','email_outbox_links','email_outbox_track_ref','link_confirmed_user','certificates_no_t','application_signed_t')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);   -- trigger functions are only ever fired by their triggers
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'required_docs'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);                  -- signed-in users and the service role keep it
    execute format('grant execute on function %s to authenticated', f.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;
end $$;
