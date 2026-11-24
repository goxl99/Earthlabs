export type LeadTime = { confirm: number; dispatch: number; make: number; transit_in: number; transit_out: number; show: boolean };
export type PayCarry = { enabled: boolean; advance_pct: number };
const whole = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi; };
/** Returns an error text, or null when the lead-time policy is valid. */
export function checkLeadTime(l: LeadTime): string | null {
  for (const [k, n] of [["confirm", "Order confirmation days"], ["dispatch", "Dispatch days"], ["make", "Make-to-order days"], ["transit_in", "Transit days within the state"], ["transit_out", "Transit days outside the state"]] as const)
    if (!whole(l[k], 0, 60)) return `${n} must be a whole number from 0 to 60`;
  return null;
}
export function checkPayCarry(p: PayCarry): string | null { return whole(p.advance_pct, 1, 100) ? null : "Advance percent must be a whole number from 1 to 100"; }
export type Scheme = { id: string; name: string; active: boolean; disclosed: boolean; audience_mode: string; audience_types: string[]; audience_partners: string[]; valid_from: string; valid_to: string };
/** Whether a scheme is aimed at this partner. Mirrors the audience test in the database. */
export const aimedAt = (s: Pick<Scheme, "audience_mode" | "audience_types" | "audience_partners">, partnerId: string, typeCode: string) =>
  s.audience_mode === "all" || (s.audience_mode === "types" && s.audience_types.includes(typeCode)) || (s.audience_mode === "partners" && s.audience_partners.includes(partnerId));
/** What the partner can see of a scheme today: only active and disclosed schemes inside their dates. */
export function visibleToPartner(s: Scheme, today: string): "Visible" | "Hidden" | "Inactive" | "Expired" | "Not started" {
  if (!s.active) return "Inactive";
  if (s.valid_to < today) return "Expired";
  if (s.valid_from > today) return "Not started";
  return s.disclosed ? "Visible" : "Hidden";
}
