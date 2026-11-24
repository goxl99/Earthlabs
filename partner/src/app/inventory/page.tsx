"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import type { Role } from "@/lib/roles";

type St = { sku: string; available: number; reserved: number; reorder_level: number };
type Mv = { sku: string; delta: number; reason: string; order_id: string | null; at: string };
type Dn = { order_id: string; vehicle: string | null; lr_no: string | null; batch_ref: string | null; dispatched_at: string };
type Batch = { batch_ref: string; product: string | null; qc_status: string | null; qty: number | null };

function Inner({ role }: { role: Role }) {
  const canAdjust = role === "super_admin" || role === "warehouse";
  const [st, setSt] = useState<St[]>([]); const [mv, setMv] = useState<Mv[]>([]); const [dn, setDn] = useState<Dn[]>([]); const [batches, setBatches] = useState<Batch[] | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setSt(((await supabase.from("stock").select("sku,available,reserved,reorder_level").order("sku").limit(500)).data as St[]) ?? []);
    setMv(((await supabase.from("stock_moves").select("sku,delta,reason,order_id,at").order("at", { ascending: false }).limit(30)).data as Mv[]) ?? []);
    setDn(((await supabase.from("dispatch_notes").select("order_id,vehicle,lr_no,batch_ref,dispatched_at").order("dispatched_at", { ascending: false }).limit(30)).data as Dn[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function adjust(s: string) {
    const d = Number(prompt(`Change in cartons for ${s} (use a minus sign to reduce)`)); if (!d) return; const why = prompt("Reason (stock take, goods received, damage …)"); if (!why) return;
    const { error } = await supabase.rpc("adjust_stock", { s, delta: Math.trunc(d), why }); setMsg({ ok: !error, t: error ? error.message : "Stock updated" }); load();
  }
  async function loadBatches() {
    const { data, error } = await supabase.functions.invoke("batch-qc", { body: {} });
    if (error) setMsg({ ok: false, t: "Batch system not reachable yet: " + error.message }); else setBatches((data?.batches as Batch[]) ?? []);
  }
  return (<><h1>Inventory &amp; dispatch</h1><p className="sub">Stock by SKU, linked to manufacturing batches from your Batch Management &amp; QA/QC system, so every dispatch can be traced back to its batch.</p>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>SKU</th><th>In stock (cartons)</th><th>Reserved</th><th>Free</th><th>Reorder level</th><th></th></tr></thead><tbody>
      {st.map((s) => { const free = s.available - s.reserved; return (<tr key={s.sku}><td>{s.sku}</td><td>{s.available}</td><td>{s.reserved}</td><td style={{ color: free <= s.reorder_level ? "#b3261e" : undefined }}>{free}{free <= s.reorder_level ? " (low)" : ""}</td><td>{s.reorder_level}</td><td>{canAdjust && <button className="btn" onClick={() => adjust(s.sku)}>Adjust</button>}</td></tr>); })}
      {st.length === 0 && <tr><td colSpan={6}>No stock records yet.</td></tr>}</tbody></table></div>
    <h2>QC-approved batches (from the Batch Management system)</h2>
    <div className="card"><p>Read-only view. Stock is added here by Warehouse after checking the batch; the batch system is never changed from this portal.</p><button className="btn" onClick={loadBatches}>Load approved batches</button>
      {batches && <table><thead><tr><th>Batch</th><th>Product</th><th>QC</th><th>Quantity</th></tr></thead><tbody>{batches.map((b) => <tr key={b.batch_ref}><td>{b.batch_ref}</td><td>{b.product}</td><td>{b.qc_status}</td><td>{b.qty}</td></tr>)}{batches.length === 0 && <tr><td colSpan={4}>No approved batches returned.</td></tr>}</tbody></table>}</div>
    <h2>Recent stock movements</h2><div className="card"><table><tbody>{mv.map((m, i) => <tr key={i}><td>{when(m.at)}</td><td>{m.sku}</td><td>{m.delta > 0 ? "+" : ""}{m.delta}</td><td>{m.reason}{m.order_id ? ` · ${m.order_id}` : ""}</td></tr>)}{mv.length === 0 && <tr><td>No movements yet.</td></tr>}</tbody></table></div>
    <h2>Dispatch notes</h2><div className="card"><table><thead><tr><th>Order</th><th>Vehicle</th><th>LR</th><th>Batch</th><th>Date</th></tr></thead><tbody>{dn.map((d) => <tr key={d.order_id}><td>{d.order_id}</td><td>{d.vehicle}</td><td>{d.lr_no}</td><td>{d.batch_ref}</td><td>{when(d.dispatched_at)}</td></tr>)}{dn.length === 0 && <tr><td colSpan={5}>No dispatches yet.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="inventory">{(p) => <Inner role={p.role} />}</Shell>; }
