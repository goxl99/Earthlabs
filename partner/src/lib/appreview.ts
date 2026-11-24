/** Rule-based application review. Same rules as the approved prototype; recommendations only, management decides.
 *  Unverified items are listed separately and never counted as zero. */
import { dist, CATS } from "./geo";

export type AppRow = { id: string; type_code: string; business_name: string; contact_name: string; district: string; gstin: string | null; status: string; answers: Record<string, unknown> | null; reg_verified: boolean | null; reputation: number | null };
export type PartnerLite = { id: string; name: string; type_code: string; status: string; district: string; exclusive: boolean };
export type Question = { key: string; label: string; alt?: string };

/** What each category is asked. `alt` is the key the current public form already uses. */
export const REG_Q: Record<string, Question[]> = {
  DLR: [{ key: "years", alt: "experience_years", label: "Years of business experience" }, { key: "outlets", label: "Retail outlets currently served" }, { key: "products", label: "Products currently sold" }, { key: "potential", label: "Estimated monthly sales potential (₹ lakh)" }, { key: "team", label: "Existing sales team" }, { key: "wc", label: "Working capital as a multiple of an opening order (x)" }, { key: "area", alt: "area_of_operation", label: "Areas served" }],
  DST: [{ key: "years", alt: "experience_years", label: "Years of business experience" }, { key: "districts", label: "Districts that can be covered" }, { key: "dealers", label: "Dealers that can be appointed" }, { key: "outlets", label: "Retail outlets in the existing network" }, { key: "warehouse", label: "Warehouse facilities" }, { key: "capacity", label: "Monthly distribution capacity (litres)" }, { key: "capital", label: "Working capital (₹ lakh)" }, { key: "logistics", label: "Transport and logistics in place" }, { key: "wc", label: "Working capital as a multiple of an opening order (x)" }, { key: "area", alt: "area_of_operation", label: "Areas served" }],
  STK: [{ key: "years", alt: "experience_years", label: "Years of business experience" }, { key: "network", label: "Existing distribution network" }, { key: "storage", label: "Stock-holding capacity (litres)" }, { key: "capital", label: "Working capital (₹ lakh)" }, { key: "coverage", label: "Districts covered" }, { key: "wc", label: "Working capital as a multiple of an opening order (x)" }],
  INS: [{ key: "category", label: "Business category" }, { key: "monthly", label: "Estimated monthly consumption (litres)" }, { key: "req", label: "Product requirements" }, { key: "delivery", label: "Delivery requirements" }, { key: "area", alt: "area_of_operation", label: "Sites served" }],
};
export const REG_DOCS: Record<string, string[]> = {
  DLR: ["Company / firm registration", "PAN card", "Address proof of business", "Bank statement (6 months)", "Authorised person ID"],
  DST: ["Company / firm registration", "PAN card", "Address proof of business", "Bank statement (6 months)", "Authorised person ID", "Warehouse proof or lease", "Financial statements (2 years)", "Dealer network list"],
  STK: ["Company / firm registration", "PAN card", "Address proof of business", "Bank statement (6 months)", "Authorised person ID", "Warehouse photos and lease", "Financial statements (2 years)", "Fleet / logistics details"],
  INS: ["Registration / licence", "GST certificate", "Authority letter of contact person", "Site address proof"],
};

export const answer = (a: AppRow, q: Question): string | null => {
  const v = (a.answers ?? {})[q.key] ?? (q.alt ? (a.answers ?? {})[q.alt] : undefined);
  return v == null || String(v).trim() === "" ? null : String(v);
};
export type DocRow = { id: string; kind: string; status: string; file_name: string | null; file_path: string | null; note: string | null; not_applicable: boolean; is_current: boolean; uploaded_at: string };
/** Documents count as received once uploaded (not rejected) or marked not applicable. Before documents are requested nothing is tracked yet. */
export const docsReceived = (a: AppRow, docs?: DocRow[]): Record<string, boolean> | null => {
  if (!docs || a.status === "Submitted") return null;
  const m: Record<string, boolean> = {};
  docs.filter((d) => d.is_current).forEach((d) => { m[d.kind] = d.not_applicable || d.status !== "Rejected"; });
  return m;
};

/** Joining criteria for a new dealer (Performance Matrix, step 0 to 1): weight, scale low, scale high, minimum. */
export const JOIN: { n: string; w: number; lo: number; hi: number; min: number; unit: string }[] = [
  { n: "Local reach", w: 0.35, lo: 0, hi: 30, min: 0.4, unit: "outlets" },
  { n: "Financial capacity", w: 0.2, lo: 1, hi: 3, min: 0.3, unit: "x working capital" },
  { n: "Market reputation", w: 0.2, lo: 0, hi: 1, min: 0.5, unit: "field rating" },
  { n: "Category fit", w: 0.15, lo: 0, hi: 1, min: 0, unit: "rating" },
  { n: "Team and delivery readiness", w: 0.1, lo: 0, hi: 1, min: 0.3, unit: "rating" },
];
export type JoinRow = { n: string; w: number; actual: number | null; score: number | null; min: number; pass: boolean; unit: string };
export function joinEval(actuals: (number | null)[]): { rows: JoinRow[]; weighted: number | null } {
  let sw = 0, sv = 0;
  const rows = JOIN.map((c, i) => {
    const a = actuals[i];
    const score = a == null ? null : Math.max(0, Math.min(1, (a - c.lo) / (c.hi - c.lo)));
    if (score != null) { sw += c.w; sv += c.w * score; }
    return { n: c.n, w: c.w, actual: a, score, min: c.min, pass: score == null || score >= c.min, unit: c.unit };
  });
  return { rows, weighted: sw ? sv / sw : null };
}

export type Review = { comp: number; miss: string[]; unanswered: string[]; risks: ["crit" | "warn", string][]; checks: string[]; suit: number | null; join: ReturnType<typeof joinEval> | null; rec: string; recT: string; crit: boolean; summary: string; defCat: string };

export function reviewApplication(a: AppRow, peers: AppRow[], partners: PartnerLite[], docList?: DocRow[]): Review {
  const qs = REG_Q[a.type_code] ?? [];
  const unanswered = qs.filter((q) => answer(a, q) == null).map((q) => q.label);
  const docs = docsReceived(a, docList), req = REG_DOCS[a.type_code] ?? [];
  const miss = docs ? req.filter((d) => !docs[d]) : [];
  const total = qs.length + (docs ? req.length : 0), done = qs.length - unanswered.length + (docs ? req.length - miss.length : 0);
  const comp = total ? Math.round((done / total) * 100) : 0;
  const risks: Review["risks"] = [], checks: string[] = [];
  const num = (k: string) => { const q = qs.find((x) => x.key === k); const v = q ? answer(a, q) : null; return v == null || isNaN(Number(v)) ? null : Number(v); };
  let join: Review["join"] = null, suit: number | null = null;
  if (["DLR", "DST", "STK"].includes(a.type_code)) {
    const products = (qs.find((x) => x.key === "products") && answer(a, qs.find((x) => x.key === "products")!)) || "";
    const fit = products ? (/soap|clean|fmcg|personal|home|hygiene/i.test(products) ? 1 : 0.5) : null;
    const teamQ = qs.find((x) => x.key === "team" || x.key === "warehouse"); const team = teamQ ? answer(a, teamQ) : null;
    join = joinEval([num("outlets"), num("wc"), a.reputation, fit, team == null ? null : /^y/i.test(team) ? 0.8 : 0.3]);
    suit = join.weighted;
    if (!a.reg_verified) risks.push(["crit", "Company registration has not been verified. This is a must-pass condition."]);
    if (!a.gstin) checks.push("No GST number. Allowed for small dealers, not a blocker.");
    if (a.reputation == null) checks.push("Market reputation not verified yet. It needs two trade references from the field team.");
    const wc = num("wc"); if (wc != null && wc < 1.2) risks.push(["warn", `Working capital is only ${wc}x the opening order.`]);
  }
  if (miss.length) risks.push(["warn", `Missing documents: ${miss.join(", ")}`]);
  const dd = dist(a.district), live = partners.filter((p) => p.district === a.district && !["Terminated", "Suspended"].includes(p.status));
  const holder = live.find((p) => p.exclusive);
  if (holder && ["DLR", "DST"].includes(a.type_code)) risks.push(["crit", `Territory conflict: ${holder.name} (${holder.id}) holds exclusive rights in ${a.district}.`]);
  if (a.type_code === "DST" || a.type_code === "STK") {
    const ex = live.find((p) => p.type_code === "DST" && p.status === "Active");
    if (ex && a.type_code === "DST") risks.push(["warn", `Plan is one distributor per district; ${ex.name} already serves ${a.district}.`]);
    if (ex && a.type_code === "STK") checks.push(`Existing distributor in ${a.district} (${ex.name}) would be supplied by this stockist. Check for conflicts.`);
  }
  if (peers.length) risks.push(["warn", `Overlapping applicant in ${a.district}: ${peers.map((p) => p.business_name).join(", ")}`]);
  let rec = CATS[a.type_code]?.n ?? a.type_code;
  if (a.type_code === "DST") {
    const o = num("outlets"), w = num("wc"), d = num("dealers");
    if (o != null && w != null && d != null && o >= 150 && w >= 2 && d >= 10) rec = "Authorized Distributor (network supports it)";
    else { rec = "Start as Authorized Dealer"; if (o != null && d != null) checks.push(`A network of ${o} outlets and ${d} dealers is below the distributor profile. Start as Dealer and earn the step up.`); }
  }
  if (a.type_code === "STK") { rec = "Appoint as Authorized Distributor first; assess for Circle Stockist after four strong quarters"; checks.push("Policy: every channel partner starts at Dealer unless management approves another category."); }
  const crit = risks.some((r) => r[0] === "crit");
  const lines = [`${a.business_name} (${a.contact_name}) applies as ${CATS[a.type_code]?.s ?? a.type_code} in ${a.district}. The application is ${comp}% complete${unanswered.length ? ` (${unanswered.length} answer(s) not given)` : ""}.`];
  if (suit != null) lines.push(`Joining score on verified items: ${Math.round(suit * 100)} / 100 (promote at 70).`);
  lines.push(crit ? "Recommendation: do not approve until the red flags are cleared." : miss.length || unanswered.length ? "Recommendation: request the missing information before management review." : "Recommendation: proceed to management review.");
  const defCat = /Distributor/.test(rec) && !/Start as|first/.test(rec) ? "DST" : a.type_code === "INS" ? "INS" : "DLR";
  return { comp, miss, unanswered, risks, checks, suit, join, rec, recT: a.district + (dd ? ` · Cluster ${dd.cl}, Circle ${dd.ci}` : ""), crit, summary: lines.join(" "), defCat };
}
