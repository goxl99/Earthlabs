import { DISTRICTS } from "./districts";

export type MapRow = { state: string; district: string; type_code: string; partners: number; exclusive_partner: string | null };
export type Cover = "exclusive" | "shared" | "open";

/** Coverage of one district for one partner type: exclusive holder, shared by several, or white-space (nobody). */
export function coverage(rows: MapRow[], district: string, type: string): { cover: Cover; partners: number; holder: string | null } {
  const r = rows.find((x) => x.district === district && x.type_code === type);
  if (!r || r.partners === 0) return { cover: "open", partners: 0, holder: null };
  return r.exclusive_partner ? { cover: "exclusive", partners: r.partners, holder: r.exclusive_partner } : { cover: "shared", partners: r.partners, holder: null };
}
export const whiteSpace = (rows: MapRow[], type: string) => DISTRICTS.filter((d) => coverage(rows, d, type).cover === "open");
export const summary = (rows: MapRow[], type: string) => {
  const c = { exclusive: 0, shared: 0, open: 0 };
  DISTRICTS.forEach((d) => { c[coverage(rows, d, type).cover]++; });
  return { ...c, total: DISTRICTS.length, percentCovered: Math.round(((DISTRICTS.length - c.open) / DISTRICTS.length) * 100) };
};
