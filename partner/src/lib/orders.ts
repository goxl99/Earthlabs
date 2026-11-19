import type { Role } from "@/lib/roles";

export type OrderStatus = "Pending Approval" | "Approved" | "Payment Confirmed" | "Dispatched" | "Delivered" | "On hold" | "Cancelled";
export type OrderAction = "approve" | "pay" | "dispatch" | "deliver" | "hold" | "resume" | "cancel";

export const inr = (n: number | string | null | undefined) => "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Which buttons a role sees for an order. Mirrors the database workflow functions; the database is the real gate. */
export function actionsFor(role: Role, status: OrderStatus): OrderAction[] {
  const out: OrderAction[] = [];
  const boss = role === "super_admin", sales = role === "sales";
  if ((boss || sales) && status === "Pending Approval") out.push("approve");
  if ((boss || role === "accounts") && status === "Approved") out.push("pay");
  if ((boss || role === "warehouse") && status === "Payment Confirmed") out.push("dispatch");
  if ((boss || role === "warehouse" || sales) && status === "Dispatched") out.push("deliver");
  if ((boss || sales) && ["Pending Approval", "Approved", "Payment Confirmed"].includes(status)) out.push("hold");
  if ((boss || sales) && status === "On hold") out.push("resume");
  if ((boss || sales) && ["Pending Approval", "Approved", "Payment Confirmed", "On hold"].includes(status)) out.push("cancel");
  return out;
}

export type Quote = {
  lines: { sku: string; name: string; cartons: number; pack: number; units: number; unit: number; amt: number }[];
  taxable: number; discount: number; net: number; gst: number; total: number;
  applied: { id: string; name: string; kind: string; amt: number }[]; hints: string[]; first_order: boolean;
  short_cartons: number; lead_days: number; show_lead: boolean;
};

/** Plain-language status for partners. */
export const STATUS_HELP: Record<OrderStatus, string> = {
  "Pending Approval": "Waiting for EarthLabs to approve",
  Approved: "Approved. Please pay and add the UTR number",
  "Payment Confirmed": "Payment confirmed. Being packed",
  Dispatched: "On its way", Delivered: "Delivered", "On hold": "On hold", Cancelled: "Cancelled",
};
