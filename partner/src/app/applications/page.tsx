"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { callFn } from "@/lib/fn";
import { supabase } from "@/lib/supabase";
import { Msg, when } from "@/components/ui";
import AppReview from "@/components/AppReview";
import { DocsReview } from "@/components/AppDocs";
import { MouBuilder } from "@/components/MouBuilder";

type App = { id: string; type_code: string; business_name: string; contact_name: string; phone: string; email: string; district: string; gstin: string | null; answers: Record<string, string> | null; status: string; reason: string | null; partner_id: string | null; created_at: string };
const FILTERS = ["Submitted", "Documents requested", "Documents submitted", "More info needed", "Field verification", "Agreement pending", "MOU signed", "Approved", "Rejected"];

function Inner({ canApprove, canAct }: { canApprove: boolean; canAct: boolean }) {
  const [rows, setRows] = useState<App[]>([]); const [flt, setFlt] = useState("Submitted"); const [msg, setMsg] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.from("applications").select("*").eq("status", flt).order("created_at", { ascending: false }).limit(50); setRows((data as App[]) ?? []); }, [flt]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(a: App, status: string, needReason: boolean, ask?: string) {
    const reason = needReason || ask ? prompt(ask ?? "Reason (the applicant will see this)") ?? "" : null;
    if (needReason && !(reason ?? "").trim()) return;
    const { error } = await supabase.from("applications").update({ status, reason: reason && reason.trim() ? reason.trim() : null }).eq("id", a.id);
    setMsg(error ? error.message : `${a.business_name}: ${status}`); load();
  }
  async function approve(a: App) {
    if (!confirm(`Approve ${a.business_name}? A Partner ID is issued and the MOU step starts. The login is e-mailed after the MOU is signed.`)) return;
    const { data, error } = await supabase.rpc("approve_application", { app: a.id });
    setMsg(error ? error.message : `${a.business_name} approved. Partner ID ${data} issued. Next: prepare and send the MOU (open MOU step).`); setFlt("Agreement pending"); load();
  }
  async function issueLogin(a: App) {
    const r = await callFn("provision-login", { partner_id: a.partner_id });
    setMsg(r.ok ? (r.data?.created === false ? String(r.data?.note ?? "") : r.data?.emailed ? "Login ID and password e-mailed to the partner." : "Login created, but the e-mail could not be sent. Ask the partner to use Forgot password.") : "Could not create the login: " + r.error); load();
  }
  return (<>
    <h1>Applications</h1>
    <p>{FILTERS.map((s) => <button key={s} className="btn" style={{ marginRight: 6, opacity: s === flt ? 1 : 0.55 }} onClick={() => setFlt(s)}>{s}</button>)}</p>
    {msg && <Msg>{msg}</Msg>}
    <div className="card"><table><thead><tr><th>Business</th><th>Type</th><th>District</th><th>Contact</th><th>Received</th><th></th></tr></thead>
      <tbody>{rows.map((a) => (<Fragment key={a.id}><tr><td><b>{a.business_name}</b><div style={{ fontSize: 12 }}>{a.gstin ?? "no GSTIN"}</div></td><td>{a.type_code}</td><td>{a.district}</td><td>{a.contact_name}<div style={{ fontSize: 12 }}>{a.phone} · {a.email}</div></td><td>{when(a.created_at)}</td>
        <td><button className="btn out" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : ["Agreement pending", "MOU signed"].includes(a.status) ? "MOU step" : "Review"}</button>{" "}{canAct && <>
          {a.status === "Submitted" && <><button className="btn" onClick={() => setStatus(a, "Documents requested", false)}>Request documents</button>{" "}</>}
          {["Documents submitted", "Field verification"].includes(a.status) && <button className="btn" onClick={() => setStatus(a, "More info needed", true)}>Ask corrections</button>}{" "}
          {a.status === "Documents submitted" && <><button className="btn" onClick={() => setStatus(a, "Field verification", false, "Meeting / field visit details for the applicant (date, place, who). Optional.")}>Meeting / field visit</button>{" "}</>}
          {canApprove && ["Documents submitted", "Field verification"].includes(a.status) && <><button className="btn" onClick={() => approve(a)}>Approve</button>{" "}</>}
          {["Submitted", "Documents requested", "Documents submitted", "More info needed", "Field verification"].includes(a.status) && <button className="btn" style={{ background: "#9b3b2c" }} onClick={() => setStatus(a, "Rejected", true)}>Reject</button>}
          {a.status === "Approved" && canApprove && <button className="btn out" onClick={() => issueLogin(a)}>Issue / re-send login</button>}</>}
          {a.partner_id && <b> {a.partner_id}</b>}</td></tr>{open === a.id && <tr><td colSpan={6}>{["Agreement pending", "MOU signed"].includes(a.status) && a.partner_id ? <><h3>MOU and e-signature</h3><MouBuilder partnerId={a.partner_id} canAct={canAct} onActivated={load} /></> : null}<h3>Documents</h3><DocsReview appId={a.id} canAct={canAct} email={a.email} /><AppReview a={a} /></td></tr>}</Fragment>))}
        {rows.length === 0 && <tr><td colSpan={6}>Nothing here.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="applications">{(p) => <Inner canApprove={p.role === "super_admin"} canAct={["super_admin", "sales"].includes(p.role)} />}</Shell>; }
