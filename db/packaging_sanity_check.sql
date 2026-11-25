-- Stop packaging recipes with absurd quantities (e.g. 45 boxes per sachet, or a price typed into qty).
alter table public.product_packaging drop constraint if exists product_packaging_sane_qty;
alter table public.product_packaging add constraint product_packaging_sane_qty check (qty > 0 and per_units >= 1 and qty / per_units <= 50);
