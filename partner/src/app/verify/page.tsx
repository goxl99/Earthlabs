"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PublicShell from "@/components/PublicShell";
import { Field, Msg, when } from "@/components/ui";
import { PublicTop } from "@/components/Public";

type V = { valid: boolean; partner_id: string; partner_name: string; type_name: string; district: string; issued_at: string; cert_no?: string; address?: string | null; valid_till?: string };
/** Public page the certificate QR code points to. Shows no contact data. */
export default function Verify() {
  const [code, setCode] = useState(""); const [r, setR] = useState<V | null | undefined>(undefined); const [err, setErr] = useState("");
  async function go(c: string) { setErr(""); const { data, error } = await supabase.rpc("verify_certificate", { c }); if (error) { setErr("Could not check right now. Try again."); setR(undefined); } else setR((data as V[])[0] ?? null); }
  useEffect(() => { const c = new URLSearchParams(location.search).get("code"); if (c) { setCode(c); go(c); } }, []);
  return (<PublicShell page="verify"><h1>Verify a certificate</h1>
    <p className="sub">Confirm that a partner is authorised by EarthLabs. Enter the certificate number or scan its QR code.</p>
    <div className="row" style={{ marginBottom: 12, alignItems: "flex-end" }}><div style={{ flex: "1 1 260px", maxWidth: 360 }}><Field label="Certificate number"><input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Certificate number" /></Field></div><div className="field"><button className="btn pri" onClick={() => go(code)}>Verify</button></div></div>
    {err && <Msg kind="bad">{err}</Msg>}
    {r === null && <Msg kind="bad"><b>Not found.</b> This certificate number is not in the EarthLabs register. Treat the certificate as unverified and contact EarthLabs.</Msg>}
    {r && <div className="card"><div className="row"><span style={{ fontSize: 30 }}>{r.valid ? "✅" : "⚠️"}</span><div><h2>{r.valid ? "Authentic EarthLabs partner certificate" : "Certificate found, not valid (revoked, expired or partner not active)"}</h2></div></div>
      <table className="t" style={{ marginTop: 8 }}><tbody><tr><td>Business</td><td><b>{r.partner_name}</b></td></tr><tr><td>Authorised as</td><td>{r.type_name}</td></tr><tr><td>Territory</td><td>{r.district}, Gujarat</td></tr><tr><td>Partner ID</td><td>{r.partner_id}</td></tr>{r.cert_no && <tr><td>Certificate no.</td><td>{r.cert_no}</td></tr>}<tr><td>Issued</td><td>{when(r.issued_at)}</td></tr></tbody></table>
      <p className="mini">Contact details, prices and agreement terms are never shown on this page.</p></div>}
  </PublicShell>);
}
