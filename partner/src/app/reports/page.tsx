"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { toCsv } from "@/lib/performance";

type Cat = { kind: string; title: string; module: string };
type Rows = Record<string, unknown>[];

function Inner() {
  const [cat, setCat] = useState<Cat[]>([]); const [run, setRun] = useState<{ title: string; rows: Rows } | null>(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { supabase.rpc("report_catalogue").then(({ data, error }) => { if (error) setMsg(error.message); else setCat((data as Cat[]) ?? []); }); }, []);
  async function go(c: Cat) {
    setMsg(null);
    const { data, error } = await supabase.rpc("run_report", { kind: c.kind, d_from: from || null, d_to: to || null });
    if (error) { setMsg(error.message); return; }
    setRun({ title: c.title, rows: (data as Rows) ?? [] });
  }
  function download() {
    if (!run) return;
    const blob = new Blob([toCsv(run.rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${run.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  const cols = run && run.rows.length ? Object.keys(run.rows[0]) : [];
  return (<><h1>Reports &amp; exports</h1><p className="sub">Every export follows the viewer’s role: you only see reports for modules you can open.</p>
    <p className="no-print">You see only the reports your role may run. Every run is written to the audit trail. A run returns at most 5,000 rows. Download as CSV (opens in Excel) or print to PDF.</p>
    {msg && <Msg kind="bad">{msg}</Msg>}
    <div className="card no-print"><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label> <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <p className="mini">The dates apply to reports that have a date (orders, invoices, collections, dispatch, applications, release orders).</p>
      <table><thead><tr><th>Report</th><th>Module</th><th></th></tr></thead><tbody>{cat.map((c) => <tr key={c.kind}><td><b>{c.title}</b></td><td>{c.module}</td><td><button className="btn" onClick={() => go(c)}>Run</button></td></tr>)}
        {cat.length === 0 && <tr><td colSpan={3}>No reports for your role.</td></tr>}</tbody></table></div>
    {run && <div className="card"><div className="no-print" style={{ float: "right" }}><button className="btn" onClick={download} disabled={!run.rows.length}>Download CSV</button> <button className="btn" onClick={() => window.print()}>Print / save as PDF</button></div>
      <h2>{run.title}</h2><p className="mini">{run.rows.length} row(s) · {new Date().toLocaleString("en-IN")}</p>
      {run.rows.length ? <table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{run.rows.slice(0, 200).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c] == null ? "" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}</td>)}</tr>)}</tbody></table> : <p>No rows for this period.</p>}
      {run.rows.length > 200 && <p className="mini">Showing the first 200 rows. The CSV has all {run.rows.length}.</p>}</div>}
  </>);
}
export default function Page() { return <Shell page="reports">{() => <Inner />}</Shell>; }
