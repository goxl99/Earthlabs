"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { inr } from "@/lib/orders";

type D = { months: { m: string; invoiced: number; collected: number }[]; top: { id: string; name: string; score: number; band: string | null }[] };
export default function DashCharts() {
  const [d, setD] = useState<D | null>(null);
  useEffect(() => { supabase.rpc("dashboard_charts").then(({ data }) => setD((data as D) ?? null)); }, []);
  if (!d) return null;
  const max = Math.max(1, ...d.months.flatMap((x) => [Number(x.invoiced), Number(x.collected)]));
  return (<div className="grid g2" style={{ marginTop: 16 }}>
    <div className="card"><h2>Invoiced vs collected, by month</h2><p className="mini">Before GST · last 6 months</p>
      <svg viewBox="0 0 420 190" role="img" aria-label="Invoiced versus collected by month" style={{ width: "100%" }}>
        {d.months.map((x, i) => { const w = 420 / d.months.length; const hi = (Number(x.invoiced) / max) * 130, hc = (Number(x.collected) / max) * 130; return (<g key={x.m} transform={`translate(${i * w},0)`}>
          <rect x={w / 2 - 22} y={150 - hi} width={20} height={hi} fill="var(--teal)"><title>Invoiced {inr(Number(x.invoiced))}</title></rect>
          <rect x={w / 2 + 2} y={150 - hc} width={20} height={hc} fill="var(--gold)"><title>Collected {inr(Number(x.collected))}</title></rect>
          <text x={w / 2} y={170} textAnchor="middle" fontSize="11" fill="currentColor">{x.m}</text></g>); })}
      </svg>
      <p className="mini"><span style={{ color: "var(--teal)" }}>■</span> Invoiced &nbsp; <span style={{ color: "var(--gold)" }}>■</span> Collected</p></div>
    <div className="card"><h2>Top 5 partners</h2><p className="mini">By latest verified score</p>
      {d.top.length === 0 ? <p>No scores recorded yet.</p> : <table><thead><tr><th>Partner</th><th>Score</th><th>Band</th></tr></thead><tbody>{d.top.map((t) => <tr key={t.id}><td>{t.name}<div className="mini">{t.id}</div></td><td><b>{Number(t.score).toFixed(1)}</b></td><td>{t.band ?? "—"}</td></tr>)}</tbody></table>}</div>
  </div>);
}
