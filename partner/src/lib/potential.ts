// Indicative demand for a district: the same model as the Territory Explorer (Census 2011 population grown to 2026,
// 80% eligible, 10% rural / 30% urban buy rate, 10 ml per buyer per day). A planning estimate, not a forecast.
export type PotRow = { n: string; r: string; pop: number; buyers: number; lpd: number; est: boolean };
export type PotData = { assumptions: { year: number; growth: number; elig: number; rural: number; urban: number; ml: number }; districts: PotRow[] };
let cache: Promise<PotData> | null = null;
export function loadPotential(): Promise<PotData> {
  cache ??= fetch(`${process.env.NEXT_PUBLIC_BASE ?? ""}/data/territory-potential.json`).then((r) => r.json());
  return cache;
}
const alias = (n: string) => (n === "Devbhoomi Dwarka" ? "Devbhumi Dwarka" : n);
export const forDistrict = (d: PotData, name: string) => d.districts.find((x) => x.n === alias(name));
export const regions = (d: PotData) => [...new Set(d.districts.map((x) => x.r))];
export const forRegion = (d: PotData, region: string) => {
  const rs = d.districts.filter((x) => x.r === region);
  return { n: rs.length, lpd: rs.reduce((s, x) => s + x.lpd, 0), buyers: rs.reduce((s, x) => s + x.buyers, 0) };
};
export const fmtL = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 1 }));
