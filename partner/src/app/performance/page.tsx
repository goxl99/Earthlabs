"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { bandOf, computeScore, assess, quarterOf, type Weight, type Rule } from "@/lib/performance";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type Row = { partner_id: string; name: string; type_code: string; status: string; month: string | null; score: number | null; band: string | null; prev_score: number | null; direction: string; unverified: number };
type Hist = { month: string; score: number | null; band: string | null; params: (number | null)[]; weights: Weight[] };
type Perf = { partner_id: string; history: Hist[]; assessment: { quarter: string; to_type: string; state: string; status: string; weighted: number | null; quarters_ok: number } | null };
type Pending = { id: number; partner_id: string; quarter: string; from_type: string; to_type: string; weighted: number | null; quarters_ok: number; state: string; status: string };
type Ladder = { top: boolean; step?: string; next_type?: string; quarters_needed?: number; promote_at?: number; criteria?: { n: string; w: number; full_score_at: number; gate: number }[]; latest?: { quarter: string; state: string; status: string; weighted: number | null; quarters_ok: number; actuals: (number | null)[] } | null };

const pct = (v: number | null) => (v == null ? "unverified" : `${Math.round(v * 100)}%`);

function Matrix({ h }: { h: Hist }) {
  return (<table><thead><tr><th>Parameter</th><th>Weight</th><th>Score</th><th>Points</th></tr></thead><tbody>
    {h.weights.map((w, i) => { const v = h.params[i]; return <tr key={i}><td>{w.n}</td><td>{w.w}</td><td>{pct(v)}</td><td>{v == null ? "kept out of the score, not counted as zero" : (w.w * v).toFixed(1)}</td></tr>; })}
  </tbody></table>);
}

function Partner({ pf }: { pf: Perf }) {
  const [lad, setLad] = useState<Ladder | null>(null);
  useEffect(() => { supabase.rpc("growth_ladder", { pid: pf.partner_id }).then(({ data }) => setLad(data as Ladder)); }, [pf.partner_id]);
  const cur = pf.history[0];
  return (<>
    <div className="card"><h2>{cur?.score == null ? "No verified score yet" : `${cur.score} / 100 · ${cur.band}`}</h2>
      <p>{cur ? `Month of ${when(cur.month)}` : "Your score appears once EarthLabs has verified your first month."}</p>
      {cur && <Matrix h={cur} />}
      <p className="mini">Score = points earned ÷ verified weight × 100. Bands: 90–100 Outstanding · 80–89 Excellent · 70–79 Good · 60–69 Needs Improvement · below 60 Underperforming.</p></div>
    {pf.history.length > 1 && <div className="card"><h3>Last months</h3><table><thead><tr><th>Month</th><th>Score</th><th>Band</th></tr></thead><tbody>{pf.history.map((h) => <tr key={h.month}><td>{when(h.month)}</td><td>{h.score ?? "unverified"}</td><td>{h.band ?? ""}</td></tr>)}</tbody></table></div>}
    <h2>Growth ladder</h2>
    {lad?.top && <Msg>You are at the top step.</Msg>}
    {lad && !lad.top && <div className="card"><h3>{lad.step}</h3>
      <p>Management reviews eligibility every quarter and makes the decision. You need {lad.promote_at != null ? Math.round(lad.promote_at * 100) : ""}% on the criteria below for {lad.quarters_needed} quarter(s) in a row, and every minimum must be met.</p>
      <table><thead><tr><th>Criterion</th><th>Weight</th><th>Full score at</th><th>Your latest</th></tr></thead><tbody>{lad.criteria?.map((c, i) => <tr key={i}><td>{c.n}</td><td>{Math.round(c.w * 100)}%</td><td>{c.full_score_at}</td><td>{lad.latest?.actuals?.[i] ?? "—"}</td></tr>)}</tbody></table>
      {lad.latest ? <p>Latest assessment {lad.latest.quarter}: <b>{lad.latest.state}</b> · {lad.latest.quarters_ok} quarter(s) in a row{lad.latest.status !== "Recorded" ? ` · ${lad.latest.status}` : ""}</p> : <p>No assessment yet.</p>}</div>}
  </>);
}

function Staff({ role }: { role: Role }) {
  const boss = role === "super_admin"; const canAssess = boss || role === "sales";
  const [rows, setRows] = useState<Row[]>([]); const [page, setPage] = useState(0); const [sel, setSel] = useState<string>(""); const [pf, setPf] = useState<Perf | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]); const [rules, setRules] = useState<Record<string, Rule>>({}); const [pending, setPending] = useState<Pending[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [vals, setVals] = useState<string[]>(Array(8).fill("")); const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [note, setNote] = useState("");
  const [qtr, setQtr] = useState(quarterOf(new Date())); const [act, setAct] = useState<string[]>([]);
  const [wEdit, setWEdit] = useState<string[] | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.rpc("performance_overview", { lim: 50, off: page * 50 }); setRows((r.data as Row[]) ?? []);
    setWeights(((await supabase.from("settings").select("value").eq("key", "score_weights").maybeSingle()).data?.value as Weight[]) ?? []);
    setRules(((await supabase.from("settings").select("value").eq("key", "promotion_rules").maybeSingle()).data?.value as Record<string, Rule>) ?? {});
    setPending(((await supabase.from("promotion_assessments").select("id,partner_id,quarter,from_type,to_type,weighted,quarters_ok,state,status").in("status", ["Pending"]).order("created_at").limit(50)).data as Pending[]) ?? []);
  }, [page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) supabase.rpc("partner_performance", { pid: sel }).then(({ data }) => setPf(data as Perf)); else setPf(null); }, [sel]);
  const selRow = rows.find((r) => r.partner_id === sel); const rule = selRow ? rules[selRow.type_code] : undefined;
  useEffect(() => { setAct(rule ? Array(rule.items.length).fill("") : []); }, [rule]);
  const params = vals.map((v) => (v.trim() === "" ? null : Number(v) / 100));
  const prev = useMemo(() => computeScore(params, weights), [vals, weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const aPrev = rule ? assess(rule, act.map((v) => (v.trim() === "" ? null : Number(v))), 1) : null;
  async function call(fn: string, args: Record<string, unknown>, after?: () => void) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Saved" }); if (!error) { after?.(); load(); if (sel) supabase.rpc("partner_performance", { pid: sel }).then(({ data }) => setPf(data as Perf)); } }
  return (<>
    <p>Every partner has a measurable profile. Missing data is shown as <b>unverified</b> and is never counted as zero. Scores and promotion decisions are recorded in the audit trail.</p>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>Partner</th><th>Category</th><th>Score</th><th>Band</th><th>Direction</th><th>Unverified</th><th></th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.partner_id}><td><b>{r.name}</b><br /><span className="mini">{r.partner_id}</span></td><td>{r.type_code}</td><td>{r.score ?? "—"}</td><td>{r.band ?? ""}</td><td>{r.direction}</td><td>{r.unverified}</td><td><button className="btn" onClick={() => setSel(r.partner_id)}>Open</button></td></tr>)}
      {rows.length === 0 && <tr><td colSpan={7}>No active partners yet.</td></tr>}</tbody></table>
      <div style={{ marginTop: 8 }}><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> <button className="btn" disabled={rows.length < 50} onClick={() => setPage(page + 1)}>Next</button></div></div>
    {selRow && pf && <><h2>{selRow.name} <span className="mini">{selRow.partner_id}</span></h2>
      <Partner pf={pf} />
      <div className="card"><h3>Record the monthly score</h3>
        <p>Enter each parameter as a percentage (0–100). Leave blank when it cannot be verified yet.</p>
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <table><tbody>{weights.map((w, i) => <tr key={i}><td>{w.n} <span className="mini">(weight {w.w})</span></td><td><input aria-label={w.n} type="number" min={0} max={100} value={vals[i]} onChange={(e) => setVals(vals.map((x, j) => (j === i ? e.target.value : x)))} /></td></tr>)}</tbody></table>
        <p><button className="btn" onClick={async () => { const { data, error } = await supabase.rpc("suggest_score_inputs", { pid: sel, m: `${month}-01` }); if (error) { setMsg({ ok: false, t: error.message }); return; } const a = data as (number | null)[]; setVals(a.map((x, i) => (x == null ? vals[i] : String(Math.round(x * 100))))); setMsg({ ok: true, t: `Filled ${a.filter((x) => x != null).length} value(s) from invoices, payments, orders and the linked network. Review them, add the rest, then save.` }); }}>Fill what the system can verify</button></p>
        <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p>Preview: <b>{prev.score ?? "no verified data"}</b> {bandOf(prev.score) ? `· ${bandOf(prev.score)}` : ""} (verified weight {prev.verified} of 100)</p>
        <button className="btn" onClick={() => call("record_partner_score", { pid: sel, m: `${month}-01`, p: params, why: note || null })}>Save score</button></div>
      {canAssess && rule && <div className="card"><h3>Quarterly promotion assessment: {rule.n}</h3>
        <p>Needs {Math.round(rule.promote * 100)}% for {rule.q} quarter(s) in a row, with every minimum met. Management decides; nothing moves on its own.</p>
        <label>Quarter<input value={qtr} onChange={(e) => setQtr(e.target.value)} placeholder="2026-Q4" /></label>
        <table><tbody>{rule.items.map((it, i) => <tr key={i}><td>{it.n} <span className="mini">(full score at {it.hi}, minimum {Math.round(it.min * 100)}%)</span></td><td><input aria-label={it.n} type="number" value={act[i] ?? ""} onChange={(e) => setAct(act.map((x, j) => (j === i ? e.target.value : x)))} /></td></tr>)}</tbody></table>
        {aPrev && <p>Preview (this quarter on its own): <b>{aPrev.state}</b>{aPrev.weighted != null ? ` · weighted ${Math.round(aPrev.weighted * 100)}%` : ""}. The database counts earlier quarters.</p>}
        <button className="btn" onClick={() => call("assess_promotion", { pid: sel, q: qtr, actuals: act.map((v) => (v.trim() === "" ? null : Number(v))) })}>Save assessment</button></div>}
    </>}
    <h2>Promotions waiting for management</h2>
    <div className="card"><table><thead><tr><th>Partner</th><th>Quarter</th><th>Step</th><th>Weighted</th><th>Quarters</th><th></th></tr></thead><tbody>
      {pending.map((p) => <tr key={p.id}><td>{p.partner_id}</td><td>{p.quarter}</td><td>{p.from_type} to {p.to_type}</td><td>{p.weighted != null ? Math.round(p.weighted * 100) + "%" : ""}</td><td>{p.quarters_ok}</td>
        <td style={{ whiteSpace: "nowrap" }}>{boss ? <>
          <button className="btn sm pri" style={{ marginRight: 6 }} onClick={async () => { if (await askConfirm("Promotion decision", `Approve ${p.partner_id} from ${p.from_type} to ${p.to_type}? The Partner ID stays the same.`, "Approve promotion")) call("decide_promotion", { aid: p.id, decision: "Approved", why: null }); }}>Approve</button>
          <button className="btn sm" style={{ marginRight: 6 }} onClick={async () => { const w = await askReason("Defer promotion", "Reason for deferring", "Defer"); if (w) call("decide_promotion", { aid: p.id, decision: "Deferred", why: w }); }}>Defer</button>
          <button className="btn sm red" onClick={async () => { const w = await askReason("Reject promotion", "Reason for rejecting", "Reject", true); if (w) call("decide_promotion", { aid: p.id, decision: "Rejected", why: w }); }}>Reject</button></> : <span className="mini">Only Super Admin decides</span>}</td></tr>)}
      {pending.length === 0 && <tr><td colSpan={6}>Nothing is waiting.</td></tr>}</tbody></table></div>
    <h2>Score weights</h2>
    <div className="card"><table><thead><tr><th>Parameter</th><th>Weight</th></tr></thead><tbody>
      {weights.map((w, i) => <tr key={i}><td>{w.n}</td><td>{boss && wEdit ? <input aria-label={w.n} type="number" value={wEdit[i]} onChange={(e) => setWEdit(wEdit.map((x, j) => (j === i ? e.target.value : x)))} /> : w.w}</td></tr>)}</tbody></table>
      <p className="mini">The eight weights must total 100.</p>
      {boss && (wEdit ? <><button className="btn" onClick={async () => { const next = weights.map((w, i) => ({ ...w, w: Number(wEdit[i]) })); const { error } = await supabase.from("settings").update({ value: next }).eq("key", "score_weights"); setMsg({ ok: !error, t: error ? error.message : "Weights saved" }); if (!error) { setWEdit(null); load(); } }}>Save weights</button> <button className="btn" onClick={() => setWEdit(null)}>Cancel</button></> : <button className="btn" onClick={() => setWEdit(weights.map((w) => String(w.w)))}>Edit weights</button>)}</div>
  </>);
}

function Inner({ role }: { role: Role }) {
  const own = role === "dealer" || role === "distributor"; const [pf, setPf] = useState<Perf | null>(null); const [err, setErr] = useState("");
  useEffect(() => { if (own) supabase.rpc("partner_performance", {}).then(({ data, error }) => { if (error) setErr(error.message); else setPf(data as Perf); }); }, [own]);
  return (<><h1>{own ? "My performance" : "Performance Matrix"}</h1><p className="sub">Every partner has a measurable profile. Primary sales (stock bought from EarthLabs) and secondary sales (what the partner sells on) are kept apart. Missing data is shown as unverified, never as zero.</p>{own ? (err ? <Msg kind="bad">{err}</Msg> : pf ? <Partner pf={pf} /> : <p>Loading…</p>) : <Staff role={role} />}</>);
}
export default function Page() { return <Shell page="performance">{(p) => <Inner role={p.role} />}</Shell>; }
