import GJ_RAW from "./gujarat.json";
/** Gujarat reference geography taken from the approved prototype: district outlines, towns, industrial areas, and the
 *  hierarchy district → cluster → circle → master circle. It is reference data, not business data. */
export type Dist = { n: string; cl: number; ci: number; mc: number; x: number; y: number; bb: [number, number, number, number] };
export type Town = { n: string; d: string; k: string; x: number; y: number };
export type Ind = { n: string; d: string; s: string; p: "H" | "M" | "E"; x: number; y: number };
export const GJ = GJ_RAW as unknown as {
  gd: Dist[]; towns: Town[]; ind: Ind[]; clusters: Record<string, string[]>; circles: Record<string, number[]>; masters: Record<string, number[]>;
  cname: Record<string, string>; mname: Record<string, string>; mcof: Record<string, number>; paths: Record<string, string>; bbox: [number, number, number, number];
};
export const CATS: Record<string, { n: string; s: string; col: string }> = {
  DLR: { n: "Authorized Dealer", s: "Dealer", col: "#239a9e" }, DST: { n: "Authorized Distributor", s: "Distributor", col: "#13595a" },
  STK: { n: "Circle Stockist", s: "Circle Stockist", col: "#c89739" }, MST: { n: "Circle Master Stockist", s: "Master Stockist", col: "#7b543b" },
  SST: { n: "Super Stockist", s: "Super Stockist", col: "#314452" }, INS: { n: "Institutional Partner", s: "Institutional", col: "#5d643f" }, VND: { n: "Vendor", s: "Vendor", col: "#8a8a8a" },
};
export const MCOL = ["#cfe8ea", "#f6d9a8"];
export const CLF = ["#b2dcdd", "#7bc2c5", "#ccecfc", "#d9e3bd", "#c4d19a", "#ebf3d8", "#ffdba7", "#f5c27a", "#fcd3c5", "#f4b9a4", "#fde6dd", "#b9cbe6", "#dfe8f5", "#c8d6ec", "#e9e4d0"];
export const CIF = ["#ccecfc", "#ebf3d8", "#ffdba7", "#fcd3c5", "#dfe8f5"];
export const MST_LABEL: Record<string, string> = { active: "Active partner", approved: "Approved partner (agreement pending)", suspended: "Suspended partner", applicant: "Applicant", verified: "Verified applicant", rejected: "Rejected application", vendor: "Vendor", "vendor-pending": "Vendor (in verification)" };

export const dist = (n: string) => GJ.gd.find((d) => d.n === n);
export type Lvl = { mc?: string | null; ci?: string | null; cl?: string | null; d?: string | null };
export type VB = [number, number, number, number];

/** Districts inside the current drill-down, or null for the whole state. */
export function drillSet(L: Lvl): string[] | null {
  if (L.d) return [L.d];
  if (L.cl) return GJ.clusters[L.cl];
  if (L.ci) return GJ.circles[L.ci].flatMap((k) => GJ.clusters[k]);
  if (L.mc) return GJ.masters[L.mc].flatMap((ci) => GJ.circles[ci]).flatMap((k) => GJ.clusters[k]);
  return null;
}
/** View box that frames the districts (or the whole state) with the map panel's aspect ratio. */
export function fitTo(ds: string[] | null): VB {
  const b = ds ? ds.map((n) => dist(n)!.bb).reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])], [1e9, 1e9, 0, 0]) : (GJ.bbox as number[]);
  let w = b[2] - b[0], h = b[3] - b[1]; const pad = Math.max(w, h) * 0.06; let x = b[0] - pad, y = b[1] - pad; w += pad * 2; h += pad * 2;
  const R = 1160 / 900;
  if (w / h < R) { const nw = h * R; x -= (nw - w) / 2; w = nw; } else { const nh = w / R; y -= (nh - h) / 2; h = nh; }
  return [x, y, w, h];
}
/** Market potential of a district: industrial areas weigh 3/2/1, plus one point per four towns. */
export function potential(n: string): number {
  const ind = GJ.ind.filter((i) => i.d === n).reduce((a, i) => a + ({ H: 3, M: 2, E: 1 })[i.p], 0);
  return ind + Math.round(GJ.towns.filter((t) => t.d === n).length / 4);
}
/** Stable position of a marker near its district centre (or town), so the same partner always sits in the same spot. */
export function pos(id: string, district: string, town?: string | null): [number, number] {
  const t = GJ.towns.find((x) => x.n === town && x.d === district); const d = dist(district);
  if (!d) return [0, 0];
  const bx = t ? t.x : d.x, by = t ? t.y : d.y; let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  const ang = ((h % 360) * Math.PI) / 180, r = t ? 5 + (h % 9) : 8 + (h % 16);
  return [bx + Math.cos(ang) * r, by + Math.sin(ang) * r];
}
export type ColorMode = "status" | "cluster" | "circle" | "master" | "potential";
export function distFill(n: string, mode: ColorMode, hasActive: boolean, hasApps: boolean): string {
  const d = dist(n)!;
  if (mode === "cluster") return CLF[d.cl - 1];
  if (mode === "circle") return CIF[d.ci - 1];
  if (mode === "master") return MCOL[d.mc - 1];
  if (mode === "potential") { const p = potential(n); return p >= 9 ? "#e7b45a" : p >= 5 ? "#f5d9a3" : p >= 2 ? "#f8ecd0" : "#f2efe3"; }
  return hasActive ? "#b2dcdd" : hasApps ? "#fbe6b8" : "#f1eee0";
}
/** Exclusive-rights conflict check, same rules as the database (the database still decides). */
export function exclConflict(partners: { id: string; name: string; type_code: string; district: string; status: string; exclusive: boolean }[], type: string, district: string, exceptId: string, exclusive: boolean): string | null {
  if (!exclusive) return null;
  const same = partners.find((p) => p.id !== exceptId && p.type_code === type && p.district === district && ["Active", "Agreement Pending"].includes(p.status));
  if (same) return `${same.name} (${same.id}) already operates as a ${CATS[type]?.s ?? type} in ${district}`;
  const ex = partners.find((p) => p.id !== exceptId && p.district === district && p.exclusive && p.status !== "Suspended");
  if (ex) return `${ex.name} (${ex.id}) already holds exclusive rights in ${district}`;
  return null;
}

/** A map pin typed or captured by the applicant. Must fall inside India's bounding box; returns null otherwise. */
export function parsePin(lat: string | number, lng: string | number): { lat: number; lng: number } | null {
  if (String(lat).trim() === "" || String(lng).trim() === "") return null;
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < 6 || a > 38 || b < 68 || b > 98) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 };
}
/** Link that opens the pin on OpenStreetMap in a new tab (the site's security policy does not allow embedding maps). */
export const osmLink = (p: { lat: number; lng: number }) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`;
