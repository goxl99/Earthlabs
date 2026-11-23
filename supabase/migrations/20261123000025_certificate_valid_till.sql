-- Certificates carry a "valid till" date: issue date + MOU term (one, two or three years; one year when not set).
drop function if exists public.verify_certificate(text);
create function public.verify_certificate(c text)
returns table(valid boolean, partner_id text, partner_name text, type_name text, district text, issued_at timestamptz, cert_no text, address text, state text, company text, company_address text, valid_till timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select (not x.revoked and p.status = 'Active' and x.issued_at + make_interval(years => coalesce((select case a.mou_fields->>'term_years' when 'two' then 2 when 'three' then 3 else 1 end from public.agreements a where a.id = x.agreement_id), 1)) > now()),
         p.id, p.name, t.name, p.district, x.issued_at, x.cert_no, p.address, p.state,
         (select value from public.company_profile where key='legal_name'), (select value from public.company_profile where key='address'),
         x.issued_at + make_interval(years => coalesce((select case a.mou_fields->>'term_years' when 'two' then 2 when 'three' then 3 else 1 end from public.agreements a where a.id = x.agreement_id), 1))
  from public.certificates x join public.partners p on p.id = x.partner_id join public.partner_types t on t.code = p.type_code
  where x.code = upper(trim(c)) $$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
