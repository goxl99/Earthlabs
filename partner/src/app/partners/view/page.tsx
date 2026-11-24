"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { DISTRICTS } from "@/lib/districts";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";
import { inr } from "@/lib/orders";

type P = { id: string; name: string; type_code: string; contact_name: string | null; phone: string | null; email: string | null; state: string; district: string; gstin: string | null; status: string; exclusive: boolean; credit_level: number; created_at: string };
type C = { id: number; state: string; district: string; exclusive: boolean };
type L = { id: number; at: string; kind: string; ref: string; debit: number; credit: number; narration: string | null };
type O = { id: string; status: string; total: number; created_at: string };
type Ag = { id: string; status: string; signed_at: string | null; created_at: string };
type Ce = { code: string; issued_at: string; revoked: boolean };
function Profile({ id }: { id: string }) {
  const [led, setLed] = useState<L[]>([]); const [ord, setOrd] = useState<O[]>([]); const [ag, setAg] = useState<Ag[]>([]); const [ce, setCe] = useState<Ce[]>([]); const [sc, setSc] = useState<{ month: string; score: number | null; band: string | null }[]>([]); const [copied, setCopied] = useState(false);
  useEffect(() => { (async () => {
    setLed(((await supabase.from("ledger_entries").select("id,at,kind,ref,debit,credit,narration").eq("partner_id", id).order("id")).data as L[]) ?? []);
    setOrd(((await supabase.from("orders").select("id,status,total,created_at").eq("partner_id", id).order("created_at", { ascending: false }).limit(20)).data as O[]) ?? []);
    setAg(((await supabase.from("agreements").select("id,status,signed_at,created_at").eq("partner_id", id).order("created_at", { ascending: false })).data as Ag[]) ?? []);
    setCe(((await supabase.from("certificates").select("code,issued_at,revoked").eq("partner_id", id)).data as Ce[]) ?? []);
    setSc(((await supabase.from("partner_scores").select("month,score,band").eq("partner_id", id).order("month", { ascending: false }).limit(6)).data as typeof sc) ?? []);
  })(); }, [id]);
  let bal = 0; const withBal = led.map((l) => { bal += Number(l.debit) - Number(l.credit); return { ...l, bal }; });
  function csv() { const t = ["Date,Entry,Reference,Debit,Credit,Balance", ...withBal.map((l) => [l.at.slice(0, 10), l.kind, l.ref, l.debit, l.credit, l.bal].join(","))].join("\n"); navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }
  return (<>
    <h2>Performance</h2><div className="card">{sc.length === 0 ? <p>No score recorded yet.</p> : <table><thead><tr><th>Month</th><th>Score</th><th>Band</th></tr></thead><tbody>{sc.map((x) => <tr key={x.month}><td>{x.month.slice(0, 7)}</td><td>{x.score ?? "—"}</td><td>{x.band ?? "—"}</td></tr>)}</tbody></table>}</div>
    <h2>Agreement and certificate</h2><div className="card"><table><tbody>{ag.map((a) => <tr key={a.id}><td>Agreement</td><td>{a.status}</td><td>{a.signed_at ? "Signed " + when(a.signed_at) : "Prepared " + when(a.created_at)}</td></tr>)}{ce.map((c) => <tr key={c.code}><td>Certificate</td><td>{c.revoked ? "Revoked" : "Valid"}</td><td>{c.code} · issued {when(c.issued_at)}</td></tr>)}{ag.length + ce.length === 0 && <tr><td>No agreement yet.</td></tr>}</tbody></table></div>
    <h2>Orders</h2><div className="card"><table><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Value (incl. GST)</th></tr></thead><tbody>{ord.map((o) => <tr key={o.id}><td>{o.id}</td><td>{when(o.created_at)}</td><td>{o.status}</td><td>{inr(Number(o.total))}</td></tr>)}{ord.length === 0 && <tr><td colSpan={4}>No orders yet.</td></tr>}</tbody></table></div>
    <h2>Ledger statement</h2><div className="card"><table><thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{withBal.map((l) => <tr key={l.id}><td>{l.at.slice(0, 10)}</td><td>{l.kind}</td><td>{l.ref}</td><td>{Number(l.debit) ? inr(Number(l.debit)) : ""}</td><td>{Number(l.credit) ? inr(Number(l.credit)) : ""}</td><td>{inr(l.bal)}</td></tr>)}{withBal.length === 0 && <tr><td colSpan={6}>No entries yet.</td></tr>}</tbody></table>
      <p><button className="btn out" onClick={csv}>{copied ? "Copied" : "Statement (copy as CSV)"}</button> <b>Outstanding: {inr(bal)}</b></p></div></>);
}
function Inner({ isSuper }: { isSuper: boolean }) {
  const [p, setP] = useState<P | null>(null); const [cl, setCl] = useState<C[]>([]); const [msg, setMsg] = useState(""); const [id] = useState(() => (typeof location !== "undefined" ? new URLSearchParams(location.search).get("id") ?? "" : ""));
  async function load() { const a = await supabase.from("partners").select("*").eq("id", id).maybeSingle(); setP(a.data as P | null); const b = await supabase.from("territory_claims").select("id,state,district,exclusive").eq("partner_id", id); setCl((b.data as C[]) ?? []); }
  useEffect(() => { if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function claim() { const f = await askForm("Assign territory", [{ name: "d", label: "District", type: "select", options: DISTRICTS, required: true }, { name: "ex", label: "Exclusivity", type: "select", options: ["Non-exclusive", "Exclusive"] }], { ok: "Assign" }); if (!f) return; const d = f.d, ex = f.ex === "Exclusive"; const { error } = await supabase.from("territory_claims").insert({ partner_id: id, state: "Gujarat", district: d.trim(), exclusive: ex }); setMsg(error ? error.message : "Territory added"); load(); }
  async function status(s: string) { const { error } = await supabase.from("partners").update({ status: s }).eq("id", id); setMsg(error ? error.message : `Status: ${s}`); load(); }
  if (!p) return <Msg>Partner not found.</Msg>;
  return (<><h1>{p.name}</h1><p><b>{p.id}</b> · {p.type_code} · since {when(p.created_at)}</p>{msg && <Msg>{msg}</Msg>}
    <div className="card"><table><tbody><tr><th>Status</th><td>{p.status}</td></tr><tr><th>Contact</th><td>{p.contact_name} · {p.phone} · {p.email}</td></tr><tr><th>Location</th><td>{p.district}, {p.state}</td></tr><tr><th>GSTIN</th><td>{p.gstin ?? "—"}</td></tr><tr><th>Credit</th><td>{p.credit_level === 0 ? "Pay and carry" : `Level ${p.credit_level}`}</td></tr></tbody></table></div>
    <h2>Territory</h2><div className="card"><table><tbody>{cl.map((c) => <tr key={c.id}><td>{c.district}, {c.state}</td><td>{c.exclusive ? "Exclusive" : "Non-exclusive"}</td></tr>)}{cl.length === 0 && <tr><td>No territory assigned yet.</td></tr>}</tbody></table>{isSuper && <p><button className="btn" onClick={claim}>Add territory</button></p>}</div>
    {isSuper && <p><button className="btn" onClick={() => status("Active")}>{p.status === "Suspended" ? "Restore partner" : "Activate"}</button> <button className="btn" onClick={() => confirm("Suspend this partner?") && status("Suspended")}>Suspend partner</button></p>}<Profile id={id} /></>);
}
export default function Page() { return <Shell page="partners">{(u) => <Inner isSuper={u.role === "super_admin"} />}</Shell>; }
