"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import SubTabs from "@/components/SubTabs";
import { supabase } from "@/lib/supabase";
import { when } from "@/components/ui";
import { PRICING_TABS } from "@/lib/pricingTabs";
import { aimedAt, visibleToPartner, type Scheme } from "@/lib/policies";

function Inner() {
  const [pid, setPid] = useState(""); const [p, setP] = useState<{ id: string; name: string; type_code: string } | null>(null); const [err, setErr] = useState(""); const [all, setAll] = useState<Scheme[]>([]);
  useEffect(() => { supabase.from("schemes").select("id,name,active,disclosed,audience_mode,audience_types,audience_partners,valid_from,valid_to").order("valid_to", { ascending: false }).limit(200).then(({ data }) => setAll((data as Scheme[]) ?? [])); }, []);
  async function find() {
    setErr(""); setP(null);
    const { data, error } = await supabase.from("partners").select("id,name,type_code").eq("id", pid.trim().toUpperCase()).maybeSingle();
    if (error || !data) setErr(error?.message ?? "No partner with that Partner ID"); else setP(data as typeof p);
  }
  const today = new Date().toISOString().slice(0, 10);
  const mine = p ? all.filter((s) => aimedAt(s, p.id, p.type_code)) : [];
  return (<><h1>Schemes by partner</h1><SubTabs current="/schemes/partners/" items={PRICING_TABS} />
    <p className="sub">Pick a partner to see which schemes are aimed at them and whether they can see each one today.</p>
    <div className="row"><input aria-label="Partner ID" placeholder="Partner ID, e.g. ELP-DLR-0001" value={pid} onChange={(e) => setPid(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} style={{ maxWidth: 280 }} /> <button className="btn" disabled={!pid.trim()} onClick={find}>Show schemes</button></div>
    {err && <div className="note bad">{err}</div>}
    {p && <div className="card"><h3>{p.name} <span className="mini">{p.id} · {p.type_code}</span></h3><table><thead><tr><th>Scheme</th><th>Valid</th><th>Partner sees it?</th></tr></thead><tbody>
      {mine.map((s) => <tr key={s.id}><td>{s.name}<div className="mini">{s.id}</div></td><td>{when(s.valid_from)} to {when(s.valid_to)}</td><td>{visibleToPartner(s, today)}</td></tr>)}
      {mine.length === 0 && <tr><td colSpan={3}>No scheme is aimed at this partner.</td></tr>}</tbody></table></div>}</>);
}
export default function Page() { return <Shell page="schemes">{(r) => (r.role === "super_admin" || r.role === "sales" || r.role === "accounts" ? <Inner /> : <div className="note bad">Staff only.</div>)}</Shell>; }
