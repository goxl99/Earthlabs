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

## Day-by-day
### Day 1 — Foundation (this session)
- [x] Plan, repo folders, prototype copied
- [x] Next.js app skeleton, brand theme (Dark Teal #13595a, Turquoise #239a9e, Cream #fffcf2, Playfair Display + Open Sans)
- [x] Migration 001 identity + audit; 002 partners + territories; 003 catalogue + margins + access; 004 schemes + approvals + settings
- [x] Row-level-security tests against local Postgres
- [x] CI (typecheck, lint, build, unit tests)
- [ ] Branch `partner-platform` pushed, pull request opened

### Day 2 — Partners
- [ ] Sign-in, role shell and navigation per role
- [ ] Public registration wizard (dealer and distributor only; installation partner behind admin switch)
- [ ] Applications review, approval, permanent Partner ID
- [ ] Partner list, profile, territory exclusivity check, agreements and MOU template upload

### Day 3 — Catalogue and orders
- [ ] SKU catalogue add/retire, partner-wise access, SKU-wise MRP and margins
- [ ] Scheme engine and partner-wise schemes, disclosure control
- [ ] Partner ordering with lead-time estimate, order workflow and audit

### Day 4 — Money and supply
- [ ] Invoices, UTR / payment advice upload, Accounts confirmation gate
- [ ] Vendors, stock reports, raw-material inventory, release orders, lead-time settings
- [ ] Approvals centre, credit ladder (Super Admin approves), AI recommendations through an Edge Function

### Day 5 — Hardening and launch
- [ ] Performance and load test (1,000 concurrent partner sessions), index review
- [ ] Security review of every RLS policy, backups, rate limits
- [ ] Deploy (GitHub Actions build), redirect www.earthlabsproducts.com/partner, Supabase Auth URL settings
- [ ] User guide, hand-over checklist

## Definition of done (every module)
Works for every role it applies to, protected by RLS, audited, covered by a test, and checked against the prototype.
