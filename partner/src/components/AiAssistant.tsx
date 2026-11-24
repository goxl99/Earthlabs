"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { askConfirm } from "@/lib/dialog";
import { QUESTIONS, heading, cell, canRaise, type Answer } from "@/lib/aiAssist";

/** Procurement → AI assistant. Quick questions; each answer is built by the database from current data and changes nothing.
 *  A reorder suggestion can become a release order, which still needs approval (walkthrough F4.35 to F4.40). */
export default function AiAssistant({ role }: { role: string }) {
  const [a, setA] = useState<Answer | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function ask(topic: string) {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("ai_assist", { topic }); setBusy(false);
    if (error) { setA(null); setMsg({ ok: false, t: error.message }); return; }
    setA(data as Answer);
  }
  async function raise(item: string, name: string, qty: number) {
    if (!(await askConfirm(`Raise release order for ${name}?`, `Quantity ${qty}. It goes for approval first; money moves only in a separate payment step.`, "Create release order"))) return;
    const { data, error } = await supabase.rpc("raise_release_order", { rm: item, q: qty });
    setMsg({ ok: !error, t: error ? error.message : `Release order ${data} sent for approval` });
  }
  const cols = a && a.rows.length ? Object.keys(a.rows[0]) : [];
  return (<>
    <h2>AI assistant</h2>
    <p className="sub">Rule-based: it reads current stock, orders, ledger and scores and answers in plain words. <b>AI recommends. Management approves.</b></p>
    <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 6 }}>{QUESTIONS.map((q) => <button key={q.key} className={`btn ${a?.topic === q.key ? "pri" : ""}`} disabled={busy} onClick={() => ask(q.key)}>{q.label}</button>)}</div>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {busy && <div className="card">Looking at the numbers…</div>}
    {a && !busy && <div className="card" role="region" aria-label={a.title}>
      <b>{a.title}</b><p style={{ margin: "6px 0" }}>{a.summary}</p>
      {a.rows.length > 0 && <table><thead><tr>{cols.map((c) => <th key={c}>{heading(c)}</th>)}{canRaise(a.topic, role) && <th></th>}</tr></thead><tbody>
        {a.rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{cell(r[c])}</td>)}
          {canRaise(a.topic, role) && <td><button className="btn sm" onClick={() => raise(String(r.item), String(r.name), Number(r.suggest_qty))}>Raise release order</button></td>}</tr>)}</tbody></table>}
      <div className="mini" style={{ marginTop: 6 }}>{a.note}</div></div>}
    {!a && !busy && <div className="card">Pick a question above.</div>}
  </>);
}
