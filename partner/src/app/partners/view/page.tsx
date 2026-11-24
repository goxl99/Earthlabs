"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import { DISTRICTS } from "@/lib/districts";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type P = { id: string; name: string; type_code: string; contact_name: string | null; phone: string | null; email: string | null; state: string; district: string; gstin: string | null; status: string; exclusive: boolean; credit_level: number; created_at: string };
type C = { id: number; state: string; district: string; exclusive: boolean };
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
    {isSuper && <p><button className="btn" onClick={() => status("Active")}>Activate</button> <button className="btn" onClick={() => status("Suspended")}>Suspend</button></p>}</>);
}
export default function Page() { return <Shell page="partners">{(u) => <Inner isSuper={u.role === "super_admin"} />}</Shell>; }
