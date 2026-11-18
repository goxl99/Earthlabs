"use client";
import { useState } from "react";
import { supabase, configured } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [mode, setMode] = useState<"in" | "up">("in");
  async function go() {
    setMsg("");
    const r = mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw });
    if (r.error) setMsg(r.error.message); else if (mode === "up") setMsg("Account created. EarthLabs will activate it, then you can sign in."); else location.href = "./dashboard/";
  }
  return (
    <main style={{ maxWidth: 420, margin: "10vh auto", padding: 16 }}>
      <h1>EarthLabs Partner Portal</h1>
      <p>Orders, pricing, agreements and payments for EarthLabs partners.</p>
      <div className="card">
        {!configured && <div className="note">Supabase is not configured yet (see .env.example).</div>}
        <label htmlFor="e">Email</label><input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="p">Password</label><input id="p" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn" onClick={go}>{mode === "in" ? "Sign in" : "Create account"}</button>
        <p><a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>{mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}</a></p>
        {msg && <div className="note">{msg}</div>}
      </div>
      <p><a href="./register/">Become a partner</a> · <a href="./track/">Track an application</a></p>
    </main>
  );
}
