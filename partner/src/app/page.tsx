"use client";
import { useEffect, useState } from "react";
import { supabase, configured } from "@/lib/supabase";

type PType = { code: string; name: string };
const BLURB: Record<string, string> = {
  DLR: "Sell EarthLabs to workshops, garages and shops in your area. Fixed partner prices, schemes and a certificate you can display.",
  DST: "Stock and supply dealers across your district with exclusive territory rights and a growth ladder.",
  INS: "Supply EarthLabs to fleets, factories and institutions. Application is reviewed case by case.",
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
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "5vh 16px" }}>
      <header><div className="brand" style={{ padding: 0 }}>EarthLabs</div>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>Partner with EarthLabs</h1>
        <p style={{ fontSize: 18, maxWidth: 640 }}>Orders, partner prices, agreements and payments for EarthLabs dealers and distributors, in one place.</p></header>
      <section aria-label="Who can apply" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, margin: "24px 0" }}>
        {types.map((t) => (<div className="card" key={t.code}><h2 style={{ marginTop: 0 }}>{t.name}</h2><p>{BLURB[t.code] ?? "Apply online. Our team reviews every application."}</p><a className="btn" style={{ display: "inline-block", textDecoration: "none" }} href={`./register/?type=${t.code}`}>Apply as {t.name.replace("Authorized ", "").toLowerCase()}</a></div>))}
        {configured && types.length === 0 && <div className="card">Partner registration is not open right now. Please check back soon.</div>}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        <div className="card"><h2 style={{ marginTop: 0 }}>How it works</h2><ol><li>Apply online. We review and may visit your premises.</li><li>On approval you get a permanent Partner ID for life.</li><li>Sign the agreement. Your partner certificate is issued with a QR code anyone can verify.</li><li>Order at your own partner prices. Orders ship after payment is confirmed.</li></ol>
          <p><a href="./track/">Track an application</a> · <a href="./verify/">Verify a certificate</a></p></div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{mode === "in" ? "Partner sign-in" : "Create account"}</h2>
          {!configured && <div className="note">Supabase is not configured yet (see .env.example).</div>}
          <label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="p">Password</label><input id="p" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn" onClick={go}>{mode === "in" ? "Sign in" : "Create account"}</button>
          <p><a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>{mode === "in" ? "Approved partner without a login? Create an account" : "Have an account? Sign in"}</a></p>
          {msg && <div className="note">{msg}</div>}
        </div>
      </section>
    </main>
  );
}
