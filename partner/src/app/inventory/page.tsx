"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import type { Role } from "@/lib/roles";
import { traceBatch, type TraceRow } from "@/lib/trace";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type Dn2 = { order_id: string; vehicle: string | null; lr_no: string | null; batch_ref: string | null; dispatched_at: string };
type St = { sku: string; available: number; reserved: number; reorder_level: number };
type Mv = { sku: string; delta: number; reason: string; order_id: string | null; at: string };
type Dn = { order_id: string; vehicle: string | null; lr_no: string | null; batch_ref: string | null; dispatched_at: string };
type Batch = { batch_ref: string; product: string | null; qc_status: string | null; qty: number | null };

function Inner({ role }: { role: Role }) {
  const canAdjust = role === "super_admin" || role === "warehouse";
  const [tab, setTab] = useState("stock"); const [bq, setBq] = useState(""); const [tr, setTr] = useState<TraceRow[] | null>(null);
  useEffect(() => { const h = window.location.hash.replace("#", ""); if (["stock", "batches", "dispatches", "trace"].includes(h)) setTab(h); }, []);
  const [st, setSt] = useState<St[]>([]); const [mv, setMv] = useState<Mv[]>([]); const [dn, setDn] = useState<Dn[]>([]); const [batches, setBatches] = useState<Batch[] | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setSt(((await supabase.from("stock").select("sku,available,reserved,reorder_level").order("sku").limit(500)).data as St[]) ?? []);
    setMv(((await supabase.from("stock_moves").select("sku,delta,reason,order_id,at").order("at", { ascending: false }).limit(30)).data as Mv[]) ?? []);
    setDn(((await supabase.from("dispatch_notes").select("order_id,vehicle,lr_no,batch_ref,dispatched_at").order("dispatched_at", { ascending: false }).limit(30)).data as Dn[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function adjust(s: string) {
    const f = await askForm(`Adjust stock · ${s}`, [{ name: "d", label: "Change in cartons", type: "number", required: true, hint: "Use a minus sign to reduce" }, { name: "why", label: "Reason (stock take, goods received, damage …)", type: "textarea", required: true }], { ok: "Update stock" }); if (!f) return; const d = Number(f.d), why = f.why.trim(); if (!d) return;
    const { error } = await supabase.rpc("adjust_stock", { s, delta: Math.trunc(d), why }); setMsg({ ok: !error, t: error ? error.message : "Stock updated" }); load();
  }
  async function trace() {
    const ref = bq.trim(); if (!ref) return;
    const { data: d } = await supabase.from("dispatch_notes").select("order_id,vehicle,lr_no,batch_ref,dispatched_at").ilike("batch_ref", ref.replace(/[%,]/g, "")).limit(200);
    const dns = (d as Dn2[]) ?? []; const ids = [...new Set(dns.map((x) => x.order_id))];
    const o = ids.length ? ((await supabase.from("orders").select("id,partner_id,status").in("id", ids)).data as { id: string; partner_id: string; status: string }[]) ?? [] : [];
    const l = ids.length ? ((await supabase.from("order_lines").select("order_id,sku,cartons").in("order_id", ids)).data as { order_id: string; sku: string; cartons: number }[]) ?? [] : [];
    setTr(traceBatch(ref, dns, o, l));
  }
  async function loadBatches() {
    const { data, error } = await supabase.functions.invoke("batch-qc", { body: {} });
    if (error) setMsg({ ok: false, t: "Batch system not reachable yet: " + error.message }); else setBatches((data?.batches as Batch[]) ?? []);
  }
  return (<><h1>Inventory &amp; dispatch</h1><p className="sub">Stock by SKU, linked to manufacturing batches from your Batch Management &amp; QA/QC system, so every dispatch can be traced back to its batch.</p><div className="tabs" role="tablist">{[["stock", "Stock"], ["batches", "Batches"], ["dispatches", "Dispatches"], ["trace", "Traceability"]].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className="tabbtn" onClick={() => { setTab(k); history.replaceState(null, "", "#" + k); }}>{n}</button>)}</div>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {tab === "stock" && <><div className="card"><table><thead><tr><th>SKU</th><th>In stock (cartons)</th><th>Reserved</th><th>Free</th><th>Reorder level</th><th></th></tr></thead><tbody>
      {st.map((s) => { const free = s.available - s.reserved; return (<tr key={s.sku}><td>{s.sku}</td><td>{s.available}</td><td>{s.reserved}</td><td style={{ color: free <= s.reorder_level ? "#b3261e" : undefined }}>{free}{free <= s.reorder_level ? " (low)" : ""}</td><td>{s.reorder_level}</td><td>{canAdjust && <button className="btn" onClick={() => adjust(s.sku)}>Adjust</button>}</td></tr>); })}
      {st.length === 0 && <tr><td colSpan={6}>No stock records yet.</td></tr>}</tbody></table></div>
    </>}
    {tab === "batches" && <><h2>QC-approved batches (from the Batch Management system)</h2>
    <div className="card"><p>Read-only view. Stock is added here by Warehouse after checking the batch; the batch system is never changed from this portal.</p><button className="btn" onClick={loadBatches}>Load approved batches</button>
      {batches && <table><thead><tr><th>Batch</th><th>Product</th><th>QC</th><th>Quantity</th></tr></thead><tbody>{batches.map((b) => <tr key={b.batch_ref}><td>{b.batch_ref}</td><td>{b.product}</td><td>{b.qc_status}</td><td>{b.qty}</td></tr>)}{batches.length === 0 && <tr><td colSpan={4}>No approved batches returned.</td></tr>}</tbody></table>}</div>
    </>}
    {tab === "stock" && <><h2>Recent stock movements</h2><div className="card"><table><tbody>{mv.map((m, i) => <tr key={i}><td>{when(m.at)}</td><td>{m.sku}</td><td>{m.delta > 0 ? "+" : ""}{m.delta}</td><td>{m.reason}{m.order_id ? ` · ${m.order_id}` : ""}</td></tr>)}{mv.length === 0 && <tr><td>No movements yet.</td></tr>}</tbody></table></div>
    </>}
    {tab === "dispatches" && <><h2>Dispatch notes</h2><div className="card"><table><thead><tr><th>Order</th><th>Vehicle</th><th>LR</th><th>Batch</th><th>Date</th></tr></thead><tbody>{dn.map((d) => <tr key={d.order_id}><td>{d.order_id}</td><td>{d.vehicle}</td><td>{d.lr_no}</td><td>{d.batch_ref}</td><td>{when(d.dispatched_at)}</td></tr>)}{dn.length === 0 && <tr><td colSpan={5}>No dispatches yet.</td></tr>}</tbody></table></div></>}
    {tab === "trace" && <><h2>Batch traceability</h2><div className="card"><p>Enter a batch number to see every dispatch, order and partner that received it.</p>
      <div className="row"><input aria-label="Batch number" placeholder="Batch number" value={bq} onChange={(e) => setBq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && trace()} style={{ maxWidth: 260 }} /> <button className="btn" disabled={!bq.trim()} onClick={trace}>Trace batch</button></div></div>
      {tr && <div className="card" style={{ marginTop: 10 }}><table><thead><tr><th>Order</th><th>Partner</th><th>Status</th><th>Vehicle · LR</th><th>Dispatched</th><th>Cartons</th></tr></thead><tbody>
        {tr.map((r) => <tr key={r.order_id}><td>{r.order_id}</td><td>{r.partner_id}</td><td>{r.status}</td><td>{r.vehicle ?? "—"} · {r.lr_no ?? "—"}</td><td>{when(r.dispatched_at)}</td><td>{r.cartons}<div className="mini">{r.lines.map((l) => `${l.sku} × ${l.cartons}`).join(", ")}</div></td></tr>)}
        {tr.length === 0 && <tr><td colSpan={6}>No dispatch was recorded against this batch.</td></tr>}</tbody></table>{tr.length > 0 && <p className="mini">{tr.reduce((n, r) => n + r.cartons, 0)} cartons across {tr.length} dispatch(es).</p>}</div>}</>}</>);
}
export default function Page() { return <Shell page="inventory">{(p) => <Inner role={p.role} />}</Shell>; }
