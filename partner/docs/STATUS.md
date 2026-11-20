# EPDMS progress status
Updated at the end of every build session. Overall = modules done / 33.

**Overall: 20 of 33 modules done (61%)** · last update: 20 Nov 2026, build 5 (invoices, credit notes, ledger, payment proof, audit viewer). Earlier: build 3 (public landing, MOU filling, certificate QR, catalogue and prices, schemes, orders with payment gate, inventory and dispatch). "Done" = built and database rules tested locally; screens are not yet click-tested against a live Supabase project (blocked, see below).

| # | Module | Day | Status |
|---|---|---|---|
| 1 | Database foundation, roles, audit trail, security tests | 1 | Done |
| 2 | App shell, role navigation, CI | 1 | Done |
| 3 | Partner IDs, territory rule, SKU access, hidden schemes (database rules) | 1 | Done |
| 4 | Users & Access, registration-type switches | 2 | Done |
| 5 | Public website: landing, registration wizard, tracking | 2 | Done |
| 6 | Certificate verification (QR) | 2 | Done: public /verify page, database function, printable certificate with QR image |
| 7 | Applications review and approval | 2 | Done |
| 8 | Partners list and profile | 2 | Done |
| 9 | Territory Explorer (map) | 2 | Done: district grid, coverage, white-space, exclusivity check (list view, not a drawn map) |
| 10 | Agreements, MOU, custom MOU upload, e-sign | 2 | Mostly done: template upload and field mapping, .docx template filled with partner data, send, signed copy, activation gate, certificate. Left: external e-sign provider (needs Viraj's choice and an account); PDF/ODT templates are sent as uploaded |
| 11 | Notifications | 2 | Done: in-app, e-mail outbox and send-emails Edge Function (needs secrets once Supabase exists) |
| 12 | Catalogue, SKU add/retire/restore, partner-wise access | 3 | Done: Super Admin only, margin required before a SKU goes active, retired SKU cannot return to draft |
| 13 | SKU-wise MRP and margins, price list | 3 | Done: slabs, SKU overrides, staff price list, partner sees only own price |
| 14 | Scheme engine, partner-wise schemes, disclosure | 3 | Done: percent, flat, free cartons, kit; audience, minimums, first-order, stacking, budget caps, hidden until disclosed |
| 15 | Partner portal: dashboard, order, my orders | 3 | Done: own prices, scheme hints, lead-time estimate, order history with timeline |
| 16 | Order workflow with payment gate | 3 | Done: approve, accounts confirms payment (duplicate UTR blocked), warehouse dispatches, hold/cancel with reason, audit |
| 17 | Inventory, dispatch, batch-system link | 3 | Done except live link: stock, reservations, logged adjustments, dispatch notes. `batch-qc` Edge Function written, needs BATCH_* secrets and a read-only view in the batch project |
| 18 | Invoices, credit notes, ledger | 4 | Done: CGST/SGST inside Gujarat, IGST outside, amounts copied from the database-priced order, append-only ledger, credit notes capped at the invoice, manual payment entry |
| 19 | Payment proof (UTR / advice) and Accounts confirmation | 4 | Done: partner reports UTR and uploads advice to own folder, duplicate UTR blocked everywhere, only Accounts confirms, order moves on only through the payment gate |
| 20 | Vendor portal | 4 | Not started |
| 21 | Procurement, raw materials, release orders, lead times | 4 | Not started |
| 22 | Credit ladder (pay-and-carry first) | 4 | Not started |
| 23 | Performance Matrix, growth ladder | 4 | Not started |
| 24 | AI Intelligence (Edge Function) | 4 | Not started |
| 25 | Approvals centre | 4 | Not started |
| 26 | Reports and exports | 4 | Not started |
| 27 | Audit trail viewer | 4 | Done: Super Admin screen, filter by table and record, before/after view |
| 28 | Security review and attack tests | 5 | Not started |
| 29 | Load test (1,000 partners, 50,000 orders) | 5 | Not started |
| 30 | Accessibility, mobile, browser journeys | 5 | Not started |
| 31 | User guide, hand-over, backup drill | 5 | Not started |
| 33 | Architecture review and hardening (bootstrap, audit immutability, flood guard, storage rules, security headers, health probe) | 1 | Done |
| 32 | Go-live: Supabase project, deploy, /partner redirect | 5 | Blocked: needs Supabase upgrade and Viraj's approval |

## Blockers
- Supabase `earthlabs.work` org is at its free-project limit. Upgrade or pause a project so `earthlabs-partner-platform` can be created.
- Deploy and the www.earthlabsproducts.com/partner redirect need Viraj's approval.

## Build 2 notes (19 Nov 2026)
- Migration 007 added. Rules tested: exclusive district per partner type, no sharing of exclusive districts, MOU template Super Admin only with allowed fields, one open agreement per partner, partner active only after signed agreement, certificate public verify (revoked is invalid), private notifications, outbox hidden from users.
- Not run against a live Supabase project (still blocked). add_repo tool was not available; the repo was already cloned.

## Build 3 notes (19 Nov 2026)
- Migration 008 added (new file only). Tests in `supabase/tests/build3_test.sql` (run by run_local_tests.sh): SKU activation needs margins, retire/restore, staff-only price list, scheme hidden until disclosed, who may disclose, stack and budget and first-order rules, order price decided by the database, reservation and short-stock lead time, payment gate (approve, part payment, duplicate UTR, role limits, no status jumps, no direct writes), credit exception only when pay-and-carry is off, mandatory batch reference switch, cancel returns stock and scheme budget, stock changes only through logged functions, dashboard numbers per role.
- App: landing page, catalogue and price list, schemes, orders (partner and staff), inventory and dispatch, dashboard, certificate print with QR, filled MOU download. 9 new unit tests (MOU filling, QR, order buttons per role).
- Not done / blocked: e-sign provider (needs decision), live batch link (needs secrets and batch-side view; the batch app files were not touched), screens not click-tested against live Supabase (still blocked on the project).
- Day 4 items already partly in place: duplicate-UTR block and Accounts confirmation exist for order payments; partner-side proof upload, invoices, credit notes and ledger are not built.
- add_repo was not needed: goxl99/earthlabs was already in scope and cloned.

## Build 4 notes (20 Nov 2026)
- Re-verified all Day 3 items on a fresh local Postgres: migrations 001-008, rls_test and build3_test pass; typecheck, 17 unit tests and the static build (PARTNER_BASE_PATH=/partner) pass. No Day 3 box was open, so no code changed.
- Orders are priced only by the database function; no client price is trusted.
- Still blocked: Supabase project (org at free-project limit), e-sign provider choice, live batch link secrets, deploy and /partner redirect (need Viraj).
- add_repo tool was again not available; repo already cloned and in scope.

## Build 5 notes (20 Nov 2026)
- Day 3 had no open box. Left over from Day 2: only the external e-sign provider (needs Viraj's choice and an account). So this run started Day 4.
- Migration 009 (new file only): ledger (append-only, one UTR once), invoices and invoice lines, credit notes, manual payment entry, payment proofs with confirm/reject, dashboard queue numbers. Order cancel is refused while an invoice is not fully credited.
- Tests: `supabase/tests/build4_test.sql` (wired into run_local_tests.sh) covers roles, GST split both ways, invoice amounts equal the database-priced order, immutability, visibility per partner, credit-note cap, duplicate UTR across order payments, manual payments and proofs, confirmation gate, reject/resubmit, audit. 6 new unit tests (23 in total).
- App: /invoices (Accounts: proof queue, issue invoice, credit note, record payment, ledger by partner; partners: own invoices, credit notes, ledger), "I have paid" with advice upload on My orders, /audit.
- Not started (Day 4 remainder): vendors and vendor portal, procurement, credit ladder, Performance Matrix, AI Intelligence, Approvals centre completion, Reports and exports.
- Still blocked: Supabase project (org at free-project limit), e-sign provider, live batch link secrets, deploy and /partner redirect (need Viraj). Screens are not click-tested against a live Supabase project.
- add_repo tool was not available; the repo was already cloned and in scope. Invoice numbers use a plain sequence (not yet a financial-year format; confirm with the accountant before go-live).
