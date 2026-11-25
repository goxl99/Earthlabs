// Client side of the Territory AI advisor: builds the facts sent with a question, and the mail link for a draft. Pure, so it is tested.
import { coverage, scopeDistricts, scopeName, DEFAULT_MODEL, type CovCount } from "@/lib/coverage";
import { GJ, type Lvl } from "@/lib/geo";
import type { PotData } from "@/lib/potential";

export type Mode = "find_dealers" | "outreach" | "export" | "ask";
export type Advice = { headline: string; points: { title: string; detail: string }[]; email: { subject: string; body: string } | null; caveats: string[] };
export const MODE_LABEL: Record<Mode, string> = { find_dealers: "Find potential dealers here", outreach: "Draft an outreach e-mail", export: "Export view", ask: "Ask a question" };
/** At most this many districts go in one question; a bigger area is cut to the ones with the most potential. */
export const MAX_AREAS = 12;

export function buildContext(L: Lvl, counts: CovCount[], pot: PotData | null) {
  const names = scopeDistricts(L);
  const rows = names.map((n) => {
    const c = coverage([n], counts, pot, DEFAULT_MODEL);
    return { name: n, cluster: GJ.gd.find((d) => d.n === n)?.cl, potentialLpd: Math.round(c.potential * 10) / 10, requiredDealers: c.dealers.required, onboardedDealers: c.dealers.onboarded, pendingDealers: c.dealers.pending, onboardedDistributors: c.distributors.onboarded, pendingDistributors: c.distributors.pending,
      industrial: GJ.ind.filter((x) => x.d === n).map((x) => `${x.n} (${({ H: "high-volume", M: "medium", E: "emerging" })[x.p]})`).slice(0, 6), towns: GJ.towns.filter((t) => t.d === n).map((t) => t.n).slice(0, 6) };
  }).sort((a, b) => b.potentialLpd - a.potentialLpd).slice(0, MAX_AREAS);
  const t = coverage(names, counts, pot, DEFAULT_MODEL);
  return { scope: scopeName(L), areas: rows, totals: { potentialLpd: Math.round(t.potential), requiredDealers: t.dealers.required, requiredDistributors: t.distributors.required, onboardedDealers: t.dealers.onboarded, onboardedDistributors: t.distributors.onboarded, pendingDealers: t.dealers.pending, pendingDistributors: t.distributors.pending }, cut: names.length > MAX_AREAS };
}

/** A mailto link for the draft. Staff check and send it from their own mail app; nothing is sent from the portal. */
export function mailtoLink(to: string, subject: string, body: string) {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const link = `mailto:${/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to.trim()) ? encodeURIComponent(to.trim()) : ""}?${q}`;
  return link.length > 1900 ? null : link;
}
/** Wording that an outgoing e-mail must not carry (claims, prices, promises). The draft is flagged, not blocked. */
export const RISKY = [/chemical[- ]free/i, /100\s*%\s*(natural|safe|organic)/i, /kills?\s+(99|germs|bacteria|viruses)/i, /\b(cures?|treats?|prevents?)\b.*\b(infection|disease|covid|virus)/i, /\bguarantee(d)?\b/i, /\bexclusive (rights|territory)\b/i, /\b(discount|margin|commission|credit period|scheme)\b/i, /(₹|rs\.?|inr)\s?\d/i];
export const riskyIn = (text: string) => RISKY.some((r) => r.test(text));
