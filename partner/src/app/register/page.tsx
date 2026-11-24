"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PublicShell from "@/components/PublicShell";
import { DISTRICTS, Field, Msg, Steps } from "@/components/ui";

type PType = { code: string; name: string };
const ICON: Record<string, string> = { DLR: "🏪", DST: "🚚", INS: "🏢" };
const BLURB: Record<string, string> = { DLR: "Sell EarthLabs herbal hand wash in your district. Non-exclusive to start.", DST: "Cover a cluster of 2–3 districts and build a dealer network.", INS: "Supply EarthLabs to fleets, factories and institutions." };
// Documents are asked for after the first review (from the tracking page), so the wizard has no upload step.
const STEPS = ["Account", "Business", "Location", "Review"];

export default function Register() {
  const [types, setTypes] = useState<PType[]>([]); const [step, setStep] = useState(0); const [agree, setAgree] = useState(false);
  const [f, setF] = useState({ t: "", biz: "", contact: "", ph: "", mail: "", dist: "Vadodara", gst: "", exp: "", area: "" });
  const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [busy, setBusy] = useState(false); const [chosen, setChosen] = useState(false);
  useEffect(() => { supabase.from("partner_types").select("code,name").eq("registration_open", true).order("level").then(({ data }) => { const d = (data as PType[]) ?? []; setTypes(d); const want = new URLSearchParams(location.search).get("type"); const pick = d.find((x) => x.code === want); if (pick) { setF((x) => ({ ...x, t: pick.code })); setChosen(true); } }); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const T = types.find((x) => x.code === f.t);
  function next() {
    setMsg(null);
    if (step === 0 && (!f.biz || !f.contact || !f.ph || !f.mail)) { setMsg({ k: "bad", t: "Please fill all four fields." }); return; }
    setStep(step + 1);
  }
  async function submit() {
    setMsg(null); if (!agree) { setMsg({ k: "bad", t: "Please tick the confirmation." }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_application", { t: f.t, biz: f.biz, contact: f.contact, ph: f.ph, mail: f.mail, st: "Gujarat", dist: f.dist, gst: f.gst, ans: { experience_years: f.exp, area_of_operation: f.area } });
    setBusy(false);
    if (error) setMsg({ k: "bad", t: error.message }); else setMsg({ k: "ok", t: `Application received. Your reference is ${data}. Keep it with your e-mail to track progress.` });
  }
  if (!chosen || !T) return (<PublicShell page="register"><h1>Register</h1>
    {types.length === 0 ? <Msg>Registration is not open right now.</Msg> :
      <div className="grid g3" style={{ marginTop: 10 }}>{types.map((r) => <div className="card" key={r.code}><div style={{ fontSize: 26 }}>{ICON[r.code] ?? "🤝"}</div><b>Become an {r.name}</b><p className="mini">{BLURB[r.code] ?? "Apply online. Our team reviews every application."}</p><button className="btn pri" onClick={() => { setF({ ...f, t: r.code }); setChosen(true); }}>Start</button></div>)}</div>}
  </PublicShell>);
  const done = msg?.k === "ok";
  return (<PublicShell page="register"><h1>Become an {T.name}</h1><Steps items={STEPS} current={done ? STEPS.length : step} />
    <div className="card">
      {step === 0 && <div className="frm2"><Field label="Business name"><input value={f.biz} onChange={set("biz")} /></Field><Field label="Contact person"><input value={f.contact} onChange={set("contact")} /></Field><Field label="Mobile number"><input value={f.ph} onChange={set("ph")} inputMode="tel" placeholder="+91" /></Field><Field label="Email"><input type="email" value={f.mail} onChange={set("mail")} /></Field></div>}
      {step === 1 && <><h3>{T.name}</h3><div className="frm2" style={{ marginTop: 8 }}><Field label="GSTIN (if you have one)"><input value={f.gst} onChange={set("gst")} /></Field><Field label="Years in business"><input value={f.exp} onChange={set("exp")} inputMode="numeric" /></Field><Field label="Areas you serve"><input value={f.area} onChange={set("area")} /></Field></div>
        <Msg>Exclusive rights are earned through performance. Everyone starts non-exclusive unless management decides otherwise.</Msg></>}
      {step === 2 && <div className="frm2"><Field label="Preferred district"><select value={f.dist} onChange={set("dist")}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field></div>}
      {step === 3 && <><table className="t"><tbody><tr><td>Type</td><td>{T.name}</td></tr><tr><td>Business</td><td>{f.biz}</td></tr><tr><td>Contact</td><td>{f.contact} · {f.ph} · {f.mail}</td></tr><tr><td>Location</td><td>{f.dist}, Gujarat</td></tr><tr><td>Business details</td><td>{[f.gst && `GSTIN ${f.gst}`, f.exp && `${f.exp} yrs`, f.area].filter(Boolean).join(" · ") || "—"}</td></tr></tbody></table>
        <label className="row" style={{ gap: 6, marginTop: 10 }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: "auto", margin: 0 }} /> I confirm the details are correct and understand that registration does not authorise trading</label>
        <p className="mini">After the first review we will e-mail you to upload your documents from the tracking page.</p></>}
      {msg && <div style={{ marginTop: 12 }}><Msg kind={msg.k}>{msg.t}</Msg></div>}
    </div>
    {!done && <div className="row" style={{ marginTop: 10 }}>{step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>Back</button> : <button className="btn" onClick={() => setChosen(false)}>Change type</button>}<div className="sp" />
      {step < 3 ? <button className="btn pri" onClick={next}>Continue</button> : <button className="btn pri" disabled={busy || !f.t} onClick={submit}>{busy ? "Sending…" : "Submit application"}</button>}</div>}
  </PublicShell>);
}
