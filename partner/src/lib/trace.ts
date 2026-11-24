export type Dn = { order_id: string; vehicle: string | null; lr_no: string | null; batch_ref: string | null; dispatched_at: string };
export type Ord = { id: string; partner_id: string; status: string };
export type Ln = { order_id: string; sku: string; cartons: number };
export type TraceRow = { order_id: string; partner_id: string; status: string; vehicle: string | null; lr_no: string | null; dispatched_at: string; lines: { sku: string; cartons: number }[]; cartons: number };
/** Everything shipped from one batch, grouped per order. Orders missing from the lookup keep their dispatch row with an unknown partner. */
export function traceBatch(batch: string, dns: Dn[], orders: Ord[], lines: Ln[]): TraceRow[] {
  const b = batch.trim().toLowerCase(); if (!b) return [];
  return dns.filter((d) => (d.batch_ref ?? "").toLowerCase() === b).map((d) => {
    const o = orders.find((x) => x.id === d.order_id); const ls = lines.filter((l) => l.order_id === d.order_id).map((l) => ({ sku: l.sku, cartons: l.cartons }));
    return { order_id: d.order_id, partner_id: o?.partner_id ?? "unknown", status: o?.status ?? "unknown", vehicle: d.vehicle, lr_no: d.lr_no, dispatched_at: d.dispatched_at, lines: ls, cartons: ls.reduce((n, l) => n + l.cartons, 0) };
  });
}
