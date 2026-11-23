"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Msg, when } from "@/components/ui";
import { PublicTop } from "@/components/Public";

type V = { valid: boolean; partner_id: string; partner_name: string; type_name: string; district: string; issued_at: string };
/** Public page the certificate QR code points to. Shows no contact data. */
export default function Verify() {
  const [code, setCode] = useState(""); const [r, setR] = useState<V | null | undefined>(undefined); const [err, setErr] = useState("");
  async function go(c: string) { setErr(""); const { data, error } = await supabase.rpc("verify_certificate", { c }); if (error) { setErr("Could not check right now. Try again."); setR(undefined); } else setR((data as V[])[0] ?? null); }
  useEffect(() => { const c = new URLSearchParams(location.search).get("code"); if (c) { setCode(c); go(c); } }, []);
  return (<div className="pub"><PublicTop base="../" /><div className="wiz"><h1>Verify a partner certificate</h1>
    <div className="card"><Field label="Certificate code"><input value={code} onChange={(e) => setCode(e.target.value)} /></Field><button className="btn" onClick={() => go(code)}>Verify</button>
      {err && <div style={{ marginTop: 12 }}><Msg kind="bad">{err}</Msg></div>}
      {r === null && <div style={{ marginTop: 12 }}><Msg kind="bad">No certificate found with this code.</Msg></div>}
      {r && <div style={{ marginTop: 12 }}><Msg kind={r.valid ? "ok" : "bad"}><b>{r.valid ? "Valid EarthLabs partner" : "Not valid (revoked or partner not active)"}</b><br />{r.partner_name} · {r.type_name} · {r.district}<br />Partner ID {r.partner_id} · issued {when(r.issued_at)}</Msg></div>}
    </div><p><a href="../">Home</a></p></div></div>);
}
