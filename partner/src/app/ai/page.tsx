"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import type { Role } from "@/lib/roles";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type R = { id: number; kind: string; title: string; reasons: string[]; status: string; created_at: string; model: string | null };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin";
  const [recs, setRecs] = useState<R[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRecs(((await supabase.from("ai_recommendations").select("*").order("created_at", { ascending: false }).limit(50)).data as R[]) ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function run() {
    setBusy(true); const { data, error } = await supabase.functions.invoke("ai-recommend", { body: {} }); setBusy(false);
    setMsg({ ok: !error && !data?.error, t: error || data?.error ? (data?.error ?? error?.message ?? "Failed") : `Done: ${data.stored} recommendations, ${data.credit_proposals} credit proposals${data.dropped ? `, ${data.dropped} dropped as invalid` : ""}` }); load();
  }
  async function decide(id: number, approve: boolean) {
    let why: string | null = null; if (!approve) { why = (await askReason("Reject recommendation", "Reason", "Reject", true)) ?? ""; if (!why) return; }
    const { data, error } = await supabase.rpc("decide_ai_recommendation", { rid: id, approve, why }); setMsg({ ok: !error, t: error ? error.message : String(data) }); load();
  }
  return (<><h1>AI Intelligence</h1><p><b>AI recommends. Management approves.</b> The assistant never approves promotions, credit, prices, agreements or suspensions. It sees ids and numbers only, never names, contacts or prices.</p>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <p><button className="btn" disabled={busy} onClick={run}>{busy ? "Thinking…" : "Generate recommendations"}</button></p>
    {recs.map((r) => <div className="card" key={r.id} style={{ marginBottom: 10 }}><b>{r.kind}</b> · {r.status} · {when(r.created_at)}<div style={{ margin: "4px 0" }}><b>{r.title}</b></div><ul>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {boss && r.status === "Pending" && <><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => decide(r.id, true)}>Approve</button><button className="btn sm red" onClick={() => decide(r.id, false)}>Dismiss</button></>}</div>)}
    {recs.length === 0 && <div className="card">No recommendations yet.</div>}</>);
}
export default function Page() { return <Shell page="ai">{(p) => <Inner role={p.role} />}</Shell>; }
