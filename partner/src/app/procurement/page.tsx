"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { inr } from "@/lib/orders";
import { coverDays, rmState, roActions, type RM, type RO } from "@/lib/procurement";
import type { Role } from "@/lib/roles";

type Proc = { lead_buffer: number; ro_limit: number; auto_limit: number; advance_pct: number; auto_email: boolean };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin", wh = boss || role === "warehouse";
  const [rms, setRms] = useState<RM[]>([]); const [ros, setRos] = useState<RO[]>([]); const [set, setSet] = useState<Proc | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    setRms(((await supabase.from("raw_materials").select("*").order("id").limit(100)).data as RM[]) ?? []);
    setRos(((await supabase.from("release_orders").select("*").order("created_at", { ascending: false }).limit(50)).data as RO[]) ?? []);
    setSet(((await supabase.from("settings").select("value").eq("key", "procurement").maybeSingle()).data?.value as Proc) ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); }
  const incoming = (id: string) => ros.filter((r) => r.rm_id === id && ["Approved", "Acknowledged", "Dispatched"].includes(r.status)).reduce((a, r) => a + Number(r.qty), 0);
  async function saveSettings(s: Proc) { const { error } = await supabase.from("settings").update({ value: s }).eq("key", "procurement"); setMsg({ ok: !error, t: error ? error.message : "Settings saved" }); load(); }
  return (<><h1>Procurement & raw materials</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <h2>Raw-material inventory</h2>
    <div className="card"><table><thead><tr><th>Item</th><th>On hand</th><th>Incoming</th><th>Cover</th><th>Lead</th><th>Vendor</th><th>State</th><th></th></tr></thead><tbody>
      {rms.map((m) => <tr key={m.id}><td>{m.name}<div style={{ fontSize: 12 }}>{m.id}</div></td><td>{m.on_hand} {m.unit}</td><td>{incoming(m.id)}</td><td>{coverDays(m) === 999 ? "n/a" : coverDays(m) + " d"}</td><td>{m.lead_days} d{m.v_lead ? ` (vendor ${m.v_lead})` : ""}</td><td>{m.vendor_id ?? "none"}</td><td>{rmState(m, incoming(m.id), set?.lead_buffer ?? 2)}</td>
        <td style={{ whiteSpace: "nowrap" }}>{wh && <button className="btn" style={{ marginRight: 6 }} onClick={() => { const q = prompt(`Quantity of ${m.name} to order (${m.unit})`); if (q) call("raise_release_order", { rm: m.id, q: Number(q) }); }}>Release order</button>}
          {wh && <button className="btn" style={{ marginRight: 6 }} onClick={() => { const d = prompt("Stock change (+ received, - used)"); if (!d) return; const why = prompt("Reason"); if (why) call("adjust_raw_material", { i: m.id, delta: Number(d), why }); }}>Adjust</button>}
          {boss && <button className="btn" onClick={() => { const l = prompt("Planned lead time (days)", String(m.lead_days)); if (!l) return; const r = prompt("Reorder level", String(m.reorder_level)); if (r == null) return; call("upsert_raw_material", { i: m.id, nm: m.name, un: m.unit, vid: m.vendor_id, reorder: Number(r), perday: m.per_day, lead: Number(l), rt: null }); }}>Lead time</button>}</td></tr>)}
      {rms.length === 0 && <tr><td colSpan={8}>No raw materials yet.</td></tr>}</tbody></table>
      {boss && <button className="btn" style={{ marginTop: 8 }} onClick={() => { const i = prompt("Item code, e.g. RM-01"); const nm = i && prompt("Name"); const vid = nm && prompt("Vendor ID (optional)"); if (!i || !nm) return; const rate = prompt("Planning rate per unit (₹, optional; stays in the database only)"); call("upsert_raw_material", { i, nm, un: prompt("Unit (kg, nos)") || "kg", vid: vid || null, reorder: Number(prompt("Reorder level") || 0), perday: Number(prompt("Use per day") || 0), lead: Number(prompt("Lead time (days)") || 7), rt: rate ? Number(rate) : null }); }}>Add or update an item</button>}</div>
    <h2>Release orders</h2>
    <div className="card"><table><thead><tr><th>Order</th><th>Vendor</th><th>Item</th><th>Qty</th><th>Value</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>
      {ros.map((r) => <tr key={r.id}><td>{r.id}<div style={{ fontSize: 12 }}>{r.eta ? "by " + r.eta : ""}</div></td><td>{r.vendor_id}</td><td>{r.rm_id}</td><td>{r.qty}</td><td>{inr(r.total)}</td><td>{r.status}</td><td>{r.pay_status}{r.pay_mode ? ` (${r.pay_mode})` : ""}</td>
        <td style={{ whiteSpace: "nowrap" }}>{roActions(role, r).map((a) => a === "approve" ? <button key={a} className="btn" style={{ marginRight: 6 }} onClick={() => call("approve_release_order", { rid: r.id })}>Approve</button>
          : a === "reject" ? <button key={a} className="btn" style={{ marginRight: 6 }} onClick={() => { const w = prompt("Reason"); if (w) call("reject_release_order", { rid: r.id, why: w }); }}>Reject</button>
          : a === "pay" ? <button key={a} className="btn" style={{ marginRight: 6 }} onClick={() => { const u = prompt(`UTR of the payment of ${inr(r.pay_amount)}`); if (u) call("release_vendor_payment", { rid: r.id, u, amt: r.pay_amount }); }}>Release payment</button>
          : a === "receive" ? <button key={a} className="btn" onClick={() => call("receive_release_order", { rid: r.id })}>Mark received</button> : null)}</td></tr>)}
      {ros.length === 0 && <tr><td colSpan={8}>No release orders yet.</td></tr>}</tbody></table>
      <p style={{ fontSize: 12 }}>Pay-and-carry: the vendor ships only after Accounts releases the advance, unless the vendor is on an approved credit level. Rate and lead time come from the database, not from this screen.</p></div>
    {set && <><h2>Procurement rules {boss ? "" : "(Super Admin changes these)"}</h2><div className="card">
      <p>Lead-time buffer: <b>{set.lead_buffer} days</b> · Approval limit (flag): <b>{inr(set.ro_limit)}</b> · Auto-approve up to: <b>{set.auto_limit ? inr(set.auto_limit) : "off"}</b> · Advance: <b>{set.advance_pct}%</b> · E-mail vendor on approval: <b>{set.auto_email ? "yes" : "no"}</b></p>
      {boss && <button className="btn" onClick={() => { const n = (l: string, d: number) => Number(prompt(l, String(d)) ?? d); saveSettings({ lead_buffer: n("Lead-time buffer (days)", set.lead_buffer), ro_limit: n("Flag release orders above (₹)", set.ro_limit), auto_limit: n("Auto-approve up to (₹, 0 = off)", set.auto_limit), advance_pct: n("Advance to pay before dispatch (%)", set.advance_pct), auto_email: set.auto_email }); }}>Change rules</button>}</div></>}</>);
}
export default function Page() { return <Shell page="procurement">{(p) => <Inner role={p.role} />}</Shell>; }
