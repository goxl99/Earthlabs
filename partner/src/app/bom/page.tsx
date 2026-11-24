"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type B = { sku: string; rm_id: string; qty_per_unit: number };
type S = { sku: string; name: string };
type Plan = { rm_id: string; name: string; unit: string; needed: number; on_hand: number; shortfall: number; lead_days: number; order_by: string | null; vendor_id: string | null };

function Inner({ role }: { role: Role }) {
  const wh = role === "super_admin" || role === "warehouse";
  const [bom, setBom] = useState<B[]>([]); const [skus, setSkus] = useState<S[]>([]); const [units, setUnits] = useState<Record<string, string>>({}); const [by, setBy] = useState("");
  const [plan, setPlan] = useState<Plan[] | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setBom(((await supabase.from("bom").select("*").order("sku").limit(500)).data as B[]) ?? []);
    setSkus(((await supabase.from("skus").select("sku,name").order("sku").limit(200)).data as S[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function edit(s: string, rm: string, q: number) { const { error } = await supabase.rpc("set_bom", { s, rm, q }); setMsg({ ok: !error, t: error ? error.message : "Saved" }); load(); }
  async function run() {
    const lines = Object.entries(units).filter(([, v]) => Number(v) > 0).map(([sku, v]) => ({ sku, units: Number(v) }));
    const { data, error } = await supabase.rpc("plan_materials", { plan: lines, need_by: by || null });
    if (error) { setMsg({ ok: false, t: error.message }); return; } setMsg(null); setPlan((data as Plan[]) ?? []);
  }
  async function order(r: Plan) { const { error } = await supabase.rpc("raise_release_order", { rm: r.rm_id, q: r.shortfall }); setMsg({ ok: !error, t: error ? error.message : `Release order raised for ${r.shortfall} ${r.unit} of ${r.name}` }); }
  const withBom = skus.filter((s) => bom.some((b) => b.sku === s.sku));
  return (<><h1>Material planning (bill of materials)</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><h2 style={{ marginTop: 0 }}>Plan production</h2><p className="mini">Enter how many units of each product you plan to make. The plan shows the raw material needed, what is already in stock, and the date to order by.</p>
      {withBom.map((s) => <p key={s.sku} style={{ margin: "4px 0" }}><b>{s.sku}</b> {s.name} <input aria-label={`${s.sku} units`} type="number" min={0} placeholder="Units" style={{ width: 110 }} value={units[s.sku] ?? ""} onChange={(e) => setUnits({ ...units, [s.sku]: e.target.value })} /></p>)}
      {withBom.length === 0 && <p>No product has a bill of materials yet.{wh ? " Add lines below." : ""}</p>}
      <label>Needed by (optional, gives the order-by date)<input type="date" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      <button className="btn" disabled={withBom.length === 0} onClick={run}>Calculate</button>
      {plan && <table style={{ marginTop: 10 }}><thead><tr><th>Material</th><th>Needed</th><th>On hand</th><th>To buy</th><th>Lead</th><th>Order by</th><th></th></tr></thead><tbody>
        {plan.map((r) => <tr key={r.rm_id}><td>{r.name}<div className="mini">{r.rm_id}</div></td><td>{r.needed} {r.unit}</td><td>{r.on_hand}</td><td><b>{r.shortfall}</b></td><td>{r.lead_days} d</td><td>{r.order_by ?? "—"}</td>
          <td>{wh && r.shortfall > 0 && <button className="btn" onClick={() => order(r)}>Raise release order</button>}</td></tr>)}
        {plan.length === 0 && <tr><td colSpan={7}>Nothing needed.</td></tr>}</tbody></table>}</div>
    <h2>Bill of materials</h2>
    <div className="card"><table><thead><tr><th>Product</th><th>Material</th><th>Per unit</th><th></th></tr></thead><tbody>
      {bom.map((b) => <tr key={b.sku + b.rm_id}><td>{b.sku}</td><td>{b.rm_id}</td><td>{b.qty_per_unit}</td><td>{wh && <button className="btn" onClick={async () => { const f = await askForm(`${b.sku} · ${b.rm_id}`, [{ name: "q", label: "Quantity per unit (0 removes the line)", type: "number", required: true, min: 0, value: b.qty_per_unit }], { ok: "Save" }); if (f) edit(b.sku, b.rm_id, Number(f.q)); }}>Change</button>}</td></tr>)}
      {bom.length === 0 && <tr><td colSpan={4}>Empty.</td></tr>}</tbody></table>
      {wh && <button className="btn" style={{ marginTop: 8 }} onClick={async () => { const f = await askForm("Add a BOM line", [{ name: "s", label: "Product SKU", required: true }, { name: "rm", label: "Raw material code", required: true }, { name: "q", label: "Quantity of the material per unit sold", type: "number", required: true, min: 0 }], { ok: "Add line" }); if (f) edit(f.s.trim(), f.rm.trim(), Number(f.q)); }}>Add a line</button>}</div></>);
}
export default function Page() { return <Shell page="bom">{(p) => <Inner role={p.role} />}</Shell>; }
