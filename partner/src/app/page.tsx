"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, configured } from "@/lib/supabase";
import { markPartner, isKnownPartner } from "@/lib/visitor";
import { callFn } from "@/lib/fn";
import { Hero, Journey, PathCards, PublicTop } from "@/components/Public";

const nextUrl = () => { const n = new URLSearchParams(location.search).get("next") || ""; return /^\/[a-z0-9\-\/]*$/i.test(n) && !n.startsWith("//") ? "." + n : "./dashboard/"; };
export default function Home() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [mode, setMode] = useState<"in" | "forgot">("in");
  const [known, setKnown] = useState(false);
  useEffect(() => { setKnown(isKnownPartner()); if (configured) supabase.auth.getUser().then(({ data }) => { if (data.user) { markPartner(); location.href = nextUrl(); } }); }, []);
  async function go() {
    setMsg("");
    if (mode === "forgot") { const r = await callFn("forgot-password", { email: email.trim() }); setMsg(r.ok ? "If this e-mail has a login, we have sent a link to reset the password. Please check your inbox." : r.error ?? "Could not send the e-mail."); return; }
    const r = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (r.error) { const m = r.error.message.toLowerCase(); setMsg(m.includes("invalid login") ? "E-mail or password is not correct. Use the login ID and password we e-mailed when your application was approved, or choose Forgot password." : m.includes("rate limit") ? "Too many attempts. Please wait a few minutes and try again." : r.error.message); return; }
    markPartner(); await supabase.rpc("log_login", { dev: navigator.userAgent });
    location.href = r.data.user?.user_metadata?.must_change_password ? "./change-password/" : nextUrl();
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
      <h2>{mode === "in" ? "Partner sign-in" : "Reset your password"}</h2>
      {!configured && <div className="note">Supabase is not configured yet (see .env.example).</div>}
      <label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === "in" && <><label htmlFor="p">Password</label><input id="p" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} /></>}
      <button className="btn" onClick={go}>{mode === "in" ? "Sign in" : "E-mail me a reset link"}</button>
      <p className="mini"><a href="#" onClick={(e) => { e.preventDefault(); setMsg(""); setMode(mode === "in" ? "forgot" : "in"); }}>{mode === "in" ? "Forgot password?" : "Back to sign in"}</a> · <Link href="./verify/">Verify a certificate</Link></p>
      {msg && <div className="note">{msg}</div>}
    </section>
  </div>);
}
