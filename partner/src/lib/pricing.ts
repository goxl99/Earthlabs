/** Partner price per unit, ex-GST: MRP / 1.18 x (1 - margin). The database computes the same figure (unit_price); this mirrors it for previews and tests. */
export const GST = 0.18;
export function unitPrice(mrp: number, marginPct: number): number {
  return Math.round((mrp / (1 + GST)) * (1 - marginPct / 100) * 1e4) / 1e4;
}
export function leadDays(o: { confirm: number; dispatch: number; make: number; transit: number }, shortCartons: number): number {
  return o.confirm + o.dispatch + (shortCartons > 0 ? o.make : 0) + o.transit;
}
