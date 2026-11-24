"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import { nextLevel, type Ladder } from "@/lib/procurement";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";
import SubTabs from "@/components/SubTabs";

type P = { id: string; entity_kind: string; entity_id: string; from_level: number; to_level: number; reason: string; source: string; status: string; created_at: string };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin";
  const [lad, setLad] = useState<Ladder[]>([]); const [pc, setPc] = useState(true); const [props, setProps] = useState<P[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [partners, setPartners] = useState<{ id: string; name: string; credit_level: number }[]>([]); const [vendors, setVendors] = useState<{ id: string; name: string; credit_level: number }[]>([]);
  const load = useCallback(async () => {
    setLad(((await supabase.from("settings").select("value").eq("key", "credit_ladder").maybeSingle()).data?.value as Ladder[]) ?? []);
    setPc(Boolean(((await supabase.from("settings").select("value").eq("key", "pay_and_carry").maybeSingle()).data?.value as { enabled?: boolean })?.enabled ?? true));
    setProps(((await supabase.from("credit_proposals").select("*").order("created_at", { ascending: false }).limit(50)).data as P[]) ?? []);
    setPartners(((await supabase.from("partners").select("id,name,credit_level").eq("status", "Active").order("id").limit(100)).data as typeof partners) ?? []);
    setVendors(((await supabase.from("vendors").select("id,name,credit_level").eq("status", "Active").order("id").limit(100)).data as typeof vendors) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function call(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); setMsg({ ok: !error, t: error ? error.message : "Done" }); load(); }
  const row = (kind: "partner" | "vendor", e: { id: string; name: string; credit_level: number }) => { const nx = nextLevel(e.credit_level, lad); return (
    <tr key={kind + e.id}><td>{e.id}</td><td>{e.name}</td><td>{lad[e.credit_level]?.n ?? e.credit_level}</td>
      <td>{nx != null && <button className="btn" onClick={async () => { const why = await askReason(`Propose move to ${lad[nx]?.n}`, "Why? (score, payment record)", "Propose"); if (why) call("propose_credit_change", { k: kind, i: e.id, to_lvl: nx, why }); }}>Propose {lad[nx]?.n}</button>}</td></tr>); };
  return (<><h1>Procurement & raw materials</h1><SubTabs current="/credit/" items={[{ href: "/procurement/", label: "Overview" }, { href: "/credit/", label: "Credit ladder" }]} />
    <p>Everyone starts at <b>pay and carry</b>: payment is made before goods move. Credit opens one step at a time. <b>AI or staff propose; only Super Admin approves.</b></p>
    {pc && <Msg>Pay-and-carry is switched on, so no credit can be opened yet. Super Admin switches it off in settings when the business is ready.</Msg>}
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="card"><table><thead><tr><th>Level</th><th>Limit</th><th>Days</th><th>Minimum score</th></tr></thead><tbody>{lad.map((l, i) => <tr key={i}><td>{i}. {l.n}</td><td>{l.limit ? inr(l.limit) : "Pay before dispatch"}</td><td>{l.days || "n/a"}</td><td>{l.min || "n/a"}</td></tr>)}</tbody></table></div>
    <h2>Proposals</h2><div className="card"><table><thead><tr><th>For</th><th>Change</th><th>Reason</th><th>From</th><th>Status</th><th></th></tr></thead><tbody>
      {props.map((p) => <tr key={p.id}><td>{p.entity_kind} {p.entity_id}</td><td>{lad[p.from_level]?.n} to {lad[p.to_level]?.n}</td><td>{p.reason}</td><td>{p.source === "ai" ? "AI" : "Staff"} · {when(p.created_at)}</td><td>{p.status}</td>
        <td style={{ whiteSpace: "nowrap" }}>{boss && p.status === "Pending" && <><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => call("decide_credit_change", { pid: p.id, approve: true, why: null })}>Approve</button><button className="btn sm red" onClick={async () => { const w = await askReason("Reject credit change", "Reason", "Reject", true); if (w) call("decide_credit_change", { pid: p.id, approve: false, why: w }); }}>Reject</button></>}</td></tr>)}
      {props.length === 0 && <tr><td colSpan={6}>No proposals yet.</td></tr>}</tbody></table></div>
    <h2>Partners</h2><div className="card"><table><tbody>{partners.map((p) => row("partner", p))}{partners.length === 0 && <tr><td>No active partners.</td></tr>}</tbody></table></div>
    {(boss || role === "accounts") && <><h2>Vendors (EarthLabs buys on credit)</h2><div className="card"><table><tbody>{vendors.map((v) => row("vendor", v))}{vendors.length === 0 && <tr><td>No active vendors.</td></tr>}</tbody></table></div></>}</>);
}
export default function Page() { return <Shell page="credit">{(p) => <Inner role={p.role} />}</Shell>; }
