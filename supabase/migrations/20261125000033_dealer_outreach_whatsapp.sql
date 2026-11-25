-- EPDMS 033: remember when staff opened WhatsApp for a lead, and clean up AI notes that leaked into drafts.
alter table public.dealer_leads add column if not exists wa_at timestamptz;
grant update (wa_at) on public.dealer_leads to authenticated;

-- Earlier AI-found leads that still wait for review: drop bracketed source notes (for example "(Justdial lists it as ...)") from the products text and the draft.
update public.dealer_leads set
  products = nullif(btrim(regexp_replace(products, '\s*\([^)]*\)', '', 'g')), ''),
  body = regexp_replace(body, '\s*\([^)]*(justdial|indiamart|sulekha|tradeindia|exportersindia)[^)]*\)', '', 'gi')
where status = 'Found' and source = 'ai_search';
