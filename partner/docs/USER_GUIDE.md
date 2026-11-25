# EarthLabs Partner Portal: user guide

For everyone who signs in at the partner portal. No prices, partner names or other real data appear in this guide.

## 1. Getting in
1. Open the portal address given to you by EarthLabs and choose **Sign in**.
2. Use the e-mail your account was created with. Choose a long password (12 or more characters).
3. A new account is **inactive** until Super Admin activates it in *Users & access*. If you see "waiting for activation", wait for that message to clear or ask your EarthLabs contact.
4. The first account ever created becomes Super Admin. EarthLabs creates it before the link is shared.

What you see depends on your role. The database enforces this, so hiding a menu item is not the only protection.

| Role | Main screens |
|---|---|
| Super Admin | everything: Approvals, Users & access, Audit trail, Products & pricing, Schemes, Credit ladder, Performance, Reports |
| Sales | Applications, Partners, Territory, Agreements, Products & pricing (read only), Schemes (read only), Performance, Orders |
| Accounts | Invoices & ledger, Partners, Vendors, Procurement, Reports, Credit ladder (read), Orders |
| Warehouse | Inventory, Orders (dispatch), Vendors, Procurement |
| Dealer / Distributor | Dashboard, Place an order, My orders, Invoices & ledger, Performance and growth ladder, Agreement and certificate |
| Vendor | Vendor portal: own record, stock reports, release orders |

## 2. Partners (Dealer and Distributor)
**Place an order.** Open *Orders*, add products and cartons. The screen shows your own price, any scheme that applies to you, and an estimated delivery window. Prices are calculated by the database, not by your browser. Press **Place order**.

**Pay.** EarthLabs works on *pay and carry* at launch: no credit. After your order is approved, pay by bank transfer and press **I have paid** on the order. Enter the UTR (bank reference) and, if you have it, upload the payment advice. A UTR can be used only once. Your order moves on only after Accounts confirms the payment.

**Track.** *My orders* shows each step: Pending Approval, Approved, Payment Confirmed, Dispatched, Delivered. On hold or Cancelled orders show the reason.

**Invoices & ledger.** Your invoices (with GST split), credit notes and a running ledger. You can see only your own.

**Performance and growth ladder.** Your monthly score and what is needed for the next level. Your Partner ID never changes when you move up.

**Agreement and certificate.** Sign the MOU when sent to you. After it is signed and counter-checked your partner status becomes Active and a certificate with a QR code is issued. Anyone can check a certificate on the public *Verify* page.

## 3. Applicants (public)
Choose **Register**, pick Dealer or Distributor, fill the form and submit. Save the reference shown. On the **Track** page enter the reference and the same e-mail to see the status. Other registration types appear only when Super Admin switches them on.

## 4. Sales
- **Applications**: open one, review, ask for more information, record field verification, then reject (a reason is required) or approve. Approval issues the permanent Partner ID.
- **Territory**: shows districts, who covers them, exclusive districts and white-space. An exclusive district cannot be shared.
- **Agreements**: create the MOU from a template, send it for e-signing, store the signed copy.
  - **Uploading your own agreement template** (Super Admin only). Write the MOU in Word and type a placeholder such as `{{PARTNER_NAME}}` wherever a partner detail belongs. On the Agreements page, under *Upload your own MOU template*, give the template a name, choose Dealer, Distributor or all types, list each placeholder as `{{PLACEHOLDER}} = field`, choose the file and press *Upload template*.
  - **Special terms for one dealer.** On the dealer's agreement screen, write any special terms of that contract in the *Special terms and conditions* box and press *Merge with AI*. AI proposes new clauses for **Schedule C** and, only where a term really changes a standard clause, an exact change to that clause. It also lists warnings, for example where a term conflicts with pay-and-carry, schemes or exclusivity. Read the proposal, then press *Apply to agreement*. Nothing changes until you apply it, and the standard wording is never rewritten. Press *Merge with AI* again to replace Schedule C, or *Remove special terms* to take it out. Always read the final agreement before sending it for signing. Needs the `ANTHROPIC_API_KEY` secret in Supabase.
  - **View template / Attach template.** *View template* shows the standard Dealer Agreement wording. *Attach template* lets you use your own Word (.docx), .txt or .md agreement for this dealer instead; placeholders such as `{{dealer_name}}` are filled from the fields on the screen.
  - **Fields you can use:** `partner_name`, `partner_id`, `contact_name`, `district`, `state`, `gstin`, `type_name`, `territory` and `date`. Any other name is refused.
  - **File types:** Word (.docx) templates are filled in automatically. PDF and ODT files are stored as they are and must be filled by hand. Maximum size 5 MB.
- **Performance**: record the monthly score (unverified parameters are left out, not scored zero) and start a promotion assessment. Only Super Admin decides promotions.
- Sales can read prices, margins and schemes but **cannot change them**.

## 5. Accounts
- **Invoices & ledger**: check payment proofs (confirm or reject with a reason), issue invoices, issue credit notes (never more than the invoice), record a manual payment. Ledger entries cannot be edited or deleted.
- **Vendors / Procurement**: release vendor payments against approved release orders.
- Duplicate UTRs are blocked everywhere.

## 6. Warehouse
- **Inventory**: stock per product, reservations, logged adjustments (a reason is always required).
- **Orders**: dispatch an order once payment is confirmed (vehicle, LR number, batch reference). Warehouse cannot see prices, margins or partner money.

## 7. Vendors
Sign in to the Vendor portal to see your own record, submit stock reports (Super Admin approves them), acknowledge and dispatch release orders. A vendor ships against an advance that Accounts releases, unless the vendor is on approved credit.

## 8. Super Admin
- **Users & access**: activate users, assign roles, link users to partners or vendors, switch registration types on or off.
- **Products & pricing**: add or retire a product, set MRP, margin slabs and per-product margins. A product cannot go live without a margin.
- **Schemes**: percent, flat, free cartons or kit; audience, minimums, stack rules, budget caps. A scheme stays hidden from partners until you disclose it.
- **Approvals**: one queue for release orders, vendor stock reports, credit changes, AI recommendations and change requests.
- **Credit ladder**: levels change only through your approval, one step at a time, and not at all while pay-and-carry is on.
- **AI Intelligence**: AI only recommends; nothing happens until you approve.
- **Audit trail**: every important change with before and after values. It cannot be edited.
- **Reports**: 19 role-gated reports with CSV download and print to PDF. Each run is audited (5,000-row cap).

## 9. Rules that never bend
Only Super Admin controls products, prices, margins, schemes. AI recommends, management approves. One permanent Partner ID for life. Full audit trail. Pay-and-carry at launch. An order moves on only after payment is confirmed. Schemes are hidden until disclosed.

## 10. When something goes wrong
- "Not allowed" means your role may not do that action. Ask Super Admin.
- Lost password: use the reset link on the sign-in page.
- Wrong payment reference: ask Accounts to reject the proof, then submit again.
- Report a problem to your EarthLabs contact with the screen name, the time and what you pressed. Do not send passwords.
