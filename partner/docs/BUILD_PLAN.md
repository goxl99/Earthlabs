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

## Day-by-day (two working runs per day)
### Day 1 — Foundation (done today)
- [x] Plan, repo folders, prototype copied
- [x] Next.js app skeleton, brand theme
- [x] Migrations 001-004 (identity, partners, catalogue, schemes, approvals, settings) with local security tests
- [x] CI, branch, pull request
- [ ] Day 1B (afternoon 18 Nov): users and access module, module switches, audit viewer, notifications table and in-app bell, public home and registration wizard

### Day 2 — Partners and agreements
- [ ] 2A: sign-in and role shell finished, applications review and approval, partner list and profile, partner portal dashboard
- [ ] 2B: Territory Explorer map, exclusivity, agreements flow, MOU template upload and send for signing, certificates with public verification

### Day 3 — Catalogue, schemes, orders
- [ ] 3A: SKU catalogue, partner-wise access, SKU-wise margins editor, slabs and GST, approvals for non-super changes
- [ ] 3B: scheme engine and disclosure, partner ordering with lead time and hints, order workflow, hold/cancel, My orders

### Day 4 — Money, supply, intelligence
- [ ] 4A: invoices, UTR/advice upload and Accounts confirmation gate, ledger, credit notes, credit ladder (pay and carry first)
- [ ] 4B: vendors and vendor portal, stock reports, raw materials, release orders, lead-time rules, batch-system link, inventory and dispatch, AI Intelligence Edge Function, Performance Matrix, reports and exports

### Day 5 — Hardening and launch prep
- [ ] 5A: security review of every policy and role, synthetic load (1,000 partners, 50,000 orders), indexes
- [ ] 5B: end-to-end test of every flow, user guide, hand-over checklist, deploy steps, Supabase migration and advisors if the project exists

## Definition of done (every module)
Works for every role it applies to, protected by RLS, audited, covered by a test, and checked against the prototype.
