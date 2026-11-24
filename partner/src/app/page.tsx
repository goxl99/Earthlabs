"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, configured } from "@/lib/supabase";
import PublicShell from "@/components/PublicShell";
import { DISTRICTS } from "@/components/ui";

type PType = { code: string; name: string };
const ICON: Record<string, string> = { DLR: "🏪", DST: "🚚", INS: "🏢" };
const BLURB: Record<string, string> = {
  DLR: "Sell EarthLabs herbal hand wash in your district. Non-exclusive to start.",
  DST: "Cover a cluster of 2–3 districts and build a dealer network.",
  INS: "Supply EarthLabs to fleets, factories and institutions. Application is reviewed case by case.",
};
const POINTS: Record<string, string[]> = {
  DLR: ["Non-exclusive district authorisation", "Brand kit, samples and price list", "Monthly targets with a clear score", "Earn your way to Distributor"],
  DST: ["A cluster of 2–3 districts", "Your own authorised dealer network", "Priority supply and better margin slab", "Exclusive rights earned on performance"],
};
export default function Home() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [mode, setMode] = useState<"in" | "up">("in");
  const [types, setTypes] = useState<PType[]>([]);
  useEffect(() => { if (configured) supabase.from("partner_types").select("code,name").eq("registration_open", true).order("level").then(({ data }) => setTypes((data as PType[]) ?? [])); }, []);
  async function go() {
    setMsg("");
    const r = mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw });
    if (r.error) setMsg(r.error.message); else if (mode === "up") setMsg("Account created. EarthLabs will activate it, then you can sign in."); else location.href = "./dashboard/";
  }
  return (
    <PublicShell page="home">
      <div className="hero2">
        <div className="eyebrow">EARTHLABS · PARTNER NETWORK</div>
        <h1>Grow with the brand that heals, not harms.</h1>
        <p>Rooted in Indian heritage and designed for global markets. Join EarthLabs as an authorised partner and build a business on herbal hand wash and eco-cleaning products.</p>
        <div className="row" style={{ marginTop: 22 }}>
          <Link className="btn gold-fill" href="/register/">Register as a partner</Link>
          <Link className="btn ghost" href="/track/">Track my application</Link>
          <Link className="btn ghost" href="/verify/">Verify a certificate</Link>
        </div>
        <div className="hero-stats"><div><b>{DISTRICTS.length}</b><span>districts mapped</span></div><div><b>5</b><span>growth steps</span></div><div><b>100</b><span>point partner score</span></div></div>
      </div>
      <div className="sec-h"><div className="eyebrow dk">CHOOSE YOUR PATH</div><h2>How would you like to work with us?</h2></div>
      <div className={`grid ${types.length > 2 ? "g3" : "g2"} paths`}>
        {types.map((t, i) => (
          <div className="path" key={t.code}><div className="path-n">0{i + 1}</div><div className="path-ic">{ICON[t.code] ?? "🤝"}</div>
            <h2>{t.name.replace("Authorized ", "")}</h2><p className="mini">{BLURB[t.code] ?? "Apply online. Our team reviews every application."}</p>
            {POINTS[t.code] && <ul className="pts">{POINTS[t.code].map((x) => <li key={x}>{x}</li>)}</ul>}
            <Link className="btn pri" href={`/register/?type=${t.code}`}>Start registration →</Link></div>
        ))}
        {configured && types.length === 0 && <div className="card">Partner registration is not open right now. Please check back soon.</div>}
      </div>
      <div className="journey"><div className="eyebrow dk">YOUR JOURNEY</div>
        <div className="jrow">{["Register", "Verification", "Approval", "Agreement & certificate", "Start trading"].flatMap((x, i) => [i > 0 ? <div className="jline" key={`l${i}`} /> : null, <div className="jst" key={x}><i>{i + 1}</i><span>{x}</span></div>])}</div></div>
      <p className="mini" style={{ marginTop: 14, textAlign: "center" }}>Registration does not authorise trading. Every application is verified and approved by EarthLabs management.</p>
      <div id="signin" className="card" style={{ maxWidth: 460, margin: "40px auto 0" }}>
        <h2 style={{ marginBottom: 10 }}>{mode === "in" ? "Partner sign-in" : "Create account"}</h2>
        {!configured && <div className="note">Supabase is not configured yet (see .env.example).</div>}
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <button className="btn pri" onClick={go}>{mode === "in" ? "Sign in" : "Create account"}</button>
        <p><a href="#signin" className="lk" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>{mode === "in" ? "Approved partner without a login? Create an account" : "Have an account? Sign in"}</a></p>
        {msg && <div className="note">{msg}</div>}
      </div>
    </PublicShell>
  );
}
