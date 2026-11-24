// Builds the Dealer MOU text from the approved template. Staff can edit every field and then the full text before the PDF is made.
import { MOU_TEMPLATE_TEXT } from "./mouTemplateText";

export type MouField = { key: string; label: string; group: "Parties" | "Signatories" | "Territory and term" | "Targets (Schedule B)" | "Money and clauses"; hint?: string; kind?: "text" | "area" | "select"; options?: string[] };
export const NA = "Not applicable";
export const MOU_FIELDS: MouField[] = [
  { key: "mou_date", label: "MOU date", group: "Parties", hint: "e.g. 24 November 2026" },
  { key: "dealer_name", label: "Dealer legal name", group: "Parties" },
  { key: "dealer_form", label: "Type of entity", group: "Parties", kind: "select", options: ["proprietorship", "partnership", "LLP", "private limited company", "individual"] },
  { key: "reg_no", label: "Registration number", group: "Parties", hint: "Write Not applicable if none" },
  { key: "pan", label: "PAN", group: "Parties", hint: "Write Not applicable if none" },
  { key: "gstin", label: "GSTIN", group: "Parties", hint: "Write Not applicable if none" },
  { key: "address", label: "Place of business (address)", group: "Parties", kind: "area", hint: "Write Not applicable if the dealer has no premises" },
  { key: "dealer_signatory", label: "Dealer signatory name", group: "Signatories" },
  { key: "dealer_designation", label: "Dealer signatory designation", group: "Signatories" },
  { key: "dealer_place", label: "Dealer signing place", group: "Signatories" },
  { key: "company_signatory", label: "EarthLabs signatory name", group: "Signatories" },
  { key: "company_designation", label: "EarthLabs signatory designation", group: "Signatories" },
  { key: "sign_date", label: "Signing date", group: "Signatories", hint: "DD/MM/YYYY" },
  { key: "partner_id", label: "Partner ID", group: "Territory and term" },
  { key: "territory", label: "Territory (district / area / pin codes)", group: "Territory and term", kind: "area" },
  { key: "cluster", label: "Cluster and circle", group: "Territory and term", hint: "e.g. Vadodara cluster, Gujarat Circle" },
  { key: "term_years", label: "Term (years)", group: "Territory and term", kind: "select", options: ["one", "two", "three"] },
  { key: "bulk_litres", label: "Bulk Order from (litres)", group: "Territory and term" },
  { key: "perf_months", label: "Order performance window (months)", group: "Targets (Schedule B)" },
  { key: "perf_orders", label: "Paid orders needed in that window", group: "Targets (Schedule B)" },
  { key: "perf_volume", label: "Litres or units needed in that window", group: "Targets (Schedule B)" },
  { key: "mpt_m_vol", label: "Monthly volume target", group: "Targets (Schedule B)" },
  { key: "mpt_m_ord", label: "Monthly paid orders", group: "Targets (Schedule B)" },
  { key: "mpt_m_out", label: "Monthly new outlets", group: "Targets (Schedule B)" },
  { key: "mpt_q_vol", label: "Quarterly volume target", group: "Targets (Schedule B)" },
  { key: "mpt_q_ord", label: "Quarterly paid orders", group: "Targets (Schedule B)" },
  { key: "mpt_q_out", label: "Quarterly new outlets", group: "Targets (Schedule B)" },
  { key: "mpt_a_vol", label: "Annual volume target", group: "Targets (Schedule B)" },
  { key: "mpt_a_ord", label: "Annual paid orders", group: "Targets (Schedule B)" },
  { key: "mpt_a_out", label: "Annual new outlets", group: "Targets (Schedule B)" },
  { key: "margin_other", label: "Margin on other products and packs (%)", group: "Money and clauses" },
  { key: "bulk_commission", label: "Bulk Order referral commission (%)", group: "Money and clauses" },
  { key: "late_interest", label: "Interest on late payment (% per month)", group: "Money and clauses" },
  { key: "security_deposit", label: "Security deposit (₹)", group: "Money and clauses", hint: "Leave blank for Not applicable" },
  { key: "noncompete", label: "Include non-compete clause 11.5", group: "Money and clauses", kind: "select", options: ["Yes", "No"] },
];
const COMPUTED = ["security_deposit_text", "noncompete_clause"];

export type Values = Record<string, string>;
export function defaultValues(p: { name?: string; contact_name?: string; district?: string; gstin?: string | null; address?: string | null; id?: string }, company: Record<string, string> = {}): Values {
  const today = new Date();
  return {
    mou_date: today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    dealer_name: p.name ?? "", dealer_form: "proprietorship", reg_no: NA, pan: "", gstin: p.gstin || NA, address: p.address || "",
    dealer_signatory: p.contact_name ?? "", dealer_designation: "Proprietor", dealer_place: p.district ?? "",
    company_signatory: company.signatory_name ?? "", company_designation: company.signatory_designation ?? "Authorised Signatory", sign_date: "",
    partner_id: p.id ?? "", territory: p.district ?? "", cluster: "", term_years: "one", bulk_litres: "50",
    perf_months: "3", perf_orders: "2", perf_volume: "",
    mpt_m_vol: "", mpt_m_ord: "", mpt_m_out: "", mpt_q_vol: "", mpt_q_ord: "", mpt_q_out: "", mpt_a_vol: "", mpt_a_ord: "", mpt_a_out: "",
    margin_other: "", bulk_commission: "", late_interest: "1.5", security_deposit: "", noncompete: "Yes",
  };
}

const NONCOMPETE = "**11.5 Competing products.** During the Term the Dealer shall not distribute directly competing herbal or industrial hand-wash products in the Territory without the Company's written consent.";
export function buildMou(v: Values): { text: string; missing: string[] } {
  const dep = (v.security_deposit ?? "").trim();
  const all: Values = { ...v,
    security_deposit_text: dep && dep.toLowerCase() !== "not applicable" ? `A refundable deposit of ₹${dep} is payable on signing and is refundable, without interest, after termination and settlement of all dues.` : "Not applicable.",
    noncompete_clause: v.noncompete === "No" ? "**11.5 Competing products.** Not applicable." : NONCOMPETE };
  const missing: string[] = [];
  const text = MOU_TEMPLATE_TEXT.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const val = (all[k] ?? "").trim();
    if (!val && !COMPUTED.includes(k)) { missing.push(k); return "________"; }
    return val;
  });
  return { text, missing: [...new Set(missing)] };
}
export const missingLabels = (keys: string[]) => keys.map((k) => MOU_FIELDS.find((f) => f.key === k)?.label ?? k);
