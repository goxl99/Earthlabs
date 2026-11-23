"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { callFn } from "@/lib/fn";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import AppReview from "@/components/AppReview";

type App = { id: string; type_code: string; business_name: string; contact_name: string; phone: string; email: string; district: string; gstin: string | null; answers: Record<string, string> | null; status: string; reason: string | null; partner_id: string | null; created_at: string };
const FILTERS = ["Submitted", "More info needed", "Field verification", "Approved", "Rejected"];

function Inner({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<App[]>([]); const [flt, setFlt] = useState("Submitted"); const [msg, setMsg] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.from("applications").select("*").eq("status", flt).order("created_at", { ascending: false }).limit(50); setRows((data as App[]) ?? []); }, [flt]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(a: App, status: string, needReason: boolean) {
    const reason = needReason ? prompt("Reason (the applicant will see this)") ?? "" : null;
    if (needReason && !(reason ?? "").trim()) return;
    const { error } = await supabase.from("applications").update({ status, reason }).eq("id", a.id);
    setMsg(error ? error.message : `${a.business_name}: ${status}`); load();
  }
  async function approve(a: App) {
    const { data, error } = await supabase.rpc("approve_application", { app: a.id });
    if (error) { setMsg(error.message); load(); return; }
    const r = await callFn("provision-login", { partner_id: data });
    setMsg(`${a.business_name} approved. Partner ID ${data} issued for life. ` + (r.ok ? (r.data?.created === false ? String(r.data?.note ?? "") : r.data?.emailed ? "Login ID and password e-mailed to the partner." : "Login created, but the e-mail could not be sent. Ask the partner to use Forgot password.") : "Approved, but the login could not be created: " + r.error));
    load();
  }
  return (<>
    <h1>Applications</h1>
    <p>{FILTERS.map((s) => <button key={s} className="btn" style={{ marginRight: 6, opacity: s === flt ? 1 : 0.55 }} onClick={() => setFlt(s)}>{s}</button>)}</p>
    {msg && <Msg>{msg}</Msg>}
    <div className="card"><table><thead><tr><th>Business</th><th>Type</th><th>District</th><th>Contact</th><th>Received</th><th></th></tr></thead>
      <tbody>{rows.map((a) => (<Fragment key={a.id}><tr><td><b>{a.business_name}</b><div style={{ fontSize: 12 }}>{a.gstin ?? "no GSTIN"}</div></td><td>{a.type_code}</td><td>{a.district}</td><td>{a.contact_name}<div style={{ fontSize: 12 }}>{a.phone} · {a.email}</div></td><td>{when(a.created_at)}</td>
        <td><button className="btn out" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide review" : "Review"}</button>{" "}{!["Approved", "Rejected"].includes(a.status) && <>
          <button className="btn" onClick={() => setStatus(a, "More info needed", true)}>Ask info</button>{" "}
          {a.status !== "Field verification" && <><button className="btn" onClick={() => setStatus(a, "Field verification", false)}>Field visit</button>{" "}</>}
          {canApprove && <><button className="btn" onClick={() => approve(a)}>Approve</button>{" "}</>}
          <button className="btn" style={{ background: "#9b3b2c" }} onClick={() => setStatus(a, "Rejected", true)}>Reject</button></>}
          {a.partner_id && <b>{a.partner_id}</b>}</td></tr>{open === a.id && <tr><td colSpan={6}><AppReview a={a} /></td></tr>}</Fragment>))}
        {rows.length === 0 && <tr><td colSpan={6}>Nothing here.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="applications">{(p) => <Inner canApprove={p.role === "super_admin"} />}</Shell>; }
