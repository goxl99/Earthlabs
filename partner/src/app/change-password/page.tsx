"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Msg } from "@/components/ui";
import { PublicTop } from "@/components/Public";

export default function ChangePassword() {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (!data.user) location.href = "../"; else setReady(true); }); }, []);
  async function save() {
    if (a.length < 10) { setMsg({ k: "bad", t: "Use at least 10 characters." }); return; }
    if (!/[A-Za-z]/.test(a) || !/[0-9]/.test(a)) { setMsg({ k: "bad", t: "Use letters and numbers." }); return; }
    if (a !== b) { setMsg({ k: "bad", t: "The two passwords do not match." }); return; }
    const { error } = await supabase.auth.updateUser({ password: a, data: { must_change_password: false } });
    if (error) setMsg({ k: "bad", t: error.message }); else { setMsg({ k: "ok", t: "Password changed. Opening your dashboard…" }); setTimeout(() => { location.href = "../dashboard/"; }, 900); }
  }
  return (<div className="pub"><PublicTop base="../" /><div className="wiz"><h1>Choose your own password</h1>
    <p className="sub">For your security, please replace the temporary password we e-mailed you.</p>
    <div className="card">{ready && <><Field label="New password"><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Repeat new password"><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field><button className="btn" onClick={save}>Save password</button></>}
      {msg && <div style={{ marginTop: 12 }}><Msg kind={msg.k}>{msg.t}</Msg></div>}</div></div></div>);
}
