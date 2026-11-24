"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SubTabs from "@/components/SubTabs";
import { supabase } from "@/lib/supabase";
import { Msg } from "@/components/ui";
import { PRICING_TABS } from "@/lib/pricingTabs";
import { checkLeadTime, checkPayCarry, type LeadTime, type PayCarry } from "@/lib/policies";
import type { Weight } from "@/lib/performance";
import Link from "next/link";

function Inner({ boss }: { boss: boolean }) {
  const [lt, setLt] = useState<LeadTime | null>(null); const [pc, setPc] = useState<PayCarry | null>(null); const [w, setW] = useState<Weight[]>([]); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    const get = async (k: string) => (await supabase.from("settings").select("value").eq("key", k).maybeSingle()).data?.value;
    setLt((await get("lead_time")) as LeadTime ?? null); setPc((await get("pay_and_carry")) as PayCarry ?? null); setW(((await get("score_weights")) as Weight[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(key: string, value: unknown, bad: string | null, ok: string) {
    if (bad) { setMsg({ ok: false, t: bad }); return; }
    const { error } = await supabase.from("settings").update({ value }).eq("key", key); setMsg({ ok: !error, t: error ? error.message : ok }); load();
  }
  const num = (v: string) => (v === "" ? NaN : Number(v));
  return (<><h1>Policies &amp; weights</h1><SubTabs current="/catalogue/policies/" items={PRICING_TABS} />
    <p className="sub">Commercial rules that apply to every order. {boss ? "Only Super Admin changes them, and every change is written to the audit trail." : "Only Super Admin can change them."}</p>
    {msg && <Msg kind={msg.ok ? "ok" : "bad"}>{msg.t}</Msg>}
    {lt && <div className="card"><h3>Delivery lead time</h3><div className="grid g3" style={{ gap: 10 }}>
      {([["confirm", "Order confirmation (days)"], ["dispatch", "Dispatch (days)"], ["make", "Make to order, when short (days)"], ["transit_in", "Transit within the state (days)"], ["transit_out", "Transit outside the state (days)"]] as const).map(([k, n]) =>
        <label key={k}>{n}<input type="number" disabled={!boss} value={Number.isNaN(lt[k]) ? "" : lt[k]} onChange={(e) => setLt({ ...lt, [k]: num(e.target.value) })} /></label>)}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} disabled={!boss} checked={lt.show} onChange={(e) => setLt({ ...lt, show: e.target.checked })} /> Show the delivery estimate to partners</label></div>
      {boss && <p><button className="btn" onClick={() => save("lead_time", lt, checkLeadTime(lt), "Lead-time policy saved")}>Save lead time</button></p>}</div>}
    {pc && <div className="card" style={{ marginTop: 14 }}><h3>Pay and carry</h3><p className="mini">New partners pay before dispatch. Credit is raised one step at a time, only with Super Admin approval.</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} disabled={!boss} checked={pc.enabled} onChange={(e) => setPc({ ...pc, enabled: e.target.checked })} /> Pay and carry is on</label>
      <label>Advance required (% of order)<input type="number" disabled={!boss} value={Number.isNaN(pc.advance_pct) ? "" : pc.advance_pct} onChange={(e) => setPc({ ...pc, advance_pct: num(e.target.value) })} style={{ maxWidth: 140 }} /></label>
      {boss && <p><button className="btn" onClick={() => save("pay_and_carry", pc, checkPayCarry(pc), "Pay-and-carry policy saved")}>Save pay and carry</button></p>}</div>}
    <div className="card" style={{ marginTop: 14 }}><h3>Performance score weights</h3><table><thead><tr><th>Parameter</th><th>Weight</th></tr></thead><tbody>{w.map((x, i) => <tr key={i}><td>{x.n}</td><td>{x.w}</td></tr>)}</tbody></table>
      <p className="mini">Weights are edited with the scoring tools on the <Link className="lk" href="/performance/">Performance</Link> screen.</p></div></>);
}
export default function Page() { return <Shell page="catalogue">{(r) => (r.role === "super_admin" || r.role === "sales" || r.role === "accounts" ? <Inner boss={r.role === "super_admin"} /> : <div className="note bad">Staff only.</div>)}</Shell>; }
