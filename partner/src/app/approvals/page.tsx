"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { inr } from "@/lib/orders";
import { decideCall, screenFor, type QueueItem } from "@/lib/procurement";

const TABS: [string, string][] = [["all", "All"], ["procurement", "Procurement"], ["credit", "Credit"], ["ai", "AI"], ["payments", "Payments"], ["orders", "Orders"], ["change", "Change requests"]];

function Inner() {
  const [items, setItems] = useState<QueueItem[]>([]); const [tab, setTab] = useState("all"); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => { const { data, error } = await supabase.rpc("approval_queue"); if (error) setMsg({ ok: false, t: error.message }); else setItems((data as QueueItem[]) ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function decide(it: QueueItem, approve: boolean) {
    let why = "";
    if (!approve) { why = prompt("Reason (the requester sees this)") ?? ""; if (!why) return; }
    const c = decideCall(it, approve, why); if (!c) return;
    const { error } = await supabase.rpc(c.fn, c.args); setMsg({ ok: !error, t: error ? error.message : approve ? "Approved" : "Rejected" }); load();
  }
  const shown = items.filter((x) => tab === "all" || x.group === tab);
  return (<><h1>Approvals</h1><p className="sub">Everything that needs a Super Admin decision, in one place. Nothing here happens until you approve it.</p><p>Everything that needs a Super Admin decision, in one place. Nothing here happens until you approve it. AI recommends; you decide.</p>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} ({items.filter((x) => k === "all" || x.group === k).length})</button>)}</div>
    {shown.map((it) => { const go = screenFor(it.type); const dec = decideCall(it, true, ""); return (
      <div className="card" key={it.type + it.id} style={{ marginBottom: 10 }}>
        <b>{it.type}</b> · {it.id} {it.flag && <span className="note" style={{ marginLeft: 6 }}>{it.flag}</span>}{it.source === "ai" && <span className="note" style={{ marginLeft: 6 }}>AI proposal</span>}
        <div>{it.title}{it.amount != null && <> · <b>{inr(it.amount)}</b></>} · raised {when(it.at)}</div>
        <div style={{ marginTop: 8 }}>{dec ? <><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => decide(it, true)}>Approve</button><button className="btn sm red" onClick={() => decide(it, false)}>Reject</button></> : go && <a className="btn" href={`./..${go}`}>Open the screen to decide</a>}</div>
      </div>); })}
    {shown.length === 0 && <div className="card">Nothing is waiting for you.</div>}</>);
}
export default function Page() { return <Shell page="approvals">{() => <Inner />}</Shell>; }
