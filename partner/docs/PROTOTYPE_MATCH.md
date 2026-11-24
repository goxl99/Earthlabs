# Matching the build to the review prototype

Reference: `partner/prototype/review-prototype.html` (the approved prototype). Rule for conflicts: where a later decision differs
from the prototype (documents asked after first review, Leegality signing, Institutional hidden behind a switch, pay-and-carry),
the later decision wins and the screen otherwise follows the prototype.

## Done (branch `epdms-match-prototype`)
- Design system: the prototype's full stylesheet is now `src/app/globals.css` (type, cards, KPI tiles, tables, badges, tabs, forms, drawers, modals, steps, hero and path cards).
- App shell: top bar with brand, portal switch and user; grouped side menu with icons and the prototype's labels (`src/lib/roles.ts`, `src/components/Shell.tsx`).
- Public site: home (hero, paths, journey, sign-in), registration wizard (Account, Business, Location, Review), tracking with step bar, certificate verification.
- Dashboard: prototype layout and tiles for the numbers the database already provides; partner welcome screen with quick actions.
- All staff screens: prototype subtitle line, compact action buttons, primary and red button variants, tab bars.

## Still different from the prototype (needs data or new components, not just styling)
- Dashboard: charts (invoiced vs collected, target vs achieved), top/bottom 5 partners, promotion eligibility, operations watch, territory performance. Needs new read functions in the database.
- Detail drawers: the prototype opens right-hand drawers (application review with AI summary and completeness, partner profile, order, agreement). The build uses inline buttons and browser prompt boxes (`prompt()`), which should become modals.
- Territory Explorer: prototype has a drawn Gujarat map with markers; the build is a district list.
- Agreements: prototype MOU document preview and certificate layout with step bar.
- Partner portal: "My network" (distributor) and "Offers & credit" screens are not built.
- Vendor portal: RFQs and quotations, purchase orders and delivery, invoices and payments, My performance are not built (stock report and release orders exist).
- "Review guide" sign-off page is prototype-only and is not meant to ship.
- Screens are not click-tested against the live Supabase project (needs a test login).
