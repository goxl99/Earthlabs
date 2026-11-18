"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DISTRICTS, Field, Msg } from "@/components/ui";

type PType = { code: string; name: string };
const BLURB: Record<string, string> = { DLR: "Sell EarthLabs to workshops, garages and shops in your area.", DST: "Stock and supply dealers across your district." };

export default function Register() {
  const [types, setTypes] = useState<PType[]>([]); const [f, setF] = useState({ t: "", biz: "", contact: "", ph: "", mail: "", dist: "Vadodara", gst: "", exp: "", area: "" });
  const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("partner_types").select("code,name").eq("registration_open", true).order("level").then(({ data }) => { const d = (data as PType[]) ?? []; setTypes(d); if (d[0]) setF((x) => ({ ...x, t: d[0].code })); }); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setMsg(null); setBusy(true);
    const { data, error } = await supabase.rpc("submit_application", { t: f.t, biz: f.biz, contact: f.contact, ph: f.ph, mail: f.mail, st: "Gujarat", dist: f.dist, gst: f.gst, ans: { experience_years: f.exp, area_of_operation: f.area } });
    setBusy(false);
    if (error) setMsg({ k: "bad", t: error.message }); else setMsg({ k: "ok", t: `Application received. Your reference is ${data}. Keep it with your e-mail to track progress.` });
  }
  return (<main style={{ maxWidth: 640, margin: "6vh auto", padding: 16 }}>
    <h1>Become an EarthLabs partner</h1><p>Apply online. Our team reviews every application and visits shortlisted partners.</p>
    <div className="card">
      {types.length === 0 && <Msg>Registration is not open right now.</Msg>}
      <Field label="I want to become"><select value={f.t} onChange={set("t")} style={{ width: "100%", padding: 10, margin: "4px 0 12px" }}>{types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
      {BLURB[f.t] && <p style={{ marginTop: -6 }}>{BLURB[f.t]}</p>}
      <Field label="Business name"><input value={f.biz} onChange={set("biz")} /></Field>
      <Field label="Contact person"><input value={f.contact} onChange={set("contact")} /></Field>
      <Field label="Mobile"><input value={f.ph} onChange={set("ph")} inputMode="tel" /></Field>
      <Field label="E-mail"><input type="email" value={f.mail} onChange={set("mail")} /></Field>
      <Field label="District"><select value={f.dist} onChange={set("dist")} style={{ width: "100%", padding: 10, margin: "4px 0 12px" }}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
      <Field label="GSTIN (if you have one)"><input value={f.gst} onChange={set("gst")} /></Field>
      <Field label="Years in business"><input value={f.exp} onChange={set("exp")} inputMode="numeric" /></Field>
      <Field label="Areas you serve"><input value={f.area} onChange={set("area")} /></Field>
      <button className="btn" disabled={busy || !f.t} onClick={submit}>{busy ? "Sending…" : "Submit application"}</button>
      {msg && <div style={{ marginTop: 12 }}><Msg kind={msg.k}>{msg.t}</Msg></div>}
    </div>
    <p><a href="../track/">Track an application</a> · <a href="../">Partner sign-in</a></p></main>);
}
