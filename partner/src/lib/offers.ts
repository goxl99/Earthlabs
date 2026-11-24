/** Text and ladder helpers for the partner "Offers & credit" screen. Pure functions so they can be tested without a browser. */
export type Offer = { id: string; name: string; kind: string; value: number; buy: number | null; get: number | null; min_cartons: number; min_value: number; first_order_only: boolean; valid_to: string };
export type Step = { n: string; limit: number; days: number; min: number };
export type MyCredit = { partner_id: string; level: number; pay_and_carry: boolean; score: number | null; ladder: Step[] };

export const benefitText = (s: Pick<Offer, "kind" | "value" | "buy" | "get">) =>
  s.kind === "pct" ? `${s.value}% off` : s.kind === "flat" ? `₹${s.value} off the order` : s.kind === "free" ? `${s.get} free carton per ${s.buy} bought` : "Free brand kit";

/** The conditions a partner must meet, in plain words. Empty when there are none. */
export function conditions(s: Pick<Offer, "min_cartons" | "min_value" | "first_order_only">): string[] {
  const c: string[] = [];
  if (s.min_cartons > 0) c.push(`Order at least ${s.min_cartons} cartons`);
  if (s.min_value > 0) c.push(`Order value of ₹${Number(s.min_value).toLocaleString("en-IN")} or more`);
  if (s.first_order_only) c.push("First order only");
  return c;
}

/** What the credit level means for the partner right now. */
export function creditSummary(c: MyCredit): { levelName: string; payFirst: boolean; next: Step | null; scoreGap: number | null } {
  const cur = c.ladder[c.level];
  const next = c.level + 1 < c.ladder.length ? c.ladder[c.level + 1] : null;
  // Pay-and-carry switched on means nothing is on credit yet, whatever the stored level says.
  const payFirst = c.pay_and_carry || !cur || cur.limit === 0;
  const scoreGap = next && c.score != null ? Math.max(0, next.min - c.score) : null;
  return { levelName: cur?.n ?? `Level ${c.level}`, payFirst, next, scoreGap };
}
