"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SubTabs from "@/components/SubTabs";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import { roActions, type RO } from "@/lib/procurement";
import { askForm, askReason, askConfirm } from "@/lib/dialog";

import { VENDOR_TABS } from "@/lib/vendorTabs";
type Flash = { ok: boolean; t: string } | null;
function useCall(reload: () => void) {
  const [msg, setMsg] = useState<Flash>(null);
  const call = async (fn: string, args: Record<string, unknown>, done = "Done") => { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : done }); reload(); return !error; };
  return { msg, setMsg, call };
}
export function VendorFrame({ current, title, children }: { current: string; title: string; children: React.ReactNode }) {
  return <Shell page="vendor">{() => <><h1>{title}</h1><SubTabs items={VENDOR_TABS} current={current} />{children}</>}</Shell>;
}

type Item = { id: string; name: string; unit: string };
export function StockView() {
  const [reps, setReps] = useState<{ id: string; status: string; created_at: string }[]>([]); const [items, setItems] = useState<Item[]>([]);
  const [vals, setVals] = useState<Record<string, { avail: string; rate: string; lead: string }>>({});
  const load = useCallback(async () => {
    setReps(((await supabase.from("vendor_stock_reports").select("id,status,created_at").order("created_at", { ascending: false }).limit(10)).data as typeof reps) ?? []);
    setItems(((await supabase.rpc("my_vendor_items")).data as Item[]) ?? []);   // only the items EarthLabs buys from this vendor: no prices, no stock
  }, []);
  useEffect(() => { load(); }, [load]);
  const { msg, call } = useCall(load);
  const setF = (id: string, k: "avail" | "rate" | "lead", v: string) => setVals((o) => ({ ...o, [id]: { ...{ avail: "", rate: "", lead: "" }, ...o[id], [k]: v } }));
  async function report() {
    const lines = Object.entries(vals).filter(([, v]) => v.avail !== "").map(([rm, v]) => ({ rm, avail: Number(v.avail), rate: v.rate ? Number(v.rate) : null, lead: v.lead ? Number(v.lead) : null }));
    if (await call("submit_vendor_stock_report", { items: lines }, "Stock report sent to EarthLabs")) setVals({});
  }
  return (<>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><p style={{ marginTop: 0 }}>Tell EarthLabs what you can supply. A report counts only after Super Admin approves it.</p>
      {items.map((i) => <p key={i.id} style={{ margin: "4px 0" }}><b>{i.id}</b>{" "}
        <input aria-label={`${i.id} available`} placeholder="Available" value={vals[i.id]?.avail ?? ""} onChange={(e) => setF(i.id, "avail", e.target.value)} style={{ width: 110 }} />{" "}
        <input aria-label={`${i.id} rate`} placeholder="Rate ₹" value={vals[i.id]?.rate ?? ""} onChange={(e) => setF(i.id, "rate", e.target.value)} style={{ width: 90 }} />{" "}
        <input aria-label={`${i.id} lead days`} placeholder="Lead days" value={vals[i.id]?.lead ?? ""} onChange={(e) => setF(i.id, "lead", e.target.value)} style={{ width: 90 }} /></p>)}
      {items.length === 0 && <p>EarthLabs has not listed any item for you yet.</p>}
      {items.length > 0 && <button className="btn" onClick={report}>Send stock report</button>}
      <p style={{ fontSize: 12 }}>Past reports: {reps.map((r) => `${r.id} (${r.status})`).join(", ") || "none"}</p></div></>);
}

export function OrdersView() {
  const [ros, setRos] = useState<RO[]>([]);
  const load = useCallback(async () => { setRos(((await supabase.from("release_orders").select("*").order("created_at", { ascending: false }).limit(50)).data as RO[]) ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  const { msg, call } = useCall(load);
  async function reject(r: RO) { const why = await askReason(`Reject ${r.id}`, "Why can you not supply this order?", "Reject order", true); if (why) await call("vendor_reject_ro", { rid: r.id, why }, `${r.id} rejected`); }
  async function progress(r: RO) {
    const v = await askForm(`Delivery update for ${r.id}`, [{ name: "stage", label: "Stage", type: "select", required: true, options: ["In production", "Dispatched"], value: "In production" }, { name: "note", label: "Note (optional, e.g. LR number)", type: "textarea" }], { ok: "Post update" });
    if (v) await call("vendor_delivery_update", { rid: r.id, stage: v.stage, note: v.note || null }, "Delivery update posted");
  }
  return (<>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>Order</th><th>Item</th><th>Qty</th><th>Value</th><th>Deliver by</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>
      {ros.map((r) => { const open = ["Approved", "Acknowledged"].includes(r.status); return <tr key={r.id}><td>{r.id}</td><td>{r.rm_id}</td><td>{r.qty}</td><td>{inr(r.total)}</td><td>{r.eta}</td><td>{r.status}</td><td>{r.pay_status}</td>
        <td style={{ whiteSpace: "nowrap" }}>{roActions("vendor", r).map((a) => a === "acknowledge" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={() => call("vendor_acknowledge_ro", { rid: r.id }, "Acknowledged")}>Acknowledge</button> : a === "dispatch" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={() => call("vendor_dispatch_ro", { rid: r.id }, "Marked dispatched")}>Dispatched</button> : null)}
          {open && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => progress(r)}>Delivery update</button>}
          {open && r.pay_status === "Unpaid" && <button className="btn sm" onClick={() => reject(r)}>Reject</button>}
          {open && r.pay_status === "Unpaid" && <span style={{ fontSize: 12, marginLeft: 6 }}>Waiting for payment before you dispatch</span>}</td></tr>; })}
      {ros.length === 0 && <tr><td colSpan={8}>No purchase orders yet.</td></tr>}</tbody></table></div></>);
}

type Rfq = { id: string; rm_id: string; qty: number; needed_by: string | null; note: string | null; status: string };
type Quote = { id: number; rfq_id: string; rate: number; lead_days: number; valid_until: string | null; status: string };
export function QuotesView() {
  const [rfqs, setRfqs] = useState<Rfq[]>([]); const [qs, setQs] = useState<Quote[]>([]); const [qv, setQv] = useState<Record<string, { rate: string; lead: string; valid: string }>>({});
  const load = useCallback(async () => {
    setRfqs(((await supabase.from("rfqs").select("id,rm_id,qty,needed_by,note,status").order("created_at", { ascending: false }).limit(30)).data as Rfq[]) ?? []);
    setQs(((await supabase.from("quotes").select("id,rfq_id,rate,lead_days,valid_until,status").limit(100)).data as Quote[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const { msg, call } = useCall(load);
  return (<>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}<div className="card">
    {rfqs.map((r) => { const mine = qs.find((q) => q.rfq_id === r.id); const f = qv[r.id] ?? { rate: "", lead: "", valid: "" }; const set = (k: "rate" | "lead" | "valid", v: string) => setQv((o) => ({ ...o, [r.id]: { ...f, [k]: v } }));
      return <div key={r.id} style={{ borderBottom: "1px solid #e3e8ec", padding: "8px 0" }}><b>{r.id}</b> · {r.rm_id} · {r.qty} {r.needed_by ? `· needed by ${when(r.needed_by)}` : ""} · {r.status}{r.note ? <div className="mini">{r.note}</div> : null}
        {mine && <div>Your quote: ₹{mine.rate} · {mine.lead_days} days {mine.valid_until ? `· valid to ${when(mine.valid_until)}` : ""} · <b>{mine.status}</b></div>}
        {r.status === "Open" && (!mine || mine.status === "Submitted") && <div><input aria-label={`${r.id} rate`} placeholder="Rate ₹ per unit" value={f.rate} onChange={(e) => set("rate", e.target.value)} style={{ width: 130 }} />{" "}
          <input aria-label={`${r.id} lead days`} placeholder="Lead days" value={f.lead} onChange={(e) => set("lead", e.target.value)} style={{ width: 100 }} />{" "}
          <input aria-label={`${r.id} valid until`} type="date" value={f.valid} onChange={(e) => set("valid", e.target.value)} />{" "}
          <button className="btn" disabled={!Number(f.rate) || f.lead === ""} onClick={() => call("submit_quote", { rid: r.id, rt: Number(f.rate), ld: Number(f.lead), valid: f.valid || null }, "Quote sent")}>{mine ? "Update quote" : "Send quote"}</button></div>}</div>; })}
    {rfqs.length === 0 && <p style={{ margin: 0 }}>No requests for quotation right now.</p>}</div></>);
}

export type VInv = { id: string; vendor_id: string; ro_id: string; invoice_no: string; invoice_date: string; amount: number; file_path: string | null; status: string; reason: string | null; pay_utr: string | null; created_at: string };
export function InvoicesView() {
  const [inv, setInv] = useState<VInv[]>([]); const [ros, setRos] = useState<RO[]>([]);
  const load = useCallback(async () => {
    setInv(((await supabase.from("vendor_invoices").select("*").order("created_at", { ascending: false }).limit(100)).data as VInv[]) ?? []);
    setRos(((await supabase.from("release_orders").select("*").in("status", ["Dispatched", "Received"]).order("created_at", { ascending: false }).limit(50)).data as RO[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const { msg, setMsg } = useCall(load);
  async function upload(r: RO) {
    const v = await askForm(`Upload invoice for ${r.id}`, [
      { name: "no", label: "Invoice number", required: true }, { name: "date", label: "Invoice date", type: "date", required: true },
      { name: "amt", label: "Invoice amount (₹)", type: "number", required: true, min: 1, value: r.total }], { ok: "Upload invoice", cols: 2 });
    if (!v) return;
    let path: string | null = null;
    const file = (document.getElementById(`vf-${r.id}`) as HTMLInputElement | null)?.files?.[0];
    if (file) {
      const me = (await supabase.rpc("my_vendor")).data as string | null;
      path = `${me}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("vendor-invoices").upload(path, file);
      if (up.error) { setMsg({ ok: false, t: up.error.message }); return; }
    }
    const { error } = await supabase.rpc("submit_vendor_invoice", { rid: r.id, inv_no: v.no, inv_date: v.date, amt: Number(v.amt), path });
    setMsg({ ok: !error, t: error ? error.message : "Invoice sent to EarthLabs Accounts" }); load();
  }
  const open = async (p: string) => { const { data } = await supabase.storage.from("vendor-invoices").createSignedUrl(p, 120); if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener"); };
  const billed = new Set(inv.filter((i) => i.status !== "Rejected").map((i) => i.ro_id));
  return (<>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <h2>Ready to invoice</h2><div className="card"><table><thead><tr><th>Order</th><th>Item</th><th>Value</th><th>Status</th><th>Invoice file (optional)</th><th></th></tr></thead><tbody>
      {ros.filter((r) => !billed.has(r.id)).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.rm_id}</td><td>{inr(r.total)}</td><td>{r.status}</td>
        <td><input id={`vf-${r.id}`} type="file" accept="application/pdf,image/*" aria-label={`${r.id} invoice file`} /></td><td><button className="btn sm" onClick={() => upload(r)}>Upload invoice</button></td></tr>)}
      {ros.filter((r) => !billed.has(r.id)).length === 0 && <tr><td colSpan={6}>Nothing waiting. Dispatch an order first, then upload its invoice.</td></tr>}</tbody></table></div>
    <h2>Your invoices</h2><div className="card"><table><thead><tr><th>Invoice</th><th>Order</th><th>Date</th><th>Amount</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>
      {inv.map((i) => <tr key={i.id}><td>{i.invoice_no}<div className="mini">{i.id}</div></td><td>{i.ro_id}</td><td>{when(i.invoice_date)}</td><td>{inr(i.amount)}</td><td>{i.status}{i.reason ? <div className="mini">{i.reason}</div> : null}</td><td>{i.pay_utr ? `UTR ${i.pay_utr}` : "—"}</td>
        <td>{i.file_path && <button className="btn sm" onClick={() => open(i.file_path!)}>View file</button>}</td></tr>)}
      {inv.length === 0 && <tr><td colSpan={7}>No invoices uploaded yet.</td></tr>}</tbody></table></div></>);
}

type Card = { orders: number; received: number; on_time_pct: number | null; response_pct: number | null; score: number | null };
export function PerformanceView() {
  const [card, setCard] = useState<Card | null>(null); const [done, setDone] = useState(false);
  useEffect(() => { supabase.rpc("vendor_scorecard", { vid: null }).then(({ data }) => { setCard(((data as Card[]) ?? [])[0] ?? null); setDone(true); }); }, []);
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  if (!done) return <p className="mini">Loading…</p>;
  if (!card) return <div className="card"><p style={{ margin: 0 }}>Your scorecard appears after your first purchase order.</p></div>;
  return <div className="grid g4"><div className="kpi"><div className="l">Score</div><div className="v">{card.score ?? "—"}</div></div><div className="kpi"><div className="l">On-time delivery</div><div className="v">{pct(card.on_time_pct)}</div></div>
    <div className="kpi"><div className="l">Quote response</div><div className="v">{pct(card.response_pct)}</div></div><div className="kpi"><div className="l">Orders received</div><div className="v">{card.received}</div><div className="d">of {card.orders}</div></div></div>;
}

/** Staff side (Accounts / Super Admin): decide and pay vendor invoices. */
export function StaffVendorInvoices() {
  const [inv, setInv] = useState<VInv[]>([]);
  const load = useCallback(async () => { setInv(((await supabase.from("vendor_invoices").select("*").order("created_at", { ascending: false }).limit(200)).data as VInv[]) ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  const { msg, call } = useCall(load);
  async function reject(i: VInv) { const why = await askReason(`Reject invoice ${i.invoice_no}`, "Reason for the vendor", "Reject invoice", true); if (why) await call("decide_vendor_invoice", { iid: i.id, accept: false, why }, "Invoice rejected"); }
  async function accept(i: VInv) { if (await askConfirm("Accept invoice", `Accept ${i.invoice_no} for ${inr(i.amount)}?`, "Accept")) await call("decide_vendor_invoice", { iid: i.id, accept: true, why: null }, "Invoice accepted"); }
  async function pay(i: VInv) { const v = await askForm(`Record payment for ${i.invoice_no}`, [{ name: "utr", label: "UTR / transaction reference", required: true }], { ok: "Record payment" }); if (v) await call("pay_vendor_invoice", { iid: i.id, utr: v.utr }, "Payment recorded"); }
  const open = async (p: string) => { const { data } = await supabase.storage.from("vendor-invoices").createSignedUrl(p, 120); if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener"); };
  return (<>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}<div className="card"><table><thead><tr><th>Invoice</th><th>Vendor</th><th>Order</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
    {inv.map((i) => <tr key={i.id}><td>{i.invoice_no}<div className="mini">{i.id} · {when(i.invoice_date)}</div></td><td>{i.vendor_id}</td><td>{i.ro_id}</td><td>{inr(i.amount)}</td><td>{i.status}{i.pay_utr ? <div className="mini">UTR {i.pay_utr}</div> : null}{i.reason ? <div className="mini">{i.reason}</div> : null}</td>
      <td style={{ whiteSpace: "nowrap" }}>{i.file_path && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => open(i.file_path!)}>View file</button>}
        {i.status === "Submitted" && <><button className="btn sm" style={{ marginRight: 6 }} onClick={() => accept(i)}>Accept</button><button className="btn sm" onClick={() => reject(i)}>Reject</button></>}
        {i.status === "Accepted" && <button className="btn sm" onClick={() => pay(i)}>Record payment</button>}</td></tr>)}
    {inv.length === 0 && <tr><td colSpan={6}>No vendor invoices yet.</td></tr>}</tbody></table></div></>);
}
