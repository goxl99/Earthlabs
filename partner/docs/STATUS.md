# EPDMS progress status
Updated at the end of every build session. Overall = modules done / 32.

**Overall: 7 of 32 modules done (22%)** · last update: 18 Nov 2026, build 1 (partners). "Done" = built and database rules tested locally; screens are not yet click-tested against a live Supabase project (blocked, see below).

| # | Module | Day | Status |
|---|---|---|---|
| 1 | Database foundation, roles, audit trail, security tests | 1 | Done |
| 2 | App shell, role navigation, CI | 1 | Done |
| 3 | Partner IDs, territory rule, SKU access, hidden schemes (database rules) | 1 | Done |
| 4 | Users & Access, registration-type switches | 2 | Done |
| 5 | Public website: registration wizard, tracking (landing page still to do) | 2 | Done (landing page pending) |
| 6 | Certificate verification (QR) | 2 | Not started |
| 7 | Applications review and approval | 2 | Done |
| 8 | Partners list and profile | 2 | Done |
| 9 | Territory Explorer (map) | 2 | Not started |
| 10 | Agreements, MOU, custom MOU upload, e-sign | 2 | Not started |
| 11 | Notifications | 2 | Not started |
| 12 | Catalogue, SKU add/retire, partner-wise access | 3 | Not started |
| 13 | SKU-wise MRP and margins, price list | 3 | Not started |
| 14 | Scheme engine, partner-wise schemes, disclosure | 3 | Not started |
| 15 | Partner portal: dashboard, order, my orders | 3 | Not started |
| 16 | Order workflow with payment gate | 3 | Not started |
| 17 | Inventory, dispatch, batch-system link | 3 | Not started |
| 18 | Invoices, credit notes, ledger | 4 | Not started |
| 19 | Payment proof (UTR / advice) and Accounts confirmation | 4 | Not started |
| 20 | Vendor portal | 4 | Not started |
| 21 | Procurement, raw materials, release orders, lead times | 4 | Not started |
| 22 | Credit ladder (pay-and-carry first) | 4 | Not started |
| 23 | Performance Matrix, growth ladder | 4 | Not started |
| 24 | AI Intelligence (Edge Function) | 4 | Not started |
| 25 | Approvals centre | 4 | Not started |
| 26 | Reports and exports | 4 | Not started |
| 27 | Audit trail viewer | 4 | Not started |
| 28 | Security review and attack tests | 5 | Not started |
| 29 | Load test (1,000 partners, 50,000 orders) | 5 | Not started |
| 30 | Accessibility, mobile, browser journeys | 5 | Not started |
| 31 | User guide, hand-over, backup drill | 5 | Not started |
| 32 | Go-live: Supabase project, deploy, /partner redirect | 5 | Blocked: needs Supabase upgrade and Viraj's approval |

## Blockers
- Supabase `earthlabs.work` org is at its free-project limit. Upgrade or pause a project so `earthlabs-partner-platform` can be created.
- Deploy and the www.earthlabsproducts.com/partner redirect need Viraj's approval.
