"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { inr } from "@/lib/orders";
import { roActions, type RO } from "@/lib/procurement";
import { when } from "@/components/ui";

type Rfq = { id: string; rm_id: string; qty: number; needed_by: string | null; note: string | null; status: string };
type Quote = { id: number; rfq_id: string; rate: number; lead_days: number; valid_until: string | null; status: string };
type Card = { orders: number; received: number; on_time_pct: number | null; response_pct: number | null; score: number | null };

type Item = { id: string; name: string; unit: string };

function Inner() {
  const [ros, setRos] = useState<RO[]>([]); const [reps, setReps] = useState<{ id: string; status: string; created_at: string }[]>([]); const [items, setItems] = useState<Item[]>([]);
  const [vals, setVals] = useState<Record<string, { avail: string; rate: string; lead: string }>>({}); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [rfqs, setRfqs] = useState<Rfq[]>([]); const [qs, setQs] = useState<Quote[]>([]); const [card, setCard] = useState<Card | null>(null); const [qv, setQv] = useState<Record<string, { rate: string; lead: string; valid: string }>>({});
  const load = useCallback(async () => {
    setRos(((await supabase.from("release_orders").select("*").order("created_at", { ascending: false }).limit(50)).data as RO[]) ?? []);
    setReps(((await supabase.from("vendor_stock_reports").select("id,status,created_at").order("created_at", { ascending: false }).limit(10)).data as typeof reps) ?? []);
    setRfqs(((await supabase.from("rfqs").select("id,rm_id,qty,needed_by,note,status").order("created_at", { ascending: false }).limit(30)).data as Rfq[]) ?? []);
    setQs(((await supabase.from("quotes").select("id,rfq_id,rate,lead_days,valid_until,status").limit(100)).data as Quote[]) ?? []);
    setCard((((await supabase.rpc("vendor_scorecard", { vid: null })).data as Card[]) ?? [])[0] ?? null);
    setItems(((await supabase.rpc("my_vendor_items")).data as Item[]) ?? []);   // only the items EarthLabs buys from this vendor: no prices, no stock
  }, []);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); }
  const setF = (id: string, k: "avail" | "rate" | "lead", v: string) => setVals((o) => ({ ...o, [id]: { ...{ avail: "", rate: "", lead: "" }, ...o[id], [k]: v } }));
  async function report() {
    const lines = Object.entries(vals).filter(([, v]) => v.avail !== "").map(([rm, v]) => ({ rm, avail: Number(v.avail), rate: v.rate ? Number(v.rate) : null, lead: v.lead ? Number(v.lead) : null }));
    await call("submit_vendor_stock_report", { items: lines }); setVals({});
  }
  return (<><h1>Vendor portal</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <h2>Release orders</h2><div className="card"><table><thead><tr><th>Order</th><th>Item</th><th>Qty</th><th>Value</th><th>Deliver by</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>
      {ros.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.rm_id}</td><td>{r.qty}</td><td>{inr(r.total)}</td><td>{r.eta}</td><td>{r.status}</td><td>{r.pay_status}</td>
        <td style={{ whiteSpace: "nowrap" }}>{roActions("vendor", r).map((a) => a === "acknowledge" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={() => call("vendor_acknowledge_ro", { rid: r.id })}>Acknowledge</button> : a === "dispatch" ? <button key={a} className="btn" onClick={() => call("vendor_dispatch_ro", { rid: r.id })}>Dispatched</button> : null)}
          {["Approved", "Acknowledged"].includes(r.status) && r.pay_status === "Unpaid" && <span style={{ fontSize: 12 }}>Waiting for payment before you dispatch</span>}</td></tr>)}
      {ros.length === 0 && <tr><td colSpan={8}>No release orders yet.</td></tr>}</tbody></table></div>
    <h2>Requests for quotation</h2><div className="card">
      {rfqs.map((r) => { const mine = qs.find((q) => q.rfq_id === r.id); const f = qv[r.id] ?? { rate: "", lead: "", valid: "" }; const set = (k: "rate" | "lead" | "valid", v: string) => setQv((o) => ({ ...o, [r.id]: { ...f, [k]: v } }));
        return <div key={r.id} style={{ borderBottom: "1px solid #e3e8ec", padding: "8px 0" }}><b>{r.id}</b> · {r.rm_id} · {r.qty} {r.needed_by ? `· needed by ${when(r.needed_by)}` : ""} · {r.status}{r.note ? <div className="mini">{r.note}</div> : null}
          {mine && <div>Your quote: ₹{mine.rate} · {mine.lead_days} days {mine.valid_until ? `· valid to ${when(mine.valid_until)}` : ""} · <b>{mine.status}</b></div>}
          {r.status === "Open" && (!mine || mine.status === "Submitted") && <div><input aria-label={`${r.id} rate`} placeholder="Rate ₹ per unit" value={f.rate} onChange={(e) => set("rate", e.target.value)} style={{ width: 130 }} />{" "}
            <input aria-label={`${r.id} lead days`} placeholder="Lead days" value={f.lead} onChange={(e) => set("lead", e.target.value)} style={{ width: 100 }} />{" "}
            <input aria-label={`${r.id} valid until`} type="date" value={f.valid} onChange={(e) => set("valid", e.target.value)} />{" "}
            <button className="btn" disabled={!Number(f.rate) || f.lead === ""} onClick={() => call("submit_quote", { rid: r.id, rt: Number(f.rate), ld: Number(f.lead), valid: f.valid || null })}>{mine ? "Update quote" : "Send quote"}</button></div>}</div>; })}
      {rfqs.length === 0 && <p style={{ margin: 0 }}>No requests for quotation right now.</p>}</div>
    {card && <><h2>Your performance</h2><div className="card"><p style={{ margin: 0 }}>Orders: <b>{card.orders}</b> · Received: <b>{card.received}</b> · On time: <b>{card.on_time_pct ?? "—"}{card.on_time_pct != null ? "%" : ""}</b> · Quote response: <b>{card.response_pct ?? "—"}{card.response_pct != null ? "%" : ""}</b> · Score: <b>{card.score ?? "—"}</b></p></div></>}
    <h2>Stock report</h2><div className="card"><p style={{ marginTop: 0 }}>Tell EarthLabs what you can supply. A report counts only after Super Admin approves it.</p>
      {items.map((i) => <p key={i.id} style={{ margin: "4px 0" }}><b>{i.id}</b>{" "}
        <input aria-label={`${i.id} available`} placeholder="Available" value={vals[i.id]?.avail ?? ""} onChange={(e) => setF(i.id, "avail", e.target.value)} style={{ width: 110 }} />{" "}
        <input aria-label={`${i.id} rate`} placeholder="Rate ₹" value={vals[i.id]?.rate ?? ""} onChange={(e) => setF(i.id, "rate", e.target.value)} style={{ width: 90 }} />{" "}
        <input aria-label={`${i.id} lead days`} placeholder="Lead days" value={vals[i.id]?.lead ?? ""} onChange={(e) => setF(i.id, "lead", e.target.value)} style={{ width: 90 }} /></p>)}
      {items.length === 0 && <p>EarthLabs has not listed any item for you yet.</p>}
      {items.length > 0 && <button className="btn" onClick={report}>Send stock report</button>}
      <p style={{ fontSize: 12 }}>Past reports: {reps.map((r) => `${r.id} (${r.status})`).join(", ") || "none"}</p></div></>);
}
export default function Page() { return <Shell page="vendor">{() => <Inner />}</Shell>; }
