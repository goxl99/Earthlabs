"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { qrSvg, verifyUrl } from "@/lib/qr";

type V = { valid: boolean; partner_id: string; partner_name: string; type_name: string; district: string; state: string | null; address: string | null; issued_at: string; cert_no: string; company: string; company_address: string; valid_till: string };
const longDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
/** Printable EarthLabs dealership certificate. Opened from the e-mail link or the Agreements page; "Print" saves it as a PDF. */
export default function Certificate() {
  const [v, setV] = useState<V | null | undefined>(undefined); const [qr, setQr] = useState(""); const [code, setCode] = useState("");
  useEffect(() => {
    const c = new URLSearchParams(location.search).get("code") ?? ""; setCode(c);
    if (!c) { setV(null); return; }
    supabase.rpc("verify_certificate", { c }).then(async ({ data }) => {
      const r = ((data as V[] | null) ?? [])[0] ?? null; setV(r);
      if (r) setQr(await qrSvg(verifyUrl(location.origin, location.pathname.replace(/\/certificate\/?$/, ""), c)));
    });
  }, []);
  if (v === undefined) return <main style={{ padding: 40 }}>Loading…</main>;
  if (!v || !v.valid) return <main style={{ padding: 40, fontFamily: "system-ui" }}><h1>Certificate not available</h1><p>{v ? "This certificate has been revoked, has expired, or the partner is not active." : "No certificate was found for this link."}</p><p><a href="../verify/">Verify a certificate</a></p></main>;
  const kind = v.type_name.replace(/^Authori[sz]ed\s+/i, "");
  return (<>
    <style>{`
      @page { size: A4 landscape; margin: 0 }
      body { background: #e9eeee }
      .cert-wrap { display: flex; flex-direction: column; align-items: center; padding: 18px }
      .cert { width: 297mm; height: 210mm; background: #fffdf7; box-sizing: border-box; padding: 9mm; position: relative; font-family: Georgia, 'Times New Roman', serif; color: #1c2b2b; box-shadow: 0 4px 24px rgba(0,0,0,.18) }
      .cert .o { height: 100%; border: 2.2mm solid #13595a; padding: 2mm; box-sizing: border-box }
      .cert .i { height: 100%; border: .5mm solid #b8923a; box-sizing: border-box; padding: 7mm 14mm; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative }
      .cert img.logo { height: 24mm; margin-top: 1mm }
      .cert .co { letter-spacing: .28em; font-size: 4.1mm; color: #13595a; margin-top: 2mm; font-weight: 700; font-family: system-ui, sans-serif }
      .cert h1 { font-size: 11.5mm; margin: 5mm 0 1mm; color: #13595a; letter-spacing: .06em; font-weight: 700 }
      .cert .sub { font-size: 4.2mm; color: #b8923a; letter-spacing: .3em; font-family: system-ui, sans-serif; margin-bottom: 4mm }
      .cert .nm { font-size: 11mm; font-weight: 700; margin: 1.5mm 0; border-bottom: .4mm solid #b8923a; padding: 0 12mm 1.5mm }
      .cert p { margin: 1.6mm 0; font-size: 4.6mm; line-height: 1.5 }
      .cert .meta { display: flex; gap: 16mm; margin-top: 4mm; font-family: system-ui, sans-serif; font-size: 3.7mm }
      .cert .meta b { display: block; font-size: 4.4mm; color: #13595a; margin-top: .6mm }
      .cert .bot { position: absolute; left: 14mm; right: 14mm; bottom: 7mm; display: flex; justify-content: center; align-items: flex-end; font-family: system-ui, sans-serif; font-size: 3.4mm }
      .cert .sig { width: 62mm; text-align: center } .cert .sig i { display: block; border-top: .3mm solid #1c2b2b; padding-top: 1.2mm; font-style: normal }
      .cert .qr { width: 27mm; text-align: center } .cert .qr svg { width: 27mm; height: 27mm; display: block }
      .cert .addr { font-size: 3.2mm; color: #55625f; max-width: 105mm; text-align: center }
      .cbar { margin: 0 0 14px; display: flex; gap: 10px; font-family: system-ui, sans-serif }
      .cbar button, .cbar a { background: #13595a !important; color: #fff !important; border: 0; border-radius: 6px; padding: 9px 16px; font-size: 14px; line-height: 1.2; height: auto; text-decoration: none; cursor: pointer; display: inline-block }
      @media print { body { background: #fff } .cert-wrap { padding: 0 } .cert { box-shadow: none } .cbar { display: none } }
    `}</style>
    <div className="cert-wrap">
      <div className="cbar"><button onClick={() => window.print()}>Print / save as PDF</button><a href={`../verify/?code=${encodeURIComponent(code)}`}>Verification page</a></div>
      <div className="cert"><div className="o"><div className="i">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="../logo.png" alt="EarthLabs" />
        <div className="co">{(v.company || "EarthLabs Innovative Products Pvt. Ltd.").toUpperCase()}</div>
        <h1>Certificate of Authorisation</h1>
        <div className="sub">AUTHORISED {kind.toUpperCase()}</div>
        <p>This is to certify that</p>
        <div className="nm">{v.partner_name}</div>
        <p>is appointed as an <b>{v.type_name}</b> of {v.company || "EarthLabs Innovative Products Pvt. Ltd."} for <b>{v.district}{v.state ? `, ${v.state}` : ""}</b>,<br />to sell EarthLabs herbal and eco-conscious hand wash and cleaning products under the terms of the signed Memorandum of Understanding.</p>
        <div className="meta"><div>Partner ID<b>{v.partner_id}</b></div><div>Certificate No.<b>{v.cert_no}</b></div><div>Date of issue<b>{longDate(v.issued_at)}</b></div><div>Valid till<b>{longDate(v.valid_till)}</b></div></div>
        <div className="bot">
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      </div></div></div>
      <p style={{ fontFamily: "system-ui", fontSize: 12, color: "#55625f" }}>Scan the QR code or visit the verification page to confirm this certificate is genuine.</p>
    </div></>);
}
