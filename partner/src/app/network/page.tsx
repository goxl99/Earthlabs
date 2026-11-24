"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { inr } from "@/lib/orders";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason } from "@/lib/dialog";

type N = { id: string; name: string; type_code: string; district: string; status: string; orders_90d: number; billed_90d: number; last_score: number | null };
type P = { id: string; name: string; type_code: string; district: string; parent_id: string | null };

function Own() {
  const [rows, setRows] = useState<N[] | null>(null);
  useEffect(() => { supabase.rpc("my_network").then(({ data }) => setRows((data as N[]) ?? [])); }, []);
  if (!rows) return <p>Loading…</p>;
  return (<><h1>My network</h1><p>The partners linked to you by EarthLabs, and how they bought in the last 90 days. You see activity, not their commercial terms.</p>
    <div className="card"><table><thead><tr><th>Partner</th><th>Type</th><th>District</th><th>Status</th><th>Orders (90 d)</th><th>Billed (90 d)</th><th>Latest score</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td><b>{r.name}</b><div className="mini">{r.id}</div></td><td>{r.type_code}</td><td>{r.district}</td><td>{r.status}</td><td>{r.orders_90d}</td><td>{inr(r.billed_90d)}</td><td>{r.last_score ?? "—"}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={7}>No partners are linked to you yet. EarthLabs links dealers to their distributor.</td></tr>}</tbody></table></div></>);
}

function Staff() {
  const [ps, setPs] = useState<P[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [q, setQ] = useState("");
  const load = useCallback(async () => { setPs(((await supabase.from("partners").select("id,name,type_code,district,parent_id").eq("status", "Active").order("name").limit(500)).data as P[]) ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function link(pid: string, parent: string | null) { const { error } = await supabase.rpc("set_partner_parent", { pid, parent }); setMsg({ ok: !error, t: error ? error.message : "Saved" }); load(); }
  const name = (id: string | null) => (id ? ps.find((p) => p.id === id)?.name ?? id : "—");
  const shown = ps.filter((p) => !q || (p.name + p.id + p.district).toLowerCase().includes(q.toLowerCase()));
  return (<><h1>Partner network links</h1>{msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <p>Link each dealer to the distributor that serves it. A distributor then sees its own dealers under “My network”. The parent must be a higher level than the partner.</p>
    <div className="card"><label>Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, ID or district" /></label>
      <table><thead><tr><th>Partner</th><th>Type</th><th>District</th><th>Linked to</th><th></th></tr></thead><tbody>
        {shown.map((p) => <tr key={p.id}><td><b>{p.name}</b><div className="mini">{p.id}</div></td><td>{p.type_code}</td><td>{p.district}</td><td>{name(p.parent_id)}</td>
          <td><button className="btn" onClick={async () => { const f = await askForm("Change link", [{ name: "pid", label: "Partner ID of the distributor / stockist to link to", value: p.parent_id ?? "", hint: "Leave blank to remove the link" }], { ok: "Save link" }); if (f) link(p.id, f.pid.trim() || null); }}>Change link</button></td></tr>)}
        {shown.length === 0 && <tr><td colSpan={5}>No active partners.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="network">{(p) => ((["super_admin", "sales"] as Role[]).includes(p.role) ? <Staff /> : <Own />)}</Shell>; }
