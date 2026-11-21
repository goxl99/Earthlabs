import type { Role } from "@/lib/roles";

export type RM = { id: string; name: string; unit: string; vendor_id: string | null; on_hand: number; reorder_level: number; per_day: number; lead_days: number; v_avail: number | null; v_rate: number | null; v_lead: number | null };
export type RO = { id: string; vendor_id: string; rm_id: string; qty: number; rate: number; total: number; lead_days: number; eta: string | null; status: string; pay_mode: string | null; pay_status: string; pay_amount: number; pay_utr: string | null };
export type Ladder = { n: string; limit: number; days: number; min: number };

/** Days the stock will last at the current usage. 999 when usage is unknown. */
export const coverDays = (m: Pick<RM, "on_hand" | "per_day">) => (m.per_day > 0 ? Math.floor(m.on_hand / m.per_day) : 999);

/** Stock state shown to procurement. The incoming quantity (open release orders) counts toward the reorder level. */
export function rmState(m: RM, incoming: number, buffer: number): "Stock-out risk" | "Below reorder" | "Healthy" {
  if (coverDays(m) < m.lead_days + buffer) return "Stock-out risk";
  if (m.on_hand + incoming < m.reorder_level) return "Below reorder";
  return "Healthy";
}

/** Buttons for a release order, per role. The database enforces the same rules; this only hides buttons that would be refused. */
export type RoAction = "approve" | "reject" | "pay" | "acknowledge" | "dispatch" | "receive";
export function roActions(role: Role, r: Pick<RO, "status" | "pay_mode" | "pay_status">): RoAction[] {
  const out: RoAction[] = [];
  if (role === "super_admin" && r.status === "Pending approval") out.push("approve", "reject");
  if ((role === "super_admin" || role === "accounts") && ["Approved", "Acknowledged"].includes(r.status) && r.pay_mode === "Advance" && r.pay_status === "Unpaid") out.push("pay");
  if (role === "vendor" && r.status === "Approved") out.push("acknowledge");
  // the vendor can ship only once payment is released or the order is on credit
  if (role === "vendor" && ["Approved", "Acknowledged"].includes(r.status) && ["Paid", "On credit"].includes(r.pay_status)) out.push("dispatch");
  if ((role === "super_admin" || role === "warehouse") && r.status === "Dispatched") out.push("receive");
  return out;
}

/** Next credit step for an entity, or null when it is already at the top. */
export const nextLevel = (level: number, ladder: Ladder[]) => (level + 1 < ladder.length ? level + 1 : null);

export type QueueItem = { group: string; type: string; id: string; title: string; amount?: number; at: string; flag?: string; source?: string };
/** Which database function decides each approval item. */
export function decideCall(it: QueueItem, approve: boolean, why: string): { fn: string; args: Record<string, unknown> } | null {
  switch (it.type) {
    case "Release order": return approve ? { fn: "approve_release_order", args: { rid: it.id } } : { fn: "reject_release_order", args: { rid: it.id, why } };
    case "Vendor stock report": return { fn: "decide_vendor_stock_report", args: { rid: it.id, approve, why } };
    case "Credit change": return { fn: "decide_credit_change", args: { pid: Number(it.id), approve, why } };
    case "AI recommendation": return { fn: "decide_ai_recommendation", args: { rid: Number(it.id), approve, why } };
    default: return null;   // orders, payment proofs and change requests are decided on their own screens
  }
}
export const screenFor = (type: string) => ({ Order: "/orders/", "Payment proof": "/invoices/", "Change request": "/catalogue/" } as Record<string, string>)[type] ?? null;
