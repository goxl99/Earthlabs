/** What approving each kind of recommendation does. This mirrors decide_ai_recommendation in the database; nothing is invented. */
export const EFFECT: Record<string, string> = {
  reorder: "Approving raises a release order to the vendor for the quantity shown. Money is released only after a second, separate payment step.",
  lead_time: "Approving changes the lead time stored for this raw material, which moves its stock-out and reorder warnings.",
  credit: "Approving moves this entity to the credit level shown. Credit rises one step at a time and only with your approval.",
  scheme: "Approving records the suggestion only. Schemes stay hidden from partners until you disclose them.",
  promotion: "Approving records the suggestion only. A partner's tier is changed on its own screen, not here.",
};
export const KIND_LABEL: Record<string, string> = { reorder: "Reorder", lead_time: "Lead time", credit: "Credit", scheme: "Scheme", promotion: "Promotion" };
/** Supporting data rows from the stored payload and target: ids and numbers only. */
export function supporting(r: { target_kind: string | null; target_id: string | null; payload: Record<string, unknown> | null }): [string, string][] {
  const out: [string, string][] = [];
  if (r.target_id) out.push([r.target_kind ? `${r.target_kind}` : "Target", r.target_id]);
  for (const [k, v] of Object.entries(r.payload ?? {})) if (v != null && typeof v !== "object") out.push([k.replace(/_/g, " "), String(v)]);
  return out;
}
export const canAct = (status: string) => status === "Pending" || status === "Deferred";
