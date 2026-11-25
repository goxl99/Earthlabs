"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Kpi } from "@/components/ui";
import { loadPotential, fmtL, type PotData } from "@/lib/potential";
import { coverage, areasBelow, scopeDistricts, scopeName, DEFAULT_MODEL, type CovCount, type Tally } from "@/lib/coverage";
import type { Lvl } from "@/lib/geo";

/** Loads the potential model and the partner/applicant counts once. Pass a changing `refresh` to reload the counts. */
export type CoverageData = { pot: PotData | null; counts: CovCount[]; err: string };
export function useCoverageData(refresh = 0, skip = false): CoverageData {
  const [pot, setPot] = useState<PotData | null>(null); const [counts, setCounts] = useState<CovCount[]>([]); const [err, setErr] = useState("");
  useEffect(() => { if (!skip) loadPotential().then(setPot).catch(() => setErr("Market potential could not be loaded")); }, [skip]);
  useEffect(() => { if (!skip) supabase.rpc("coverage_counts").then(({ data, error }) => { if (error) setErr(error.message); else setCounts((data as CovCount[]) ?? []); }); }, [refresh, skip]);
  return { pot, counts, err };
}

const two = (a: number, b: number) => <>{a} <span className="mini">dealer{a === 1 ? "" : "s"}</span> · {b} <span className="mini">distributor{b === 1 ? "" : "s"}</span></>;
const cell = (d: Tally, s: Tally, k: keyof Tally) => `${d[k]} / ${s[k]}`;

/** Potential, Required, Onboarded, Pending and the area-wise potential in litres for the chosen area. Controlled (lvl + onLvl) on the map screen, self-driven elsewhere. */
export default function Coverage({ lvl, onLvl, refresh = 0, data }: { lvl?: Lvl; onLvl?: (L: Lvl) => void; refresh?: number; data?: CoverageData }) {
  const fetched = useCoverageData(refresh, !!data); const { pot, counts, err } = data ?? fetched;
  const [own, setOwn] = useState<Lvl>({}); const L = lvl ?? own; const go = (n: Lvl) => (onLvl ? onLvl(n) : setOwn(n));
  const all = coverage(scopeDistricts(L), counts, pot, DEFAULT_MODEL); const rows = areasBelow(L).map((a) => ({ a, c: coverage(a.districts, counts, pot, DEFAULT_MODEL) }));
  const up = L.d ? { mc: L.mc, ci: L.ci, cl: L.cl } : L.cl ? { mc: L.mc, ci: L.ci } : L.ci ? { mc: L.mc } : null;
  return (<div className="card flat" style={{ marginBottom: 10 }}>
    <div className="row"><h2 style={{ margin: 0 }}>Coverage · {scopeName(L)}</h2><div className="sp" />{up && <button className="btn sm" onClick={() => go(up)}>← Up one level</button>}{(L.mc || L.ci || L.cl || L.d) && <button className="btn sm" onClick={() => go({})}>All Gujarat</button>}</div>
    {err && <div className="note bad">{err}</div>}
    <div className="kpis" style={{ marginTop: 8 }}>
      <Kpi label="Potential" value={<>{fmtL(all.potential)} <span className="mini">litres / day</span></>} note={`${fmtL(all.potential * 25)} L a month (25 days)`} />
      <Kpi label="Required dealers / distributors" value={two(all.dealers.required, all.distributors.required)} note={`${all.districts} district${all.districts === 1 ? "" : "s"}`} />
      <Kpi label="Onboarded" value={two(all.dealers.onboarded, all.distributors.onboarded)} note="active partners" />
      <Kpi label="Pending" value={two(all.dealers.pending, all.distributors.pending)} note="applications in progress + agreement pending" /></div>
    <details open style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>Area-wise potential in litres</summary>
      <div className="tw"><table className="t"><thead><tr><th>Area</th><th className="n">Potential (L / day)</th><th className="n">Required<br /><span className="mini">dealer / distributor</span></th><th className="n">Onboarded<br /><span className="mini">dealer / distributor</span></th><th className="n">Pending<br /><span className="mini">dealer / distributor</span></th></tr></thead>
        <tbody>{rows.map(({ a, c }) => <tr key={a.key}><td>{a.next && !(L.d) ? <button className="lk" onClick={() => go(a.next!)}>{a.label}</button> : a.label}</td><td className="n">{fmtL(c.potential)}</td><td className="n">{cell(c.dealers, c.distributors, "required")}</td><td className="n">{cell(c.dealers, c.distributors, "onboarded")}</td><td className="n">{cell(c.dealers, c.distributors, "pending")}</td></tr>)}
          {rows.length > 1 && <tr><td><b>Total</b></td><td className="n"><b>{fmtL(all.potential)}</b></td><td className="n"><b>{cell(all.dealers, all.distributors, "required")}</b></td><td className="n"><b>{cell(all.dealers, all.distributors, "onboarded")}</b></td><td className="n"><b>{cell(all.dealers, all.distributors, "pending")}</b></td></tr>}</tbody></table></div>
      <p className="mini">Potential is the district market estimate (Census population grown to 2026, 10 ml per buyer per day). Required = potential ÷ {DEFAULT_MODEL.dealerLpd} litres a day per dealer, plus {DEFAULT_MODEL.distributorsPerDistrict} distributor per district. Onboarded counts active partners; Pending counts applications still in progress and partners waiting to sign. A planning estimate, not a forecast.</p></details>
  </div>);
}
