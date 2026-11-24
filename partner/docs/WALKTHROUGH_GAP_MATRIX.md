# Walkthrough vs build: gap matrix (branch epdms-walkthrough-fix)

Reference: EarthLabs_EPDMS_Complete_Walkthrough.html (47 pages, 7 roles, journeys F1 to F6).
Build audited: branch epdms-match-prototype at 3682a91, plus this branch.
Classes: A exact, B partial, C incorrect, D missing, E broken. **Class is from code and the build's own notes; no screen has yet been compared pixel by pixel or click-tested against the live project.** Treat A as "route and logic present", not "verified".

## Internal portal (19)
| Walkthrough screen | Build route | Class | Gap / action | Status |
|---|---|---|---|---|
| Review guide | none (prototype-only, not to ship) | n/a | Intentionally not built | Closed |
| Dashboard | /dashboard | B | Missing charts (invoiced vs collected, target vs achieved), top/bottom 5, promotion eligibility, operations watch, territory performance, category and cluster filters | Pending |
| Approvals | /approvals | B | Tabs All/Procurement/Credit/Schemes/Catalogue/Other; reject now uses a modal. Performance decisions not in queue | In progress |
| Applications | /applications | B | Review is inline buttons, walkthrough has a drawer with AI summary, completeness, field-verification record and Approve modal (category, territory, exclusivity, template, term, target). Reasons now use modals | In progress |
| Territory Explorer | /territory | B | District list, not the drawn Gujarat map; no clusters/circles/regions, colour modes, allocation tool | Pending |
| Partners | /partners, /partners/view | B | Profile drawer tabs (Overview, Agreement, Orders, Ledger, Performance, History), suspend, export directory. Territory assignment now a modal | In progress |
| Agreements & Certificates | /agreements | B | MOU preview and certificate layout, edit commercial terms, submit for management review | Pending |
| Partner Performance Matrix | /performance | B | Scorecard drawer, export scorecards. Promotion decisions now use confirm modals | In progress |
| Products & Pricing | /catalogue, /schemes | B | Tabs per walkthrough (Catalogue, SKU-wise margins, Partner-wise SKUs, Price list, Schemes & GST, Policies & weights) | Pending |
| Orders | /orders | B | Hold, cancel, pay and dispatch now modals with validation | In progress |
| Inventory & Dispatch | /inventory | B | Batches, dispatches, traceability tabs; stock adjust now a modal | In progress |
| Procurement & Raw Materials | /procurement | B | 11 dialogs converted. Missing: production plan / BOM tab, batch reconcile, AI assistant tab | In progress |
| Invoices & Payments | /invoices | B | Payment review, record payment, credit note now modals. GST invoice modal (full or partial) not built | In progress |
| AI Intelligence | /ai | B | Walkthrough has 5 question prompts and 4 recommendation actions. Reject uses a modal | In progress |
| Vendors | /vendors | B | Suspend now a confirm modal | In progress |
| Reports & Exports | /reports | B | 19 reports, CSV and print exist; native Excel/PDF missing | Pending |
| Notifications & Automation | /notifications | B | Triggers, template edit/preview, sent log | Pending |
| Users & Access | /users | B | Permission matrix per role, module switches, registration-type toggles, login history | Pending |
| Audit Trail | /audit | A | Verify filter and before/after | Pending |

## Partner portal (9 pages x 2 roles)
My dashboard, Place an order, My orders, Invoices & ledger, My performance, Growth ladder, Agreement & certificate: routes exist (B, same checks as above). **My network (distributor): D, missing. Offers & credit (both roles): D, missing.**

## Vendor portal (7)
My dashboard (B), Stock report (B), Release orders (B). **RFQs & quotations, Purchase orders & delivery, Invoices & payments, My performance: D, missing** (needs migration and RLS).

## Public website (4)
Home, Register, Track, Verify: routes exist (B). Register needs the 5 steps in the walkthrough (details + OTP, business questions, address + map pin + consent, documents, review).

## Journeys
F1 B, F2 B (Approve modal with six fields, agreement stages, partner-signs step), F3 B (GST invoice modal, delivery), F4 D (quotes/POs/BOM/AI assistant), F5 B, F6 bug: not present (this build has no null promotion path; tested by `decide_promotion` DB tests).

## Done on this branch
- Replaced all 28 browser prompt/confirm/alert calls with validated modals (`src/lib/dialog.ts`, `DialogHost.tsx`), 4 new tests.
