# EPDMS walkthrough gap matrix

Source of truth: `EarthLabs_EPDMS_Complete_Walkthrough.html` (47 pages, 4 environments, 7 login roles).
Branch: `epdms-walkthrough-complete`. Everything that already worked was kept; this branch only adds and reshapes.

## How to read the classes

| Class | Meaning here |
|---|---|
| A | Every documented tab, button and rule exists and has a test (database role tests, unit tests, or component tests). |
| B | Built, but a documented item is missing or has a different shape. The gap is named. |
| C | Incorrect against the walkthrough. None are known open. |
| D | Missing. Named in the last section. |
| E | Broken. None known. A bug that was found and fixed on this branch is listed under "Found and fixed". |

**What "A" does not mean.** I could not run the screens against the live Supabase project or compare pixels with the walkthrough's 1,044 screenshots. A means "built to the documented behaviour and tested below the browser", not "pixel-identical". The pages marked *not re-audited* were left untouched, and I did not re-check them line by line against the walkthrough in this pass.

## Internal portal (Super Admin, Sales, Accounts, Warehouse)

| Walkthrough page | Class | Where it lives | Notes |
|---|---|---|---|
| Review guide | B | `/` (internal home) | Not re-audited. |
| Dashboard | A | `/dashboard/` | Added Territory performance by district and Overdue invoices (migration 023). "Overdue" is defined in the migration header: balance attributed to the newest invoices first, late when older than the credit days of the partner's level. |
| Approvals | A | `/approvals/` | Unchanged. |
| Applications | B | `/applications/` | Drawer UI kept. Added "Issue / re-send login". Not re-audited line by line. |
| Territory Explorer | B | `/territory/` | Cluster and circle editing is not built: there is no data model for it. |
| Partners | A | `/partners/` | Added type, status and district filters and CSV export of the filtered list. |
| Agreements & Certificates | A | `/agreements/` | Added the stage tracker: Draft, Sent for e-sign, Signed, Active, Certificate. |
| Partner Performance Matrix | A | `/performance/` | Added scorecard CSV export for staff and "Download my scorecard" for partners. |
| Products & Pricing (8 tabs) | A | `/catalogue/`, `/schemes/`, `/schemes/partners/`, `/catalogue/policies/` | All eight tabs exist. Policies & weights edits lead time and pay-and-carry. Score weights are edited on Performance. |
| Orders | B | `/orders/` | Not re-audited against the order drawer. |
| Inventory & Dispatch | A | `/inventory/` | Four tabs: Stock, Batches, Dispatches, Traceability (batch to dispatches, orders, partners). |
| Procurement & Raw Materials | B | `/procurement/`, `/rfq/`, `/bom/`, `/credit/` | Tabs linked. AI assistant tab built (build 12): five quick questions answered by the database from live data (`ai_assist`), reorder answers can raise a release order that still needs approval. |
| Invoices & Payments | A | `/invoices/` | Four tabs. Credit & reminders sends one reminder per partner per 24 hours (migration 025). |
| AI Intelligence | A | `/ai/` | Build 12 adds the four glance cards (top performer, declining, inactive, collection forecast; `ai_insights`). Cards show Supporting data, Reasoning and Risk. Approve, Defer, Reject (migration 022). The "Risk" text describes what approval does. It is not a model-generated risk score. |
| Vendors | A | `/vendors/`, `/vendors/invoices/` | Staff accept, reject and pay vendor invoices. |
| Reports & Exports | B | `/reports/` | Not re-audited. |
| Notifications & Automation | B | `/notifications/` | Two tabs (Triggers & templates, Sent log). Editing and previewing message text is not built: the text is generated in the database and editing it would change live behaviour. |
| Users & Access | B | `/users/` | Four tabs and Create user (needs the new `create-staff-user` function deployed). Not built: Create custom role, and a full role × module × action permission grid. |
| Audit Trail | B | `/audit/` | Not re-audited. |
| Role views (Sales, Accounts, Warehouse) | B | menus per role | Menus filtered by role and tested. Screens not re-audited per role. |

## Partner portal (Dealer and Distributor)

| Walkthrough page | Class | Where it lives | Notes |
|---|---|---|---|
| My dashboard | A | `/dashboard/` | Added Sales this month, Score, Outstanding and Next step (`partner_dashboard()`). |
| Place an order, My orders | B | `/orders/` | Not re-audited. |
| Invoices & ledger | A | `/invoices/` | Two tabs for partners: My invoices, My ledger. |
| My performance, Growth ladder | A | `/performance/`, `/ladder/` | Unchanged, plus scorecard download. |
| Agreement & certificate | B | `/agreements/` | Not re-audited. |
| My network (Distributor) | B | `/network/` | Browser prompt replaced by a dialog. |
| Offers & credit | A | `/offers/` | New. Shows disclosed schemes and the partner's credit step. Credit is raised only by Super Admin. |

## Vendor portal

| Walkthrough page | Class | Where it lives | Notes |
|---|---|---|---|
| My dashboard | A | `/dashboard/` | Open purchase orders, open quotation requests, score, payments due. |
| RFQs & quotations | A | `/vendor/quotes/` | |
| Purchase orders & delivery | A | `/vendor/orders/` | Acknowledge, reject (before payment), delivery update, dispatch. The walkthrough's "Purchase orders" and "Release orders" are the same table in this build (decision below). |
| Invoices & payments | A | `/vendor/invoices/` | Upload against a dispatched order. UTR cannot be reused. |
| My performance | A | `/vendor/performance/` | |
| Stock report | A | `/vendor/` | |
| Release orders | A | `/vendor/orders/` | Same screen as Purchase orders. |

## Public site

| Walkthrough page | Class | Where it lives | Notes |
|---|---|---|---|
| Home | B | `/` | Not re-audited. |
| Register | A | `/register/` | Optional map pin (use my location, or latitude and longitude, checked to be inside India). Consent tick-box exists. A click-to-drop map is not built: the site's security policy blocks embedded maps. |
| Track your application | A | `/track/` | Browser prompt replaced by a dialog. |
| Verify a certificate | B | `/verify/` | Not re-audited. |

## Decisions taken on this branch (made without asking, as instructed)

1. Vendor "Purchase orders" = release orders. Same table, two names in the walkthrough.
2. No custom-role table. It would change the permission model that the database enforces.
3. No territory cluster or circle editing. There is no data model for it.
4. Notification text is not editable in the screen. It lives in database functions.
5. Staff users are created by a new Super-Admin-only function. Only the four staff roles can be created that way.

## Open items (D)

- Create custom role, and the full permission grid with per-action switches.
- Editable notification templates.
- Territory cluster and circle editing.
- Click-to-drop map pin on registration.
- Pages marked "not re-audited": a line-by-line check against the walkthrough screens is still owed.

## Found and fixed on this branch

- Bootstrap lock: one of the two source lines had dropped the row lock that lets only one first sign-up become Super Admin. Restored (migration 018b).
- Eight internal database functions could be called by anonymous visitors. Closed (migration 019b).


## Build 12 additions
- Printable Tax Invoice and Purchase Order (`/doc/`, function `trade_doc`). Open items: no HSN code field on SKUs and no bank details in the company profile, so neither is printed.
- Test distributor ELP-DST-0001 (Active, no login yet; Super Admin issues it from Users). Delete after review.
