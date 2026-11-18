# EarthLabs Partner & Distribution Management System (EPDMS) — 5-day build plan

Status file: update the checkboxes below at the end of every working session. A new session must read this file first.

## Decisions (confirmed by Viraj, 18 Nov 2026)
- Stack: Next.js (static export) + TypeScript + Supabase (Postgres, Auth, Storage, Edge Functions). Target: 1,000+ users.
- Code lives in this repo, folder `partner/` (app) and `supabase/` (database). The repo is PUBLIC: never commit secrets, real prices, margins or partner data. Real data lives only in Supabase.
- Public address: www.earthlabsproducts.com/partner redirects to the hosted app (same method as /batch).
- Reference: the clickable review prototype is saved at `partner/prototype/review-prototype.html`. It is the specification for screens and rules.
- Mandatory rules: only Super Admin controls products, pricing, margins, schemes; AI recommends, management approves; one permanent Partner ID for life; full audit trail; pay-and-carry (no credit at launch); order moves on only after payment is confirmed; schemes hidden until disclosed.

## Blocker to clear first (needs Viraj)
The Supabase organisation `earthlabs.work` has reached its free-project limit, so a dedicated project could not be created. Choose one: (a) upgrade the org to Pro (recommended for 1,000+ users, daily backups), (b) pause another free project, (c) reuse project `hgdltduqwayfepzuurke` with a separate `epdms` schema (not recommended: shared with the batch app). Until then, migrations are developed and tested on a local Postgres.

## Architecture
- Browser app (static export) talks to Supabase with the publishable key. Security is enforced by Postgres row-level security, never by the front end.
- Roles: super_admin, sales, accounts, warehouse, dealer, distributor, vendor. A `profiles` row links each auth user to a role and to a partner or vendor.
- Writes that need secrets or third parties (e-mail, WhatsApp, AI, payment gateway, PDF/MOU) run in Supabase Edge Functions.
- Scale for 1,000+ users: indexed foreign keys, paginated lists (50 rows), no unbounded selects, storage for documents, nightly backup, connection pooling by default.

## Scope: the WHOLE portal (not only phase 1)
Everything in the review prototype is in scope and must ship. Each line is a module with its done-box. Pages in brackets are the prototype pages to match.

**Internal portal (Super Admin, Sales, Accounts, Warehouse)**
- [ ] Dashboard by role [dashboard]
- [ ] Approvals centre: catalogue, scheme, procurement, credit, payments [appr]
- [ ] Applications: review, more-info, field verification, approve/reject, permanent Partner ID [applications]
- [ ] Territory Explorer: Gujarat district map, coverage, exclusivity, white-space [territory]
- [ ] Partners: list, profile, status, territories, ledger [partners]
- [ ] Agreements and certificates: MOU flow, custom MOU template upload, send for signing, certificate with public verify [agree]
- [ ] Performance Matrix: monthly score, weights, promotion/hold rules [perf]
- [ ] Products and pricing: SKU add/retire, partner-wise SKUs, SKU-wise MRP and margins, slabs, GST, policies [catalog]
- [ ] Schemes: partner-wise, engine, budget, disclosure control
- [ ] Orders: workflow, payment gate, hold/cancel, lead time [orders]
- [ ] Inventory and dispatch, linked to the batch system (read batch/QC data from the batch Supabase project through a secured Edge Function) [inv]
- [ ] Procurement and raw materials: inventory, vendor stock reports, release orders, lead-time rules [proc]
- [ ] Invoices and payments: invoices, UTR/advice review, ledger, credit notes [fin]
- [ ] AI Intelligence: recommendations (credit, schemes, reorder, promotion), management approves [ai]
- [ ] Vendors: master, performance, vendor credit [vendors]
- [ ] Reports and exports (CSV/PDF) [reports]
- [ ] Notifications: in-app, email, WhatsApp-ready hooks [notifs]
- [ ] Users and access: roles, permissions per module, module on/off switches, registration-type switches [users]
- [ ] Audit trail viewer [audit]

**Partner portal (dealer, distributor)**
- [ ] Dashboard, Place an order (price, schemes, hints, lead time), My orders, payment details (UTR/advice), Invoices and ledger
- [ ] My performance, Growth ladder, Agreement and certificate, My network, Offers and credit

**Vendor portal**
- [ ] Dashboard, quotes, purchase orders, payments, performance, stock reports, release orders

**Public website area**
- [ ] Home with registration types (only dealer and distributor on; installation partner behind switch), registration wizard, application tracking, certificate verification

**System-wide rules (all 15 from the original spec) are enforced in the database or an Edge Function, each with a test.**

## Session protocol (every scheduled or manual session MUST do this)
1. Start: read this file and `STATUS.md`.
2. Work the unchecked boxes. Finish with tests green (database tests, typecheck, unit tests, build).
3. End: update `partner/docs/STATUS.md` (module table, percent complete, what changed, what is blocked), commit and push to `partner-platform`.
4. Tell Viraj: call PushNotification with one line "EPDMS build N done: X% complete. Next: ..." and end the reply with a short progress report (done this session, overall percent, blocked items, next session). Do this even when little was achieved.

## Day-by-day (two working runs per day)
### Day 1 — Foundation (done today)
- [x] Plan, repo folders, prototype copied
- [x] Next.js app skeleton, brand theme
- [x] Migrations 001-004 (identity, partners, catalogue, schemes, approvals, settings) with local security tests
- [x] CI, branch, pull request
- [ ] Day 1B (afternoon 18 Nov): users and access module, module switches, audit viewer, notifications table and in-app bell, public home and registration wizard

### Scope: the WHOLE system, all four phases (every module in the review prototype)
Each session works through the unchecked boxes of its day, then continues into the next day's items if time remains. Nothing is "phase 1 only". A module is done only when it meets the definition of done below.

### Day 2 — Partners, territories, agreements, public site
- [ ] Sign-in, role shell and navigation per role; Users & Access (role matrix, activate users, registration-type switches)
- [ ] Public website: home, registration wizard (dealer and distributor; installation partner behind the switch), application tracking, certificate verification
- [ ] Applications review: more-info, field verification, reject with reason, approve with permanent Partner ID
- [ ] Partners list and profile, territory exclusivity check, Territory Explorer (Gujarat district map and coverage gaps)
- [ ] Agreements: MOU generation, custom MOU template upload with field mapping, send for signing, signed copy storage, certificates with QR verification
- [ ] Notifications (in-app plus e-mail through an Edge Function)

### Day 3 — Catalogue, pricing, schemes, orders
- [ ] SKU catalogue add/retire/restore, partner-wise SKU access, SKU-wise MRP and margins, tier price list, margin slabs
- [ ] Scheme engine (percent, flat, free cartons, kit; audience, SKU scope, minimums, stack rules, budget caps), partner-wise schemes, disclosure control
- [ ] Partner portal: dashboard, place order (own prices only, scheme hints, lead-time estimate), my orders
- [ ] Order workflow (approval, payment gate, dispatch, delivery), hold and cancel with reasons, audit
- [ ] Inventory and dispatch: stock, reservations, link to the Batch Management system (QC-approved batches), dispatch notes

### Day 4 — Money, vendors, procurement, intelligence
- [ ] Invoices (GST split CGST/SGST/IGST), credit notes, ledger, manual payment entry
- [ ] Partner payment proof (UTR or payment advice upload to Storage, duplicate-UTR block), Accounts confirmation gate
- [ ] Vendors and vendor portal: stock reports, quotes, purchase orders, release orders, vendor payments, vendor performance
- [ ] Procurement: raw-material inventory, reorder planning from production plan, lead-time settings, auto-email to vendor, approval limits
- [ ] Credit ladder (pay-and-carry first; AI proposes, Super Admin approves) for partners and vendors
- [ ] Performance Matrix: monthly score, weights, promotion/hold rules, growth ladder
- [ ] AI Intelligence via Edge Function (Claude API key as a Supabase secret): promotion, scheme, procurement, credit recommendations; management approves
- [ ] Approvals centre for all change requests; Reports and Exports (CSV/PDF); Audit trail viewer

### Day 5 — Hardening, launch preparation, hand-over
- [ ] Security review of every RLS policy for every role, attack tests, rate limits, storage rules
- [ ] Performance and load test (1,000 partners, 50,000 orders), index review
- [ ] Accessibility and mobile pass on every screen; browser test of the main journeys per role
- [ ] User guide, hand-over checklist, backups and restore drill, deploy steps for /partner redirect (executed only after Viraj approves)

## Definition of done (every module)
Works for every role it applies to, protected by RLS, audited, covered by a test, and checked against the prototype.
