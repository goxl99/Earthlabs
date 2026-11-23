"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, configured } from "@/lib/supabase";
import { markPartner, isKnownPartner } from "@/lib/visitor";
import { Hero, Journey, PathCards, PublicTop } from "@/components/Public";

export default function Home() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [mode, setMode] = useState<"in" | "up">("in");
  const [known, setKnown] = useState(false);
  useEffect(() => { setKnown(isKnownPartner()); if (configured) supabase.auth.getUser().then(({ data }) => { if (data.user) { markPartner(); location.href = "./dashboard/"; } }); }, []);
  async function go() {
    setMsg("");
    const r = mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw });
    if (r.error) setMsg(r.error.message); else if (mode === "up") setMsg("Account created. EarthLabs will activate it, then you can sign in."); else { markPartner(); location.href = "./dashboard/"; }
  }
  return (<div className="pub"><PublicTop />
    <Hero eyebrow="EARTHLABS · PARTNER NETWORK" title="Grow with the brand that heals, not harms." stats={[["34", "Districts"], ["5", "Growth steps"], ["100", "Point score"]]}>
      <p>Orders, partner prices, agreements and payments for EarthLabs dealers and distributors, in one place.</p>
      <div className="row" style={{ marginTop: 22 }}>{known ? <a className="btn gold-fill" href="#signin">Partner login</a> : <Link className="btn gold-fill" href="./become/">Become a partner</Link>}{!known && <a className="btn ghost" href="#signin">Partner sign-in</a>}<Link className="btn ghost" href="./track/">Track my application</Link></div>
    </Hero>
    {!known && <><div className="sec-h"><div className="eyebrow dk">CHOOSE YOUR PATH</div><h2>How would you like to work with us?</h2></div>
    <PathCards />
    <Journey /></>}
    <section id="signin" className="card signin" aria-label="Partner sign-in">
      <h2>{mode === "in" ? "Partner sign-in" : "Create account"}</h2>
      {!configured && <div className="note">Supabase is not configured yet (see .env.example).</div>}
      <label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="p">Password</label><input id="p" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button className="btn" onClick={go}>{mode === "in" ? "Sign in" : "Create account"}</button>
      <p className="mini"><a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>{mode === "in" ? "Approved partner without a login? Create an account" : "Have an account? Sign in"}</a> · <Link href="./verify/">Verify a certificate</Link></p>
      {msg && <div className="note">{msg}</div>}
    </section>
  </div>);
}
