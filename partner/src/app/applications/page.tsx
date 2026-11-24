"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Badge, Msg, when } from "@/components/ui";
import { askForm, askConfirm, askReason, notify } from "@/lib/dialog";

type App = { id: string; type_code: string; business_name: string; contact_name: string; phone: string; email: string; district: string; gstin: string | null; status: string; reason: string | null; partner_id: string | null; created_at: string };
const FILTERS = ["Submitted", "More info needed", "Field verification", "Approved", "Rejected"];

function Inner({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<App[]>([]); const [flt, setFlt] = useState("Submitted"); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { const { data } = await supabase.from("applications").select("*").eq("status", flt).order("created_at", { ascending: false }).limit(50); setRows((data as App[]) ?? []); }, [flt]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(a: App, status: string, needReason: boolean) {
    const reason = needReason ? (await askReason(status === "Rejected" ? "Reject application" : "Request more information", "Reason (the applicant will see this)", status === "Rejected" ? "Reject" : "Send request", status === "Rejected")) ?? "" : null;
    if (needReason && !(reason ?? "").trim()) return;
    const { error } = await supabase.from("applications").update({ status, reason }).eq("id", a.id);
    setMsg(error ? error.message : `${a.business_name}: ${status}`); load();
  }
  async function approve(a: App) {
    const { data, error } = await supabase.rpc("approve_application", { app: a.id });
    setMsg(error ? error.message : `${a.business_name} approved. Partner ID ${data} issued for life.`); load();
  }
  return (<>
    <h1>Applications</h1>
    <p className="sub">Everyone who registers lands here. Registration never authorises trading: each application is verified and then approved by management.</p>
    <div className="row" style={{ marginBottom: 10 }}>{FILTERS.map((s) => <button key={s} className="btn sm" aria-pressed={s === flt} onClick={() => setFlt(s)}>{s}</button>)}</div>
    {msg && <Msg>{msg}</Msg>}
    <div className="tw"><table className="t"><thead><tr><th>Applicant</th><th>Category</th><th>District</th><th>Contact</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
      <tbody>{rows.map((a) => (<tr key={a.id}><td><b>{a.business_name}</b><div style={{ fontSize: 12 }}>{a.gstin ?? "no GSTIN"}</div></td><td><span className="chip">{a.type_code}</span></td><td>{a.district}</td><td>{a.contact_name}<div style={{ fontSize: 12 }}>{a.phone} · {a.email}</div></td><td>{when(a.created_at)}</td><td><Badge kind={a.status === "Rejected" ? "crit" : a.status === "Approved" ? "good" : a.status === "More info needed" ? "warn" : "info"}>{a.status}</Badge></td>
        <td>{!["Approved", "Rejected"].includes(a.status) && <>
          <button className="btn sm" onClick={() => setStatus(a, "More info needed", true)}>Ask info</button>{" "}
          {a.status !== "Field verification" && <><button className="btn sm" onClick={() => setStatus(a, "Field verification", false)}>Field visit</button>{" "}</>}
          {canApprove && <><button className="btn sm pri" onClick={() => approve(a)}>Approve</button>{" "}</>}
          <button className="btn sm red" onClick={() => setStatus(a, "Rejected", true)}>Reject</button></>}
          {a.partner_id && <b>{a.partner_id}</b>}</td></tr>))}
        {rows.length === 0 && <tr><td colSpan={7}>Nothing here.</td></tr>}</tbody></table></div></>);
}
export default function Page() { return <Shell page="applications">{(p) => <Inner canApprove={p.role === "super_admin"} />}</Shell>; }
