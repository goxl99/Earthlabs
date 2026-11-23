-- EPDMS 019: every e-mail that needs an action carries a one-tap link. The link signs the person in (if needed) and opens the right screen.
create or replace function public.email_outbox_links() returns trigger language plpgsql as $$
declare base text := 'https://www.earthlabsproducts.com/partner/'; dest text; label text;
begin
  if new.body like '%https://www.earthlabsproducts.com/partner%' then return new; end if;
  if new.subject ilike 'Request for quotation%' then dest := '?next=/rfq/'; label := 'Open the RFQ and submit your quotation';
  elsif new.subject ilike 'Release order%' then dest := '?next=/vendor/'; label := 'Open the release order and acknowledge it';
  end if;
  if dest is not null then
    new.body := new.body || E'\n\n' || label || E':\n' || base || dest || E'\n\nFirst time? Open the link, choose "Approved partner without a login? Create an account" and use this e-mail address.\n\nEarthLabs Partner Network';
  end if;
  return new;
end $$;
drop trigger if exists email_outbox_links_t on public.email_outbox;
create trigger email_outbox_links_t before insert on public.email_outbox for each row execute function public.email_outbox_links();

create or replace function public.email_outbox_track_ref() returns trigger language plpgsql as $$
declare r text;
begin
  r := (regexp_match(new.body, 'Reference number : (APP-[0-9]{4}-[0-9]+)'))[1];
  if r is not null then new.body := replace(new.body, '/partner/track/' , '/partner/track/?ref=' || r); end if;
  return new;
end $$;
drop trigger if exists email_outbox_track_ref_t on public.email_outbox;
create trigger email_outbox_track_ref_t before insert on public.email_outbox for each row execute function public.email_outbox_track_ref();
