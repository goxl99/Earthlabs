"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Msg, when } from "@/components/ui";
import { PublicTop } from "@/components/Public";

type Row = { status: string; business_name: string; type_code: string; reason: string | null; partner_id: string | null; created_at: string };
export default function Track() {
  const [ref, setRef] = useState(""); const [mail, setMail] = useState(""); const [row, setRow] = useState<Row | null | undefined>(undefined); const [err, setErr] = useState("");
  async function go() { setErr(""); const { data, error } = await supabase.rpc("track_application", { ref: ref.trim(), mail }); if (error) { setErr("Check the reference and e-mail"); setRow(undefined); } else setRow((data as Row[])[0] ?? null); }
  return (<div className="pub"><PublicTop base="../" /><div className="wiz"><h1>Track your application</h1>
    <div className="card"><Field label="Reference"><input value={ref} onChange={(e) => setRef(e.target.value)} /></Field><Field label="E-mail used"><input type="email" value={mail} onChange={(e) => setMail(e.target.value)} /></Field><button className="btn" onClick={go}>Check status</button>
      {err && <div style={{ marginTop: 12 }}><Msg kind="bad">{err}</Msg></div>}
      {row === null && <div style={{ marginTop: 12 }}><Msg>No application found for these details.</Msg></div>}
      {row && <div style={{ marginTop: 12 }}><Msg kind={row.status === "Approved" ? "ok" : "note"}><b>{row.business_name}</b>: {row.status}. Received {when(row.created_at)}.{row.reason ? ` Note from EarthLabs: ${row.reason}` : ""}{row.partner_id ? ` Your Partner ID is ${row.partner_id}.` : ""}</Msg></div>}
    </div><p><a href="../register/">Apply</a> · <a href="../">Sign in</a></p></div></div>);
}
