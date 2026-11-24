/** Helpers for the printable Tax Invoice and Purchase Order. */
export type Co = Record<string, string>;
export type Doc = {
  kind: "invoice" | "po"; company: Co; credit_days: number;
  partner: { id: string; type: string; name: string; contact: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; state: string | null; district: string | null };
  doc: Record<string, string | number | null | { name?: string; amount?: number }[]>;
  lines: { sku: string; name: string; units: number; unit_price: number; amount: number; cartons?: number }[];
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
export const docTitle = (k: "invoice" | "po") => (k === "invoice" ? "Tax Invoice" : "Purchase Order");
