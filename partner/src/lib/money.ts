/** Mirrors the database GST split so screens can preview it; the database (issue_invoice / issue_credit_note) is the authority. */
export type GstSplit = { cgst: number; sgst: number; igst: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Inside the company state the GST is shared by CGST and SGST (the odd paisa goes to SGST); outside it is IGST. */
export function splitGst(gst: number, supplyState: string, companyState = "Gujarat"): GstSplit {
  if (supplyState.trim().toLowerCase() === companyState.trim().toLowerCase()) {
    const half = r2(gst / 2);
    return { cgst: half, sgst: r2(gst - half), igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: r2(gst) };
}

/** Share of a credit note (GST inclusive) that is taxable value, in proportion to the invoice. */
export function creditNoteParts(amount: number, invoiceTaxable: number, invoiceTotal: number, supplyState: string, companyState = "Gujarat") {
  const taxable = r2((amount * invoiceTaxable) / invoiceTotal);
  return { taxable, ...splitGst(r2(amount - taxable), supplyState, companyState) };
}

/** Ledger balance: positive means the partner owes EarthLabs, negative means the partner is in credit. */
export function balanceText(n: number): string {
  const v = Math.abs(r2(n)).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  return n > 0 ? `₹${v} to pay` : n < 0 ? `₹${v} in credit` : "Nothing due";
}

/** Proof actions: partners report payment on an approved order only; Accounts reviews. */
export const canSubmitProof = (role: string, status: string) => (role === "dealer" || role === "distributor") && status === "Approved";
export const canReviewProof = (role: string) => role === "super_admin" || role === "accounts";
