-- EPDMS 010: e-sign with Leegality. The Edge Functions esign-send and esign-webhook call these two functions with the service key.
-- Nobody signed in through the app can call them; the signed copy can only arrive through a webhook whose MAC was verified.
alter table public.agreements
  add column esign_provider text, add column esign_document_id text, add column esign_url text, add column esign_requested_at timestamptz;
create unique index agreements_esign_doc_idx on public.agreements(esign_document_id) where esign_document_id is not null;

-- called after Leegality accepted the document: agreement becomes Sent, partner is told
create or replace function public.esign_started(aid uuid, docid text, url text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = aid for update;
  if a.id is null then raise exception 'Agreement not found'; end if;
  if a.status = 'Signed' then raise exception 'This agreement is already signed'; end if;
  if length(trim(coalesce(docid,''))) = 0 then raise exception 'Missing document id'; end if;
  update public.agreements set esign_provider = 'leegality', esign_document_id = docid, esign_url = url, esign_requested_at = now(),
         status = 'Sent', sent_at = coalesce(sent_at, now()) where id = aid;
  perform public.notify_partner(a.partner_id, 'Your EarthLabs agreement is ready to sign', 'Leegality has sent you the agreement to sign by e-sign. After you sign, your account is activated.', '/partner/agreements/');
end $$;

-- called by the verified webhook when every signer has signed: same result as Super Admin recording the signed copy
create or replace function public.esign_completed(docid text, path text) returns text
language plpgsql security definer set search_path = public as $$
declare a public.agreements; code text;
begin
  select * into a from public.agreements where esign_document_id = docid for update;
  if a.id is null then raise exception 'No agreement for this document'; end if;
  if a.status = 'Signed' then return null; end if;       -- webhooks can arrive twice
  if path is null or path like '%..%' or split_part(path, '/', 1) <> a.partner_id then raise exception 'Bad file path'; end if;
  update public.agreements set status = 'Signed', signed_at = now(), signed_path = path where id = a.id;
  update public.partners set status = 'Active' where id = a.partner_id and status = 'Agreement Pending';
  insert into public.certificates(partner_id, agreement_id) values (a.partner_id, a.id) returning certificates.code into code;
  perform public.notify_partner(a.partner_id, 'Welcome to EarthLabs', 'Your agreement is signed and your partner certificate is issued.', '/partner/agreements/');
  return code;
end $$;
revoke execute on function public.esign_started(uuid,text,text), public.esign_completed(text,text) from public, anon, authenticated;
