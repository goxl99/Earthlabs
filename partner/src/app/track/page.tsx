"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import PublicShell from "@/components/PublicShell";
import { Badge, Field, Msg, Steps, when } from "@/components/ui";

type Row = { status: string; business_name: string; type_code: string; reason: string | null; partner_id: string | null; created_at: string };
const FLOW = ["Registration Started", "Application Submitted", "Under Verification", "Field Verification", "Management Review", "Approved", "Agreement Pending", "Agreement Signed", "Certified", "Active"];
const FOLD: Record<string, string> = { "Additional Information Required": "Under Verification", Rejected: "Management Review", Submitted: "Application Submitted" };
const kind = (s: string) => (s === "Rejected" ? "crit" : s === "Active" || s === "Approved" || s === "Certified" ? "good" : s === "Additional Information Required" ? "warn" : "info");
export default function Track() {
  const [ref, setRef] = useState(""); const [mail, setMail] = useState(""); const [row, setRow] = useState<Row | null | undefined>(undefined); const [err, setErr] = useState("");
  async function go() { setErr(""); const { data, error } = await supabase.rpc("track_application", { ref: ref.trim(), mail }); if (error) { setErr("Check the reference and e-mail"); setRow(undefined); } else setRow((data as Row[])[0] ?? null); }
  const cur = row ? Math.max(0, FLOW.indexOf(FOLD[row.status] ?? row.status)) : 0;
  return (<PublicShell page="track"><h1>Track your application</h1>
    <div className="row" style={{ margin: "8px 0", alignItems: "flex-end" }}>
      <div style={{ minWidth: 220, flex: "1 1 220px", maxWidth: 300 }}><Field label="Application number"><input value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Application number" /></Field></div>
      <div style={{ minWidth: 220, flex: "1 1 220px", maxWidth: 300 }}><Field label="E-mail used"><input type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field></div>
      <div className="field"><button className="btn pri" onClick={go}>Check</button></div></div>
    {err && <Msg kind="bad">{err}</Msg>}
    {row === null && <Msg kind="bad">No application found with that number.</Msg>}
    {row && <div className="card"><div className="row"><h2>{row.business_name}</h2><Badge kind={kind(row.status)}>{row.status}</Badge></div>
      <div className="mini">{row.type_code} · received {when(row.created_at)}</div>
      {row.status === "Additional Information Required" && <Msg><b>We need more from you.</b> {row.reason}</Msg>}
      {row.status === "Rejected" ? <Msg kind="bad">{row.reason || "Not taken forward"}</Msg> : <div style={{ margin: "10px 0" }}><Steps items={FLOW} current={cur} /></div>}
      {row.partner_id && <Msg kind="ok">Your Partner ID: <b>{row.partner_id}</b></Msg>}
      <p className="mini">Notifications are sent by email and in-app at every stage.</p></div>}
  </PublicShell>);
}
