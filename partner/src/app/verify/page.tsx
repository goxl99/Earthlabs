"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PublicShell from "@/components/PublicShell";
import { Field, Msg, when } from "@/components/ui";
import { PublicTop } from "@/components/Public";

type D = { valid: boolean; kind: string; number: string; issued_on: string; amount: number | null; issuer: string };
type V = { valid: boolean; partner_id: string; partner_name: string; type_name: string; district: string; issued_at: string; cert_no?: string; address?: string | null; valid_till?: string };
/** Public page the certificate QR code points to. Shows no contact data. */
export default function Verify() {
  const [code, setCode] = useState(""); const [r, setR] = useState<V | null | undefined>(undefined); const [err, setErr] = useState(""); const [dc, setDc] = useState<D | null | undefined>(undefined);
  async function go(c: string) { setErr(""); const { data, error } = await supabase.rpc("verify_certificate", { c }); if (error) { setErr("Could not check right now. Try again."); setR(undefined); } else setR((data as V[])[0] ?? null); }
  async function goDoc(num: string) { setErr(""); const { data, error } = await supabase.rpc("verify_document", { num }); if (error) { setErr("Could not check right now. Try again."); setDc(undefined); } else setDc((data as D[])[0] ?? null); }
  useEffect(() => { const q = new URLSearchParams(location.search); const c = q.get("code"); const dnum = q.get("doc"); if (dnum) { setCode(dnum); goDoc(dnum); } else if (c) { setCode(c); go(c); } }, []);
  return (<PublicShell page="verify"><h1>Verify a certificate or document</h1>
    <p className="sub">Confirm that a partner is authorised by EarthLabs. Enter the certificate number or scan its QR code.</p>
    <div className="row" style={{ marginBottom: 12, alignItems: "flex-end" }}><div style={{ flex: "1 1 260px", maxWidth: 360 }}><Field label="Certificate or document number"><input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Certificate number" /></Field></div><div className="field"><button className="btn pri" onClick={() => { setDc(undefined); setR(undefined); /^(ELI|ELPI|ELDC)\//i.test(code.trim()) ? goDoc(code) : go(code); }}>Verify</button></div></div>
    {err && <Msg kind="bad">{err}</Msg>}
    {dc === null && <Msg kind="bad"><b>Not found.</b> This document number is not in the EarthLabs register. Treat the document as unverified and contact EarthLabs.</Msg>}
    {dc && <div className="card"><div className="row"><span style={{ fontSize: 30 }}>✅</span><div><h2>Genuine EarthLabs document</h2></div></div>
      <table className="t" style={{ marginTop: 8 }}><tbody><tr><td>Document</td><td><b>{dc.kind}</b></td></tr><tr><td>Number</td><td>{dc.number}</td></tr><tr><td>Issued</td><td>{when(dc.issued_on)}</td></tr>{dc.amount != null && <tr><td>Amount</td><td>₹{Number(dc.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>}<tr><td>Issued by</td><td>{dc.issuer}</td></tr></tbody></table>
      <p className="mini">Customer details are never shown on this page.</p></div>}
    {r === null && <Msg kind="bad"><b>Not found.</b> This certificate number is not in the EarthLabs register. Treat the certificate as unverified and contact EarthLabs.</Msg>}
    {r && <div className="card"><div className="row"><span style={{ fontSize: 30 }}>{r.valid ? "✅" : "⚠️"}</span><div><h2>{r.valid ? "Authentic EarthLabs partner certificate" : "Certificate found, not valid (revoked, expired or partner not active)"}</h2></div></div>
      <table className="t" style={{ marginTop: 8 }}><tbody><tr><td>Business</td><td><b>{r.partner_name}</b></td></tr><tr><td>Authorised as</td><td>{r.type_name}</td></tr><tr><td>Territory</td><td>{r.district}, Gujarat</td></tr><tr><td>Partner ID</td><td>{r.partner_id}</td></tr>{r.cert_no && <tr><td>Certificate no.</td><td>{r.cert_no}</td></tr>}<tr><td>Issued</td><td>{when(r.issued_at)}</td></tr></tbody></table>
      <p className="mini">Contact details, prices and agreement terms are never shown on this page.</p></div>}
  </PublicShell>);
}
