"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import type { Role } from "@/lib/roles";

type Rfq = { id: string; rm_id: string; qty: number; needed_by: string | null; note: string | null; status: string; created_at: string };
type Quote = { id: number; rfq_id: string; vendor_id: string; rate: number; lead_days: number; valid_until: string | null; status: string };
type Card = { vendor_id: string; name: string; orders: number; received: number; on_time_pct: number | null; fill_pct: number | null; response_pct: number | null; score: number | null };
type V = { id: string; name: string; status: string };
type RM = { id: string; name: string; unit: string };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin", wh = boss || role === "warehouse";
  const [rfqs, setRfqs] = useState<Rfq[]>([]); const [qs, setQs] = useState<Quote[]>([]); const [cards, setCards] = useState<Card[]>([]); const [vs, setVs] = useState<V[]>([]); const [rms, setRms] = useState<RM[]>([]);
  const [rm, setRm] = useState(""); const [qty, setQty] = useState(""); const [by, setBy] = useState(""); const [note, setNote] = useState(""); const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setRfqs(((await supabase.from("rfqs").select("*").order("created_at", { ascending: false }).limit(50)).data as Rfq[]) ?? []);
    setQs(((await supabase.from("quotes").select("*").order("rate").limit(300)).data as Quote[]) ?? []);
    setCards(((await supabase.rpc("vendor_scorecard", { vid: null })).data as Card[]) ?? []);
    setVs(((await supabase.from("vendors").select("id,name,status").eq("status", "Active").order("name")).data as V[]) ?? []);
    setRms(((await supabase.from("raw_materials").select("id,name,unit").order("id").limit(200)).data as RM[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error, data } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : fn === "award_quote" ? `Purchase order ${data} created. It follows the normal approval and payment gate.` : "Done" }); load(); }
  const lowest = (id: string) => Math.min(...qs.filter((q) => q.rfq_id === id).map((q) => Number(q.rate)));
  return (<><h1>RFQs, quotes &amp; vendor performance</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {wh && <div className="card"><h2 style={{ marginTop: 0 }}>Ask vendors for a quotation</h2>
      <label>Raw material<select value={rm} onChange={(e) => setRm(e.target.value)}><option value="">Choose</option>{rms.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name} ({m.unit})</option>)}</select></label>
      <label>Quantity<input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <label>Needed by (optional)<input type="date" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      <label>Note to vendors (optional)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <fieldset style={{ border: 0, padding: 0 }}><legend>Invite these active vendors</legend>{vs.map((v) => <label key={v.id} style={{ display: "inline-flex", gap: 6, marginRight: 14 }}><input type="checkbox" checked={pick.includes(v.id)} onChange={() => setPick(pick.includes(v.id) ? pick.filter((x) => x !== v.id) : [...pick, v.id])} /> {v.name}</label>)}{vs.length === 0 && <span>No active vendors yet.</span>}</fieldset>
      <button className="btn" disabled={!rm || !Number(qty) || pick.length === 0} onClick={async () => { await call("create_rfq", { rm, q: Number(qty), needed: by || null, vendors: pick, note_: note || null }); setQty(""); setNote(""); setPick([]); }}>Send RFQ</button></div>}
    <h2>RFQs</h2>
    {rfqs.map((r) => { const rq = qs.filter((q) => q.rfq_id === r.id); return (<div className="card" key={r.id}>
      <p style={{ marginTop: 0 }}><b>{r.id}</b> · {r.rm_id} · {r.qty} {r.needed_by ? `· needed by ${when(r.needed_by)}` : ""} · <b>{r.status}</b> {wh && r.status === "Open" && <button className="btn" style={{ marginLeft: 8 }} onClick={() => call("close_rfq", { rid: r.id })}>Close without awarding</button>}</p>
      <table><thead><tr><th>Vendor</th><th>Rate</th><th>Value</th><th>Lead</th><th>Valid until</th><th>Status</th><th></th></tr></thead><tbody>
        {rq.map((q) => <tr key={q.id}><td>{q.vendor_id}</td><td>{inr(q.rate)}{Number(q.rate) === lowest(r.id) && rq.length > 1 ? " ✓ lowest" : ""}</td><td>{inr(Number(q.rate) * Number(r.qty))}</td><td>{q.lead_days} d</td><td>{when(q.valid_until)}</td><td>{q.status}</td>
          <td>{boss && r.status === "Open" && <button className="btn" onClick={() => { if (confirm(`Award ${r.qty} of ${r.rm_id} to ${q.vendor_id} at ${inr(q.rate)}?`)) call("award_quote", { qid: q.id }); }}>Award</button>}</td></tr>)}
        {rq.length === 0 && <tr><td colSpan={7}>No quotes yet.</td></tr>}</tbody></table>
      {!boss && r.status === "Open" && rq.length > 0 && <p className="mini">Only Super Admin awards a quote.</p>}</div>); })}
    {rfqs.length === 0 && <div className="card">No RFQs yet.</div>}
    <h2>Vendor performance</h2>
    <div className="card"><p className="mini" style={{ marginTop: 0 }}>Score = on-time delivery 60 · orders received 25 · quote response 15, over the parts that have data. Missing data is left out, never counted as zero.</p>
      <table><thead><tr><th>Vendor</th><th>Orders</th><th>Received</th><th>On time</th><th>Received share</th><th>Quote response</th><th>Score</th></tr></thead><tbody>
        {cards.map((c) => <tr key={c.vendor_id}><td>{c.name}<div className="mini">{c.vendor_id}</div></td><td>{c.orders}</td><td>{c.received}</td><td>{c.on_time_pct ?? "—"}{c.on_time_pct != null ? "%" : ""}</td><td>{c.fill_pct ?? "—"}{c.fill_pct != null ? "%" : ""}</td><td>{c.response_pct ?? "—"}{c.response_pct != null ? "%" : ""}</td><td><b>{c.score ?? "—"}</b></td></tr>)}
        {cards.length === 0 && <tr><td colSpan={7}>No vendors yet.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="rfq">{(p) => <Inner role={p.role} />}</Shell>; }
