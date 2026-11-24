"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type V = { id: string; name: string; person: string | null; email: string | null; supplies: string; district: string; status: string; credit_level: number; created_at: string };
type Rep = { id: string; vendor_id: string; status: string; created_at: string };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin";
  const [v, setV] = useState<V[]>([]); const [reps, setReps] = useState<Rep[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [f, setF] = useState({ nm: "", person: "", mail: "", ph: "", sup: "", dist: "" });
  const load = useCallback(async () => {
    setV(((await supabase.from("vendors").select("*").order("created_at", { ascending: false }).limit(50)).data as V[]) ?? []);
    setReps(((await supabase.from("vendor_stock_reports").select("id,vendor_id,status,created_at").order("created_at", { ascending: false }).limit(20)).data as Rep[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); }
  return (<><h1>Vendors</h1><p className="sub">Suppliers have their own identity, portal and performance matrix, kept apart from sales-channel partners.</p><p>Suppliers have their own identity and portal, kept apart from sales-channel partners. Only Super Admin adds or approves a vendor.</p>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>ID</th><th>Name</th><th>Supplies</th><th>District</th><th>Status</th><th>Credit level</th><th></th></tr></thead><tbody>
      {v.map((x) => <tr key={x.id}><td>{x.id}</td><td>{x.name}<div style={{ fontSize: 12 }}>{x.person}</div></td><td>{x.supplies}</td><td>{x.district}</td><td>{x.status}</td><td>{x.credit_level === 0 ? "Pay & carry" : `Level ${x.credit_level}`}</td>
        <td>{boss && (x.status === "Active" ? <button className="btn" onClick={async () => (await askConfirm("Suspend vendor", `Suspend ${x.id}? The vendor will lose access until you activate it again.`, "Suspend", true)) && call("set_vendor_status", { vid: x.id, st: "Suspended" })}>Suspend</button> : <button className="btn" onClick={() => call("set_vendor_status", { vid: x.id, st: "Active" })}>Approve / activate</button>)}</td></tr>)}
      {v.length === 0 && <tr><td colSpan={7}>No vendors yet.</td></tr>}</tbody></table></div>
    {boss && <><h2>Add a vendor</h2><div className="card">
      {([["nm", "Business name"], ["person", "Contact person"], ["mail", "E-mail"], ["ph", "Phone"], ["sup", "Supplies"], ["dist", "District"]] as const).map(([k, l]) => <p key={k} style={{ margin: "4px 0" }}><label>{l}<br /><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label></p>)}
      <button className="btn" onClick={async () => { await call("create_vendor", { nm: f.nm, person: f.person, mail: f.mail, ph: f.ph, sup: f.sup, dist: f.dist }); setF({ nm: "", person: "", mail: "", ph: "", sup: "", dist: "" }); }}>Add (starts Under Verification)</button></div></>}
    <h2>Vendor stock reports</h2><div className="card"><table><tbody>{reps.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.vendor_id}</td><td>{when(r.created_at)}</td><td>{r.status}</td></tr>)}{reps.length === 0 && <tr><td>No stock reports yet. Approvals are decided in the Approvals centre.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="vendors">{(p) => <Inner role={p.role} />}</Shell>; }
