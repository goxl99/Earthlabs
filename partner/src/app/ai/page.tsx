"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when, Kpi } from "@/components/ui";
import { inr } from "@/lib/orders";
import type { Role } from "@/lib/roles";
import { askReason } from "@/lib/dialog";
import { EFFECT, KIND_LABEL, supporting, canAct } from "@/lib/ai";
import type { Insights } from "@/lib/aiAssist";

type R = { id: number; kind: string; title: string; reasons: string[]; status: string; created_at: string; model: string | null; target_kind: string | null; target_id: string | null; payload: Record<string, unknown> | null; note: string | null };

function Inner({ role }: { role: Role }) {
  const boss = role === "super_admin";
  const [recs, setRecs] = useState<R[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRecs(((await supabase.from("ai_recommendations").select("*").order("created_at", { ascending: false }).limit(50)).data as R[]) ?? []); }, []);
  const [ins, setIns] = useState<Insights | null>(null);
  useEffect(() => { load(); supabase.rpc("ai_insights").then(({ data }) => setIns((data as Insights) ?? null)); }, [load]);
  async function run() {
    setBusy(true); const { data, error } = await supabase.functions.invoke("ai-recommend", { body: {} }); setBusy(false);
    let detail = ""; try { const ctx = (error as { context?: Response } | null)?.context; if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? ""; } catch { /* keep the generic message */ }
    setMsg({ ok: !error && !data?.error, t: error || data?.error ? (data?.error ?? (detail || error?.message) ?? "Failed") : `Done: ${data.stored} recommendations, ${data.credit_proposals} credit proposals${data.dropped ? `, ${data.dropped} dropped as invalid` : ""}` }); load();
  }
  async function decide(id: number, approve: boolean) {
    let why: string | null = null; if (!approve) { why = (await askReason("Reject recommendation", "Reason", "Reject", true)) ?? ""; if (!why) return; }
    const { data, error } = await supabase.rpc("decide_ai_recommendation", { rid: id, approve, why }); setMsg({ ok: !error, t: error ? error.message : String(data) }); load();
  }
  async function defer(id: number) {
    const why = await askReason("Defer recommendation", "Why wait? (optional notes help the next reviewer)", "Defer"); if (why == null) return;
    const { error } = await supabase.rpc("defer_ai_recommendation", { rid: id, why }); setMsg({ ok: !error, t: error ? error.message : "Deferred. It stays open for a later decision." }); load();
  }
  return (<><h1>AI Intelligence</h1><p><b>AI recommends. Management approves.</b> The assistant never approves promotions, credit, prices, agreements or suspensions. It sees ids and numbers only, never names, contacts or prices.</p>
    {ins && <><h2>This month at a glance</h2><div className="grid g4" style={{ gap: 12, marginBottom: 12 }}>
      <Kpi label="Top performer" value={ins.top ? ins.top.name : "No orders yet"} note={ins.top ? `${ins.top.id} · ${inr(ins.top.value90)} in 90 days · ${ins.top.orders90} order(s)` : "Appears after the first orders"} />
      <Kpi label="Declining / at risk" value={ins.at_risk.length} note={ins.at_risk.length ? ins.at_risk.slice(0, 3).map((x) => `${x.id}: ${inr(x.last30)} vs ${inr(x.prev30)} before`).join(" · ") : "No partner has dropped below half of last month"} />
      <Kpi label="Inactive (60 days)" value={ins.inactive.length} note={ins.inactive.length ? ins.inactive.slice(0, 4).map((x) => x.id).join(", ") : "Every active partner has ordered recently"} />
      <Kpi label="Collection forecast" value={inr(ins.forecast.outstanding)} note={`${ins.forecast.partners_owing} partner(s) owe money · ${inr(ins.forecast.orders_in_hand)} of orders in hand`} />
    </div><div className="mini" style={{ marginBottom: 12 }}>Computed from orders and the ledger. These cards inform; they decide nothing.</div></>}
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    <p><button className="btn" disabled={busy} onClick={run}>{busy ? "Thinking…" : "Generate recommendations"}</button></p>
    {recs.map((r) => <div className="card" key={r.id} style={{ marginBottom: 10 }}><b>{KIND_LABEL[r.kind] ?? r.kind}</b> · {r.status} · {when(r.created_at)}<div style={{ margin: "4px 0" }}><b>{r.title}</b></div>
      <div className="grid g3" style={{ gap: 12 }}>
        <div><div className="mini"><b>Supporting data</b></div>{supporting(r).length ? <table><tbody>{supporting(r).map(([k, v]) => <tr key={k}><td className="mini">{k}</td><td>{v}</td></tr>)}</tbody></table> : <div className="mini">None attached</div>}</div>
        <div><div className="mini"><b>Reasoning</b></div><ul style={{ margin: "4px 0" }}>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><div className="mini"><b>Risk if approved</b></div><div className="mini" style={{ marginTop: 4 }}>{EFFECT[r.kind] ?? "Check the details before approving."}</div></div></div>
      {r.note && <div className="mini" style={{ marginTop: 6 }}>Note: {r.note}</div>}
      {boss && canAct(r.status) && <div style={{ marginTop: 8 }}><button className="btn sm pri" style={{ marginRight: 6 }} onClick={() => decide(r.id, true)}>Approve</button>{r.status === "Pending" && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => defer(r.id)}>Defer</button>}<button className="btn sm red" onClick={() => decide(r.id, false)}>Reject</button></div>}</div>)}
    {recs.length === 0 && <div className="card">No recommendations yet.</div>}</>);
}
export default function Page() { return <Shell page="ai">{(p) => <Inner role={p.role} />}</Shell>; }
