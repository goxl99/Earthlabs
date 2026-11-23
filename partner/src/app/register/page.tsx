"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DISTRICTS, Field, Msg } from "@/components/ui";
import { PATHS, PublicTop } from "@/components/Public";
import { markPartner } from "@/lib/visitor";
import PotentialCard from "@/components/Potential";

type PType = { code: string; name: string };
const STEPS = ["Partner type", "Business", "Location", "Review"];
const need = (f: Record<string, string>, step: number) => {
  if (step === 1) return !f.biz.trim() ? "Enter your business name." : !f.contact.trim() ? "Enter the contact person." : !/^[0-9+\s-]{10,15}$/.test(f.ph.trim()) ? "Enter a valid mobile number." : !/^\S+@\S+\.\S+$/.test(f.mail.trim()) ? "Enter a valid e-mail." : "";
  return "";
};

export default function Register() {
  const [types, setTypes] = useState<PType[]>([]); const [step, setStep] = useState(0); const [err, setErr] = useState("");
  const [f, setF] = useState({ t: "", biz: "", contact: "", ph: "", mail: "", dist: "Vadodara", gst: "", exp: "", area: "" });
  const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("partner_types").select("code,name").eq("registration_open", true).order("level").then(({ data }) => { const d = (data as PType[]) ?? []; setTypes(d); const want = new URLSearchParams(location.search).get("type"); const pick = d.find((x) => x.code === want); if (pick) { setF((x) => ({ ...x, t: pick.code })); setStep(1); } else if (d.length === 1) setF((x) => ({ ...x, t: d[0].code })); }); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const path = PATHS.find((p) => p.code === f.t); const tname = types.find((t) => t.code === f.t)?.name ?? "";
  function next() { const e = need(f, step); setErr(e); if (!e) setStep(step + 1); }
  async function submit() {
    setMsg(null); setBusy(true);
    const { data, error } = await supabase.rpc("submit_application", { t: f.t, biz: f.biz, contact: f.contact, ph: f.ph, mail: f.mail, st: "Gujarat", dist: f.dist, gst: f.gst, ans: { experience_years: f.exp, area_of_operation: f.area } });
    setBusy(false);
    if (error) setMsg({ k: "bad", t: error.message }); else { markPartner(); setMsg({ k: "ok", t: `Application received. Your reference is ${data}. Keep it with your e-mail to track progress.` }); setStep(4); }
  }
  return (<div className="pub"><PublicTop base="../" /><div className="wiz">
    <div className="eyebrow dk">PARTNER REGISTRATION</div><h1>{tname ? `Become an ${tname}` : "Become an EarthLabs partner"}</h1>
    <p className="sub">Apply online. Our team reviews every application and may visit shortlisted partners. Registration does not authorise trading.</p>
    {step < 4 && <div className="steps" aria-label="Progress">{STEPS.map((s, i) => <div key={s} className={"step " + (i < step ? "done" : i === step ? "cur" : "")} aria-current={i === step ? "step" : undefined}><i>{i < step ? "✓" : i + 1}</i>{s}</div>)}</div>}
    <div className="card">
      {types.length === 0 && <Msg>Registration is not open right now.</Msg>}
      {step === 0 && <><h2>What would you like to become?</h2><div className="grid g2" style={{ marginTop: 12 }}>{types.map((t) => { const p = PATHS.find((x) => x.code === t.code); return (<button key={t.code} className="path" style={{ textAlign: "left", cursor: "pointer", font: "inherit", borderColor: f.t === t.code ? "var(--teal)" : undefined }} aria-pressed={f.t === t.code} onClick={() => { setF({ ...f, t: t.code }); setStep(1); }}><div className="path-ic" aria-hidden="true">{p?.ic ?? "🏷️"}</div><h2 style={{ fontSize: 20 }}>{t.name}</h2><p className="mini">{p?.blurb ?? "Our team reviews every application."}</p></button>); })}</div></>}
      {step === 1 && <><h2>About your business</h2>{path && <p className="mini">{path.blurb}</p>}
        <div className="frm2"><Field label="Business name"><input value={f.biz} onChange={set("biz")} autoComplete="organization" /></Field><Field label="Contact person"><input value={f.contact} onChange={set("contact")} autoComplete="name" /></Field>
          <Field label="Mobile"><input value={f.ph} onChange={set("ph")} inputMode="tel" autoComplete="tel" /></Field><Field label="E-mail"><input type="email" value={f.mail} onChange={set("mail")} autoComplete="email" /></Field>
          <Field label="GSTIN (if you have one)"><input value={f.gst} onChange={set("gst")} /></Field><Field label="Years in business"><input value={f.exp} onChange={set("exp")} inputMode="numeric" /></Field></div></>}
      {step === 2 && <><h2>Where will you operate?</h2><Field label="District"><select value={f.dist} onChange={set("dist")}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field><PotentialCard district={f.dist} /><Field label="Other areas you serve"><input value={f.area} onChange={set("area")} /></Field></>}
      {step === 3 && <><h2>Check and submit</h2><table><tbody>{([["Type", tname], ["Business", f.biz], ["Contact", f.contact], ["Mobile", f.ph], ["E-mail", f.mail], ["GSTIN", f.gst || "—"], ["Years in business", f.exp || "—"], ["District", f.dist], ["Other areas", f.area || "—"]] as [string, string][]).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
        <p className="mini">We will ask for identity and business documents when your application is verified.</p></>}
      {step === 4 && msg && <><h2>Thank you</h2><Msg kind={msg.k}>{msg.t}</Msg><p><Link className="btn" href="../track/">Track my application</Link></p></>}
      {err && <Msg kind="bad">{err}</Msg>}
      {msg && step < 4 && <Msg kind={msg.k}>{msg.t}</Msg>}
      {step > 0 && step < 4 && <div className="row" style={{ marginTop: 14 }}><button className="btn out" onClick={() => { setErr(""); setStep(step - 1); }}>Back</button><span className="sp" />{step < 3 ? <button className="btn" onClick={next} disabled={!f.t}>Continue</button> : <button className="btn gold-fill" disabled={busy || !f.t} onClick={submit}>{busy ? "Sending…" : "Submit application"}</button>}</div>}
    </div>
    <p className="mini"><Link href="../become/">What partners get</Link> · <Link href="../track/">Track an application</Link> · <Link href="../">Partner sign-in</Link></p>
  </div></div>);
}
