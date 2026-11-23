"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { callFn } from "@/lib/fn";
import { DISTRICTS, Field, Msg } from "@/components/ui";
import { PATHS, PublicTop } from "@/components/Public";
import { markPartner } from "@/lib/visitor";
import PotentialCard from "@/components/Potential";
import { REG_Q, REG_DOCS, yesnoOpts, exclOpts } from "@/lib/regQuestions";

type PType = { code: string; name: string };
const STEPS = ["Partner type", "Account", "Business", "Location", "Review"];
type F = Record<string, string>;
const need = (f: F, step: number, verified: boolean): string => {
  if (step === 1) return !f.biz.trim() ? "Enter your business name." : !f.contact.trim() ? "Enter the contact person." : !/^[0-9+\s-]{10,15}$/.test(f.ph.trim()) ? "Enter a valid mobile number." : !/^\S+@\S+\.\S+$/.test(f.mail.trim()) ? "Enter a valid e-mail." : !verified ? "Verify your e-mail with the code we send you." : "";
  if (step === 2) { const miss = (REG_Q[f.t] ?? []).find((q) => q[2] !== "yesno" && q[2] !== "excl" && !(f["q_" + q[0]] ?? "").trim()); return miss ? "Please answer: " + miss[1] : ""; }
  if (step === 3) return !f.addr.trim() ? "Enter your business address." : !f.dist ? "Choose your preferred district." : "";
  if (step === 4) return f.agree !== "1" ? "Please tick the confirmation." : "";
  return "";
};

export default function Register() {
  const [types, setTypes] = useState<PType[]>([]); const [step, setStep] = useState(0); const [err, setErr] = useState("");
  const [f, setF] = useState<F>({ t: "", biz: "", contact: "", ph: "", mail: "", dist: "Vadodara", gst: "", addr: "", area: "", agree: "" });
  const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false); const [code, setCode] = useState(""); const [verified, setVerified] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { supabase.from("partner_types").select("code,name").eq("registration_open", true).order("level").then(({ data }) => { const d = (data as PType[]) ?? []; setTypes(d); const want = new URLSearchParams(location.search).get("type"); const pick = d.find((x) => x.code === want); if (pick) { setF((x) => ({ ...x, t: pick.code })); setStep(1); } else if (d.length === 1) setF((x) => ({ ...x, t: d[0].code })); }); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const path = PATHS.find((p) => p.code === f.t); const tname = types.find((t) => t.code === f.t)?.name ?? "";
  const mail = f.mail.trim().toLowerCase(); const isVerified = verified === mail && mail !== "";
  const qs = REG_Q[f.t] ?? []; const docs = REG_DOCS[f.t] ?? [];
  function next() { const e = need(f, step, isVerified); setErr(e); if (!e) setStep(step + 1); }
  async function sendCode() {
    setNote(""); setErr(""); if (!/^\S+@\S+\.\S+$/.test(mail)) { setErr("Enter a valid e-mail first."); return; }
    setBusy(true); const r = await callFn("email-code", { action: "send", email: mail }); setBusy(false);
    if (r.ok) { setSent(true); setNote("We e-mailed a 6-digit code to " + mail + ". It is valid for 10 minutes."); } else setErr(r.error ?? "Could not send the code.");
  }
  async function checkCode() {
    setNote(""); setErr(""); setBusy(true); const r = await callFn("email-code", { action: "verify", email: mail, code }); setBusy(false);
    if (r.ok) { setVerified(mail); setNote("E-mail verified."); } else setErr(r.error ?? "Could not verify the code.");
  }
  async function submit() {
    const e = need(f, 4, isVerified); setErr(e); if (e) return;
    setMsg(null); setBusy(true);
    const ans: Record<string, string> = { address: f.addr, other_areas: f.area };
    qs.forEach((q) => { ans[q[0]] = f["q_" + q[0]] ?? (q[2] === "yesno" ? "Yes" : q[2] === "excl" ? "Non-exclusive" : ""); });
    const { data, error } = await supabase.rpc("submit_application", { t: f.t, biz: f.biz, contact: f.contact, ph: f.ph, mail, st: "Gujarat", dist: f.dist, gst: f.gst, ans });
    setBusy(false);
    if (error) { setMsg({ k: "bad", t: error.message }); return; }
    markPartner(); const t = await supabase.rpc("track_application", { ref: String(data), mail }); const no = (t.data as { ref_no?: string }[] | null)?.[0]?.ref_no || String(data);
    setMsg({ k: "ok", t: `Application received. Your reference number is ${no}. We have e-mailed it to ${mail} together with your registered mobile ${f.ph}. You will get another e-mail whenever the status changes, and your login ID and password once EarthLabs approves your application.` }); setStep(5);
  }
  return (<div className="pub"><PublicTop base="../" /><div className="wiz">
    <div className="eyebrow dk">PARTNER REGISTRATION</div><h1>{tname ? `Become an ${tname}` : "Become an EarthLabs partner"}</h1>
    <p className="sub">Apply online. Our team reviews every application and may visit shortlisted partners. Registration does not authorise trading. One e-mail address can apply once.</p>
    {step < 5 && <div className="steps" aria-label="Progress">{STEPS.map((s, i) => <div key={s} className={"step " + (i < step ? "done" : i === step ? "cur" : "")} aria-current={i === step ? "step" : undefined}><i>{i < step ? "✓" : i + 1}</i>{s}</div>)}</div>}
    <div className="card">
      {types.length === 0 && <Msg>Registration is not open right now.</Msg>}
      {step === 0 && <><h2>What would you like to become?</h2><div className="grid g2" style={{ marginTop: 12 }}>{types.map((t) => { const p = PATHS.find((x) => x.code === t.code); return (<button key={t.code} className="path" style={{ textAlign: "left", cursor: "pointer", font: "inherit", borderColor: f.t === t.code ? "var(--teal)" : undefined }} aria-pressed={f.t === t.code} onClick={() => { setF({ ...f, t: t.code }); setStep(1); }}><div className="path-ic" aria-hidden="true">{p?.ic ?? "🏷️"}</div><h2 style={{ fontSize: 20 }}>{t.name}</h2><p className="mini">{p?.blurb ?? "Our team reviews every application."}</p></button>); })}</div></>}
      {step === 1 && <><h2>Your account details</h2>{path && <p className="mini">{path.blurb}</p>}
        <div className="frm2"><Field label="Business name"><input value={f.biz} onChange={set("biz")} autoComplete="organization" /></Field><Field label="Contact person"><input value={f.contact} onChange={set("contact")} autoComplete="name" /></Field>
          <Field label="Mobile number"><input value={f.ph} onChange={set("ph")} inputMode="tel" autoComplete="tel" placeholder="+91" /></Field><Field label="E-mail (this will be your login ID)"><input type="email" value={f.mail} onChange={(e) => { set("mail")(e); setSent(false); setNote(""); }} autoComplete="email" /></Field></div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn out" disabled={busy || isVerified} onClick={sendCode}>{sent ? "Send a new code" : "Send verification code"}</button>{isVerified && <b style={{ color: "var(--teal)" }}>✓ E-mail verified</b>}</div>
        {sent && !isVerified && <div className="frm2" style={{ marginTop: 8 }}><Field label="Enter the 6-digit code"><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} /></Field><div style={{ alignSelf: "end" }}><button className="btn" disabled={busy || code.trim().length < 6} onClick={checkCode}>Verify e-mail</button></div></div>}
        {note && <p className="mini">{note}</p>}
        <p className="mini">Our team will confirm your mobile number by phone during verification.</p></>}
      {step === 2 && <><h2>About your business</h2>
        <div className="frm2">{qs.map((q) => <Field key={q[0]} label={q[1]}>{q[2] === "yesno" || q[2] === "excl" ? <select value={f["q_" + q[0]] ?? (q[2] === "yesno" ? "Yes" : "Non-exclusive")} onChange={set("q_" + q[0])}>{(q[2] === "yesno" ? yesnoOpts : exclOpts).map((o) => <option key={o}>{o}</option>)}</select> : <input type={q[2] === "number" ? "number" : "text"} value={f["q_" + q[0]] ?? ""} onChange={set("q_" + q[0])} />}</Field>)}
          <Field label="GSTIN (if you have one)"><input value={f.gst} onChange={set("gst")} /></Field></div>
        <p className="mini">Exclusive rights are earned through performance. Everyone starts non-exclusive unless management decides otherwise.</p></>}
      {step === 3 && <><h2>Where will you operate?</h2><Field label="Business address"><textarea rows={2} value={f.addr} onChange={set("addr")} /></Field><Field label="Preferred district"><select value={f.dist} onChange={set("dist")}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field><PotentialCard district={f.dist} /><Field label="Other areas you serve"><input value={f.area} onChange={set("area")} /></Field></>}
      {step === 4 && <><h2>Check and submit</h2><table><tbody>{([["Type", tname], ["Business", f.biz], ["Contact", f.contact], ["Mobile", f.ph], ["E-mail (verified)", mail], ["Address", f.addr], ["District", f.dist], ["GSTIN", f.gst || "—"]] as [string, string][]).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        <h3 style={{ marginTop: 14 }}>Please keep these documents ready</h3><ul className="mini">{docs.map((d) => <li key={d}>{d}</li>)}</ul><p className="mini">Our team will ask for them when your application is verified.</p>
        <label className="row" style={{ gap: 6, marginTop: 10 }}><input type="checkbox" checked={f.agree === "1"} onChange={(e) => setF({ ...f, agree: e.target.checked ? "1" : "" })} /> I confirm the details are correct and understand that registration does not authorise trading</label></>}
      {step === 5 && msg && <><h2>Thank you</h2><Msg kind={msg.k}>{msg.t}</Msg><p><Link className="btn" href="../track/">Track my application</Link></p></>}
      {err && <Msg kind="bad">{err}</Msg>}
      {msg && step < 5 && <Msg kind={msg.k}>{msg.t}</Msg>}
      {step > 0 && step < 5 && <div className="row" style={{ marginTop: 14 }}><button className="btn out" onClick={() => { setErr(""); setStep(step - 1); }}>Back</button><span className="sp" />{step < 4 ? <button className="btn" onClick={next} disabled={!f.t}>Continue</button> : <button className="btn gold-fill" disabled={busy || !f.t} onClick={submit}>{busy ? "Sending…" : "Submit application"}</button>}</div>}
    </div>
    <p className="mini"><Link href="../become/">What partners get</Link> · <Link href="../track/">Track an application</Link> · <Link href="../">Partner sign-in</Link></p>
  </div></div>);
}
