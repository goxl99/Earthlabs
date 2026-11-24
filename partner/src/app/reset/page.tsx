"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Msg } from "@/components/ui";
import { PublicTop } from "@/components/Public";

export default function Reset() {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [msg, setMsg] = useState<{ k: "ok" | "bad"; t: string } | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => {
    const th = new URLSearchParams(location.search).get("token_hash");
    if (!th) { setMsg({ k: "bad", t: "This reset link is not valid. Please ask for a new one from the sign-in page." }); return; }
    supabase.auth.verifyOtp({ token_hash: th, type: "recovery" }).then(({ error }) => { if (error) setMsg({ k: "bad", t: "This link has expired or was already used. Please ask for a new one from the sign-in page." }); else setReady(true); });
  }, []);
  async function save() {
    if (a.length < 10 || !/[A-Za-z]/.test(a) || !/[0-9]/.test(a)) { setMsg({ k: "bad", t: "Use at least 10 characters, with letters and numbers." }); return; }
    if (a !== b) { setMsg({ k: "bad", t: "The two passwords do not match." }); return; }
    const { error } = await supabase.auth.updateUser({ password: a, data: { must_change_password: false } });
    if (error) setMsg({ k: "bad", t: error.message }); else { setMsg({ k: "ok", t: "Password changed. Opening your dashboard…" }); setTimeout(() => { location.href = "../dashboard/"; }, 900); }
  }
  return (<div className="pub"><PublicTop base="../" /><div className="wiz"><h1>Reset your password</h1>
    <div className="card">{ready && <><Field label="New password"><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field><Field label="Repeat new password"><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field><button className="btn" onClick={save}>Save password</button></>}
      {msg && <div style={{ marginTop: 12 }}><Msg kind={msg.k}>{msg.t}</Msg></div>}</div><p className="mini"><a href="../">Back to sign in</a></p></div></div>);
}
