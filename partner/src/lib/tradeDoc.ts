/** Helpers for the printable Tax Invoice and Purchase Order. */
export type DocKind = "invoice" | "po" | "challan" | "proforma" | "rpo" | "vdn";
export type Co = Record<string, unknown>;
export type Brand = { legal_name?: string; address?: string; state?: string; state_code?: string; gstin?: string; pan?: string; email?: string; logo?: string | null; bank?: { account_name?: string; bank?: string; account_no?: string; ifsc?: string } };
export type Doc = {
  kind: DocKind; company: Co; credit_days: number;
  partner_brand?: Brand; qc?: { batch_ref: string; product: string | null; qc_status: string | null; qty: number | null; fetched_at: string } | null;
  partner: { id: string; type: string; name: string; contact: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; state: string | null; district: string | null };
  doc: Record<string, string | number | null | { name?: string; amount?: number }[]>;
  lines: { sku: string; name: string; hsn?: string; units: number; unit_price: number; amount: number; cartons?: number; unit?: string | null }[];
};
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const below1000 = (n: number) => (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + below100(n % 100) : "") : below100(n));
/** Amount in words, Indian grouping: "Rupees One Lakh Eighteen Thousand Only". */
export function rupeesInWords(amount: number): string {
  const paise = Math.round((amount - Math.floor(amount)) * 100); let n = Math.floor(amount);
  if (n === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  for (const [div, name] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]] as const) { const q = Math.floor(n / div); if (q) { parts.push(below1000(q) + " " + name); n %= div; } }
  if (n) parts.push(below1000(n));
  return "Rupees " + (parts.join(" ") || "Zero") + (paise ? " and " + below100(paise) + " Paise" : "") + " Only";
}
/** Intra-state supply (company state equals place of supply) splits GST into CGST and SGST; inter-state is IGST. */
export const isIntra = (companyState: string, supply: string) => companyState.trim().toLowerCase() === supply.trim().toLowerCase();
export const docTitle = (k: DocKind) => ({ invoice: "Tax Invoice", po: "Purchase Order", challan: "Delivery Challan", proforma: "Proforma Invoice", rpo: "Purchase Order", vdn: "Dispatch Note" })[k];
/** Label of the number field on each document. */
export const numberLabel = (k: DocKind) => ({ invoice: "Invoice No", po: "PO No", challan: "Challan No", proforma: "Proforma No", rpo: "PO No", vdn: "Dispatch Note No" })[k];
/** Documents that carry a public verification QR code (the numbers the database can confirm). */
export const verifiable = (k: DocKind) => k === "invoice" || k === "proforma" || k === "challan";
/** Vendor documents have no GST split: the supplier's tax invoice carries the tax. */
export const isVendorDoc = (k: DocKind) => k === "rpo" || k === "vdn";
/** GST rate in percent, worked out from the document totals (never typed in). */
export const gstPct = (taxable: number, tax: number) => (taxable > 0 ? Math.round((tax / taxable) * 1000) / 10 : 0);
/** Constant frame: only the issuer changes. Invoice, challan, proforma and EarthLabs purchase orders are issued by EarthLabs; a partner purchase order and a vendor dispatch note by the other party, in their brand. */
export const issuerIsPartner = (k: DocKind) => k === "po" || k === "vdn";
