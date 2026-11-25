// Coverage figures shared by Partners and Territory Explorer: Potential, Required, Onboarded, Pending and area-wise potential in litres.
// One place, so both screens always agree.
import { GJ, dist, type Lvl } from "./geo";
import { forDistrict, type PotData } from "./potential";

/** One row of the database function public.coverage_counts(): partners and applicants per district and partner type. */
export type CovCount = { district: string; type_code: string; onboarded: number; pending: number };
/** The planning assumptions behind "Required". Dealer litres a day is the Growth ladder figure (50 L a day); one distributor per district is the network plan. */
export type CovModel = { dealerLpd: number; distributorsPerDistrict: number; sharePct: number };
export const DEFAULT_MODEL: CovModel = { dealerLpd: 50, distributorsPerDistrict: 1, sharePct: 100 };

export type Tally = { required: number; onboarded: number; pending: number };
export type Cov = { districts: number; potential: number; dealers: Tally; distributors: Tally };

/** Figures for a set of districts. Required is worked out district by district and then added up, so every table row adds up to its total. */
export function coverage(districts: string[], counts: CovCount[], pot: PotData | null, model: CovModel = DEFAULT_MODEL): Cov {
  const out: Cov = { districts: districts.length, potential: 0, dealers: { required: 0, onboarded: 0, pending: 0 }, distributors: { required: 0, onboarded: 0, pending: 0 } };
  const inSet = new Set(districts);
  for (const d of districts) {
    const lpd = pot ? forDistrict(pot, d)?.lpd ?? 0 : 0;
    out.potential += lpd;
    out.dealers.required += Math.ceil((lpd * model.sharePct) / 100 / model.dealerLpd);
    out.distributors.required += model.distributorsPerDistrict;
  }
  for (const c of counts) {
    if (!inSet.has(c.district)) continue;
    const t = c.type_code === "DLR" ? out.dealers : c.type_code === "DST" ? out.distributors : null;
    if (t) { t.onboarded += c.onboarded; t.pending += c.pending; }
  }
  return out;
}

export type Area = { key: string; label: string; districts: string[]; next: Lvl | null };
const idsOf = (m: Record<string, number[]>, k: string) => m[k].map(String);
const clusterDistricts = (cl: string) => GJ.clusters[cl];
const circleDistricts = (ci: string) => idsOf(GJ.circles, ci).flatMap(clusterDistricts);
const masterDistricts = (mc: string) => idsOf(GJ.masters, mc).flatMap(circleDistricts);

/** The areas one step below the current drill-down (master circles, then circles, clusters, districts). Each carries the drill-down that opens it. */
export function areasBelow(L: Lvl): Area[] {
  if (L.d) return [{ key: L.d, label: L.d, districts: [L.d], next: null }];
  if (L.cl) return clusterDistricts(L.cl).map((d) => { const x = dist(d)!; return { key: d, label: d, districts: [d], next: { mc: String(x.mc), ci: String(x.ci), cl: String(x.cl), d } }; });
  if (L.ci) return idsOf(GJ.circles, L.ci).map((cl) => ({ key: cl, label: `Cluster ${cl} · ${GJ.clusters[cl].join(", ")}`, districts: GJ.clusters[cl], next: { mc: String(GJ.mcof[L.ci!]), ci: L.ci, cl } }));
  if (L.mc) return idsOf(GJ.masters, L.mc).map((ci) => ({ key: ci, label: `Circle ${ci} · ${GJ.cname[ci]}`, districts: circleDistricts(ci), next: { mc: L.mc, ci } }));
  return Object.keys(GJ.masters).map((mc) => ({ key: mc, label: `Master circle ${mc} · ${GJ.mname[mc]}`, districts: masterDistricts(mc), next: { mc } }));
}
/** The districts the figures at the top of the screen cover for a drill-down: the whole state when nothing is chosen. */
export function scopeDistricts(L: Lvl): string[] {
  if (L.d) return [L.d];
  if (L.cl) return clusterDistricts(L.cl);
  if (L.ci) return circleDistricts(L.ci);
  if (L.mc) return masterDistricts(L.mc);
  return GJ.gd.map((d) => d.n);
}
export const scopeName = (L: Lvl) => L.d ? L.d : L.cl ? `Cluster ${L.cl}` : L.ci ? `Circle ${L.ci} · ${GJ.cname[L.ci]}` : L.mc ? `Master circle ${L.mc} · ${GJ.mname[L.mc]}` : "Gujarat";
