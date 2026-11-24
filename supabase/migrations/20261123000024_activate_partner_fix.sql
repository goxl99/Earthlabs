-- Fix: a PL/pgSQL variable named code clashed with certificates.code inside activate_partner.
create or replace function public.activate_partner(pid text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare ag public.agreements; ccode text; cno text; mail text; nm text;
begin
  if not public.is_super() then raise exception 'Only Super Admin can approve the signed MOU'; end if;
  select * into ag from public.agreements where partner_id = pid and status = 'Signed' order by signed_at desc limit 1;
  if ag.id is null then raise exception 'There is no signed MOU for this partner yet'; end if;
  update public.agreements set approved_by = auth.uid(), approved_at = now() where id = ag.id and approved_at is null;
  update public.partners set status = 'Active' where id = pid and status = 'Agreement Pending';
  select c.code into ccode from public.certificates c where c.partner_id = pid and not c.revoked order by c.issued_at desc limit 1;
  if ccode is null then insert into public.certificates(partner_id, agreement_id) values (pid, ag.id) returning certificates.code into ccode; end if;
  select c2.cert_no into cno from public.certificates c2 where c2.code = ccode;
  perform set_config('epdms.approving','on',true);
  update public.applications set status = 'Approved' where partner_id = pid and status in ('MOU signed','Agreement pending');
  select p.email, p.name into mail, nm from public.partners p where p.id = pid;
  if mail is not null then insert into public.email_outbox(to_email, subject, body) values (mail, 'Your EarthLabs partner certificate - ' || cno,
    'Dear ' || nm || E',\n\nYour MOU is approved by EarthLabs and your partnership is now active.\n\nPartner ID         : ' || pid || E'\nCertificate number : ' || cno ||
    E'\n\nView and print your certificate: https://www.earthlabsproducts.com/partner/certificate/?code=' || ccode ||
    E'\nAnyone can verify it at: https://www.earthlabsproducts.com/partner/verify/?code=' || ccode || E'\n\nEarthLabs Partner Network'); end if;
  return ccode;
end $$;
