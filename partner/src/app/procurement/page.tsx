"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { inr } from "@/lib/orders";
import { coverDays, rmState, roActions, type RM, type RO } from "@/lib/procurement";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";
import SubTabs from "@/components/SubTabs";
import { PROC_TABS } from "@/lib/procTabs";

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
  return (<><h1>Procurement & raw materials</h1><p className="sub">Vendor stock, raw-material inventory, release orders and credit. Everything adjustable by management. Linked to the Batch Management System.</p><SubTabs current="/procurement/" items={PROC_TABS} />{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <h2>Raw-material inventory</h2>
    <div className="card"><table><thead><tr><th>Item</th><th>On hand</th><th>Incoming</th><th>Cover</th><th>Lead</th><th>Vendor</th><th>State</th><th></th></tr></thead><tbody>
      {rms.map((m) => <tr key={m.id}><td>{m.name}<div style={{ fontSize: 12 }}>{m.id}</div></td><td>{m.on_hand} {m.unit}</td><td>{incoming(m.id)}</td><td>{coverDays(m) === 999 ? "n/a" : coverDays(m) + " d"}</td><td>{m.lead_days} d{m.v_lead ? ` (vendor ${m.v_lead})` : ""}</td><td>{m.vendor_id ?? "none"}</td><td>{rmState(m, incoming(m.id), set?.lead_buffer ?? 2)}</td>
        <td style={{ whiteSpace: "nowrap" }}>{wh && <button className="btn sm" style={{ marginRight: 6 }} onClick={async () => { const f = await askForm(`New release order · ${m.name}`, [{ name: "q", label: `Quantity (${m.unit})`, type: "number", required: true, min: 0.0001 }], { ok: "Create release order" }); if (f) call("raise_release_order", { rm: m.id, q: Number(f.q) }); }}>Release order</button>}
          {wh && <button className="btn sm" style={{ marginRight: 6 }} onClick={async () => { const f = await askForm(`Adjust stock · ${m.name}`, [{ name: "d", label: `Change (${m.unit})`, type: "number", required: true, hint: "+ received, - used" }, { name: "why", label: "Reason", type: "textarea", required: true }], { ok: "Update stock" }); if (f) call("adjust_raw_material", { i: m.id, delta: Number(f.d), why: f.why.trim() }); }}>Adjust</button>}
          {boss && <button className="btn" onClick={async () => { const f = await askForm(`Lead time · ${m.name}`, [{ name: "l", label: "Planned lead time (days)", type: "number", required: true, min: 0, value: m.lead_days }, { name: "r", label: "Reorder level", type: "number", required: true, min: 0, value: m.reorder_level }], { ok: "Save" }); if (f) call("upsert_raw_material", { i: m.id, nm: m.name, un: m.unit, vid: m.vendor_id, reorder: Number(f.r), perday: m.per_day, lead: Number(f.l), rt: null }); }}>Lead time</button>}</td></tr>)}
      {rms.length === 0 && <tr><td colSpan={8}>No raw materials yet.</td></tr>}</tbody></table>
      {boss && <button className="btn" style={{ marginTop: 8 }} onClick={async () => { const f = await askForm("Add or update a raw material", [{ name: "i", label: "Item code", required: true, hint: "For example RM-01" }, { name: "nm", label: "Name", required: true }, { name: "vid", label: "Vendor ID (optional)" }, { name: "un", label: "Unit", value: "kg" }, { name: "reorder", label: "Reorder level", type: "number", min: 0, value: 0 }, { name: "perday", label: "Use per day", type: "number", min: 0, value: 0 }, { name: "lead", label: "Lead time (days)", type: "number", min: 0, value: 7 }, { name: "rate", label: "Planning rate per unit (₹, optional)", type: "number", min: 0, hint: "Stays in the database only" }], { ok: "Save item" }); if (!f) return; call("upsert_raw_material", { i: f.i.trim(), nm: f.nm.trim(), un: f.un.trim() || "kg", vid: f.vid.trim() || null, reorder: Number(f.reorder || 0), perday: Number(f.perday || 0), lead: Number(f.lead || 7), rt: f.rate ? Number(f.rate) : null }); }}>Add or update an item</button>}</div>
    <h2>Release orders</h2>
    <div className="card"><table><thead><tr><th>Order</th><th>Vendor</th><th>Item</th><th>Qty</th><th>Value</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>
      {ros.map((r) => <tr key={r.id}><td>{r.id}<div style={{ fontSize: 12 }}>{r.eta ? "by " + r.eta : ""}</div></td><td>{r.vendor_id}</td><td>{r.rm_id}</td><td>{r.qty}</td><td>{inr(r.total)}</td><td>{r.status}</td><td>{r.pay_status}{r.pay_mode ? ` (${r.pay_mode})` : ""}</td>
        <td style={{ whiteSpace: "nowrap" }}>{roActions(role, r).map((a) => a === "approve" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={() => call("approve_release_order", { rid: r.id })}>Approve</button>
          : a === "reject" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={async () => { const w = await askReason("Reject release order", "Reason", "Reject", true); if (w) call("reject_release_order", { rid: r.id, why: w }); }}>Reject</button>
          : a === "pay" ? <button key={a} className="btn sm" style={{ marginRight: 6 }} onClick={async () => { const f = await askForm("Release payment to vendor", [{ name: "u", label: "UTR / reference number", required: true, hint: `Amount ${inr(r.pay_amount)}` }], { ok: "Release payment" }); if (f) call("release_vendor_payment", { rid: r.id, u: f.u.trim(), amt: r.pay_amount }); }}>Release payment</button>
          : a === "receive" ? <button key={a} className="btn" onClick={() => call("receive_release_order", { rid: r.id })}>Mark received</button> : null)}</td></tr>)}
      {ros.length === 0 && <tr><td colSpan={8}>No release orders yet.</td></tr>}</tbody></table>
      <p style={{ fontSize: 12 }}>Pay-and-carry: the vendor ships only after Accounts releases the advance, unless the vendor is on an approved credit level. Rate and lead time come from the database, not from this screen.</p></div>
    {set && <><h2>Procurement rules {boss ? "" : "(Super Admin changes these)"}</h2><div className="card">
      <p>Lead-time buffer: <b>{set.lead_buffer} days</b> · Approval limit (flag): <b>{inr(set.ro_limit)}</b> · Auto-approve up to: <b>{set.auto_limit ? inr(set.auto_limit) : "off"}</b> · Advance: <b>{set.advance_pct}%</b> · E-mail vendor on approval: <b>{set.auto_email ? "yes" : "no"}</b></p>
      {boss && <button className="btn" onClick={async () => { const f = await askForm("Rules & lead times", [{ name: "lb", label: "Lead-time buffer (days)", type: "number", min: 0, value: set.lead_buffer }, { name: "ro", label: "Flag release orders above (₹)", type: "number", min: 0, value: set.ro_limit }, { name: "au", label: "Auto-approve up to (₹, 0 = off)", type: "number", min: 0, value: set.auto_limit }, { name: "ad", label: "Advance to pay before dispatch (%)", type: "number", min: 0, max: 100, value: set.advance_pct }], { ok: "Save rules" }); if (!f) return; saveSettings({ lead_buffer: Number(f.lb), ro_limit: Number(f.ro), auto_limit: Number(f.au), advance_pct: Number(f.ad), auto_email: set.auto_email }); }}>Change rules</button>}</div></>}</>);
}
export default function Page() { return <Shell page="procurement">{(p) => <Inner role={p.role} />}</Shell>; }
